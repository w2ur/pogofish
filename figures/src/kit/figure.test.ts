import { initial, type State } from '../engine';
import { REDUCED_MOTION, intersect, observing, resetMedia, setMedia } from '../test-dom';
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
customElements.define('kit-fine', Fine);
customElements.define('kit-flaky', Flaky);
customElements.define('kit-measured', Measured);
customElements.define('kit-broken', Broken);
customElements.define('kit-rejected', Rejected);

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
    intersect(el);
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
