import { initial, type State } from '../engine';
import { REDUCED_MOTION, intersect, observersOf, observing, resetMedia, setMedia } from '../test-dom';
import { PogoFigure } from './figure';

class Fine extends PogoFigure {
  static override fidelity = 'live' as const;
  renders = 0;
  protected render(): void {
    this.renders++;
    this.stage.append(document.createElement('svg'));
  }
  motion(): boolean {
    return this.reducedMotion();
  }
  replay(s: State): void {
    this.playFrom(s, 'opening');
  }
}
class Measured extends PogoFigure {
  static override fidelity = 'measured' as const;
  static override source = 'data/table.json';
  protected async render(): Promise<void> {}
}
class MeasuredLc12 extends PogoFigure {
  static override fidelity = 'measured' as const;
  static override source = 'data/v5.json';
  static override game = 'gameLc12' as const;
  protected async render(): Promise<void> {}
}
/** Its game read from an attribute, with a sheet of its own. */
class ByAttribute extends PogoFigure {
  static override fidelity = 'live' as const;
  static override styles = '.stage { outline: 1px solid; }';
  protected override game() {
    return this.getAttribute('rules') === 'lc1-2' ? ('gameLc12' as const) : ('gameA' as const);
  }
  protected override fidelityKind() {
    return this.hasAttribute('measured') ? ('measured' as const) : ('live' as const);
  }
  protected override sourceFile() {
    return 'data/x.json';
  }
  protected render(): void {}
}
class Broken extends PogoFigure {
  protected render(): void {
    throw new Error('no engine');
  }
}
class Rejected extends PogoFigure {
  protected async render(): Promise<void> {
    throw new Error('fetch failed');
  }
}
class Flaky extends PogoFigure {
  calls = 0;
  protected render(): void {
    if (++this.calls > 1) throw new Error('second render failed');
  }
}
/** Renders when the test resolves it, once per call; records the signal it was given. */
class Slow extends PogoFigure {
  calls = 0;
  signals: AbortSignal[] = [];
  release: Array<() => void> = [];
  protected async render(signal: AbortSignal): Promise<void> {
    const n = ++this.calls;
    this.signals.push(signal);
    await new Promise<void>((r) => this.release.push(r));
    const p = document.createElement('p');
    p.textContent = `render ${n}`;
    this.stage.append(p);
  }
}
customElements.define('kit-slow', Slow);
customElements.define('kit-fine', Fine);
customElements.define('kit-flaky', Flaky);
customElements.define('kit-measured', Measured);
customElements.define('kit-broken', Broken);
customElements.define('kit-measured-lc12', MeasuredLc12);
customElements.define('kit-rejected', Rejected);
customElements.define('kit-by-attribute', ByAttribute);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount<T extends PogoFigure>(tag: string, lang = 'fr'): T {
  const wrapper = document.createElement('section');
  wrapper.setAttribute('lang', lang);
  const el = document.createElement(tag) as T;
  el.innerHTML = '<p>Fallback caption.</p>';
  wrapper.append(el);
  document.body.append(wrapper);
  return el;
}

const slot = (el: PogoFigure) => el.shadowRoot!.querySelector('slot')!;
const fidelity = (el: PogoFigure) => el.shadowRoot!.querySelector('.fidelity')!.textContent;

beforeEach(() => {
  document.body.innerHTML = '';
  resetMedia();
});

describe('PogoFigure', () => {
  it('attaches a static frame at connect and renders once, when first visible', async () => {
    const el = mount<Fine>('kit-fine');
    expect(el.shadowRoot).not.toBeNull();
    expect(el.renders).toBe(0);
    expect(slot(el).hidden).toBe(false);
    // Two entries delivered before the first is handled: a browser may queue them.
    const [observer] = observersOf(el);
    observer!.fire(el);
    observer!.fire(el);
    await flush();
    intersect(el);
    await flush();
    expect(el.renders).toBe(1);
    expect(slot(el).hidden).toBe(true);
    expect(el.hasAttribute('data-failed')).toBe(false);
  });

  it('a render() that throws leaves the fallback visible and logs one error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount<Broken>('kit-broken');
    intersect(el);
    await flush();
    expect(el.hasAttribute('data-failed')).toBe(true);
    expect(slot(el).hidden).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('a rejected async render() leaves the fallback visible too', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount<Rejected>('kit-rejected', 'en');
    intersect(el);
    await flush();
    expect(el.hasAttribute('data-failed')).toBe(true);
    expect(slot(el).hidden).toBe(false);
    expect(el.shadowRoot!.querySelector('.failed')!.textContent).toBe('This figure could not be computed.');
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('a figure moved in the page renders afresh, and shows its fallback if that fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount<Flaky>('kit-flaky');
    intersect(el);
    await flush();
    expect(slot(el).hidden).toBe(true);
    document.body.append(el);
    intersect(el);
    await flush();
    expect(el.calls).toBe(2);
    expect(slot(el).hidden).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('a disconnect during a pending render leaves one render on the stage and no stale state', async () => {
    const el = mount<Slow>('kit-slow');
    intersect(el);
    await flush();
    expect(el.calls).toBe(1);
    const parent = el.parentElement!;
    el.remove();
    expect(el.signals[0]!.aborted).toBe(true);
    expect(slot(el).hidden).toBe(false);
    parent.append(el);
    intersect(el);
    await flush();
    // The stale run finishes after the reconnect: it must not show or flip anything.
    el.release[0]!();
    await flush();
    expect(slot(el).hidden).toBe(false);
    expect(el.hasAttribute('data-failed')).toBe(false);
    for (const r of el.release.slice(1)) r();
    await flush();
    await flush();
    expect(el.calls).toBe(2);
    expect([...el.shadowRoot!.querySelectorAll('.stage p')].map((p) => p.textContent)).toEqual(['render 2']);
    expect(slot(el).hidden).toBe(true);
  });

  it('shows the fallback again at disconnect', async () => {
    const el = mount<Fine>('kit-fine');
    intersect(el);
    await flush();
    expect(slot(el).hidden).toBe(true);
    el.remove();
    expect(slot(el).hidden).toBe(false);
  });

  it('ignores an empty lang attribute when looking for the language', () => {
    const el = mount<Fine>('kit-fine', 'fr');
    const inner = document.createElement('div');
    inner.setAttribute('lang', '');
    el.parentElement!.append(inner);
    inner.append(el);
    expect(el.lang).toBe('fr');
  });

  it('ends with the fidelity label, in the language of the closest [lang]', () => {
    const fr = mount<Fine>('kit-fine', 'fr-FR');
    const en = mount<Fine>('kit-fine', 'en');
    expect(fr.lang).toBe('fr');
    expect(en.lang).toBe('en');
    expect(fidelity(fr)).toBe('Calcul en direct');
    expect(fidelity(en)).toBe('Computed live');
    expect(fr.shadowRoot!.lastElementChild?.classList.contains('fidelity')).toBe(true);
    const m = mount<Measured>('kit-measured', 'en');
    expect(fidelity(m)).toBe('Measured data · source: data/table.json');
  });

  it('names the game in the label, and keeps the source file in its own span', () => {
    const el = mount<MeasuredLc12>('kit-measured-lc12', 'fr');
    expect(fidelity(el)).toBe('Données mesurées · règle des répétitions (lc1-2) · source : data/v5.json');
    expect(el.shadowRoot!.querySelector('.fidelity .source')!.textContent).toBe('data/v5.json');
  });

  it('names the game and the kind an instance reports, and adopts the element sheet after the kit sheet', () => {
    const wrapper = document.createElement('section');
    wrapper.setAttribute('lang', 'en');
    const a = document.createElement('kit-by-attribute');
    a.setAttribute('rules', 'A');
    const b = document.createElement('kit-by-attribute');
    b.setAttribute('rules', 'lc1-2');
    wrapper.append(a, b);
    document.body.append(wrapper);
    expect(fidelity(a as PogoFigure)).toBe('Computed live · game with no stopping rule');
    expect(fidelity(b as PogoFigure)).toBe('Computed live · repetition rule (lc1-2)');
    const sheets = a.shadowRoot!.adoptedStyleSheets;
    expect(sheets).toHaveLength(2);
    expect(sheets[1]).toBe(b.shadowRoot!.adoptedStyleSheets[1]);
    expect(mount<Fine>('kit-fine').shadowRoot!.adoptedStyleSheets).toHaveLength(1);
    const c = document.createElement('kit-by-attribute');
    c.setAttribute('rules', 'A');
    c.setAttribute('measured', '');
    wrapper.append(c);
    expect(fidelity(c as PogoFigure)).toBe('Measured data · game with no stopping rule · source: data/x.json');
    expect(c.shadowRoot!.querySelector('.fidelity .source')!.textContent).toBe('data/x.json');
  });

  it('falls back to English with no [lang] ancestor', () => {
    const el = document.createElement('kit-fine') as Fine;
    document.body.append(el);
    expect(el.lang).toBe('en');
  });

  it('reports reduced motion from the media query', () => {
    const el = mount<Fine>('kit-fine');
    expect(el.motion()).toBe(false);
    setMedia(REDUCED_MOTION, true);
    expect(el.motion()).toBe(true);
  });

  it('playFrom dispatches one bubbling, composed pogo:playfrom event with the state', () => {
    const el = mount<Fine>('kit-fine');
    const seen: CustomEvent[] = [];
    document.addEventListener('pogo:playfrom', (e) => seen.push(e as CustomEvent));
    const s = initial();
    el.replay(s);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.detail).toEqual({ state: s, label: 'opening' });
    expect(seen[0]!.composed).toBe(true);
  });

  it('disconnect stops observing and aborts the figure signal', () => {
    const el = mount<Fine>('kit-fine');
    expect(observing(el)).toBe(1);
    const signal = (el as unknown as { signal: AbortSignal }).signal;
    el.remove();
    expect(observing(el)).toBe(0);
    expect(signal.aborted).toBe(true);
  });
});
