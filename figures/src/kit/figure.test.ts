import { initial, type State } from '../engine';
import { REDUCED_MOTION, intersect, observersOf, observing, resetMedia, setMedia } from '../test-dom';
import { PogoFigure } from './figure';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The kit's sheet as written (vitest hands `?raw` CSS over empty, and happy-dom does not cascade :host rules). */
const themeCss = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');

class Fine extends PogoFigure {
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
/** With a sheet of its own. */
class Styled extends PogoFigure {
  static override styles = '.stage { outline: 1px solid; }';
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
customElements.define('kit-broken', Broken);
customElements.define('kit-rejected', Rejected);
customElements.define('kit-styled', Styled);

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

  it('a failed figure reserves no room: its stage takes the height of its message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const el = mount<Rejected>('kit-rejected', 'en');
      const stage = el.shadowRoot!.querySelector<HTMLElement>('.stage')!;
      stage.style.setProperty('--_stage-min', '900px');
      intersect(el);
      await flush();
      expect(el.hasAttribute('data-failed')).toBe(true);
      expect(stage.style.getPropertyValue('--_stage-min')).toBe('0px');
      // An element's own reserve (a :host rule on .stage) is overridden by the kit for the failed state.
      expect(themeCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')).toContain(':host([data-failed]) .stage { min-height: 0 !important; }');
      // Moved in the page, it renders afresh with its reserve back.
      el.parentElement!.removeChild(el);
      expect(stage.style.getPropertyValue('--_stage-min')).toBe(Rejected.stageMinHeight);
    } finally {
      error.mockRestore();
    }
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

  it('has no « Précisions »: the shadow root is the frame alone, and the host carries no provenance attribute', () => {
    const fr = mount<Fine>('kit-fine', 'fr-FR');
    const en = mount<Fine>('kit-fine', 'en');
    expect(fr.lang).toBe('fr');
    expect(en.lang).toBe('en');
    expect(fr.shadowRoot!.children).toHaveLength(1);
    expect(fr.shadowRoot!.firstElementChild!.className).toBe('frame');
    expect(fr.shadowRoot!.querySelector('details')).toBeNull();
    expect(fr.shadowRoot!.textContent).not.toMatch(/Précisions|Details/);
    for (const a of ['data-fidelity', 'data-game', 'data-source']) expect(fr.hasAttribute(a)).toBe(false);
    expect(themeCss).not.toContain('.precisions');
  });

  it('adopts an element sheet after the kit sheet, one per element shared by its instances', () => {
    const a = mount<Styled>('kit-styled', 'en');
    const b = mount<Styled>('kit-styled', 'en');
    const sheets = a.shadowRoot!.adoptedStyleSheets;
    expect(sheets).toHaveLength(2);
    expect(sheets[1]).toBe(b.shadowRoot!.adoptedStyleSheets[1]);
    expect(mount<Fine>('kit-fine').shadowRoot!.adoptedStyleSheets).toHaveLength(1);
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
