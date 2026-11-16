import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, intersect, observersOf, resetMedia, setMedia } from '../test-dom';
import { PogoTitle } from './pogo-title';

if (!customElements.get('pogo-title')) customElements.define('pogo-title', PogoTitle);

const FR = 'POOOOOOGOOOOOO' + '\u00a0!'.repeat(8);
const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(text = FR): Promise<PogoTitle> {
  resetMedia();
  const h1 = document.createElement('h1');
  h1.setAttribute('lang', 'fr');
  const el = document.createElement('pogo-title') as PogoTitle;
  el.textContent = text;
  h1.append(el);
  document.body.append(h1);
  intersect(el);
  await flush();
  return el;
}

/** Delivers an entry saying whether `el` is on screen, to every observer watching it. */
function onScreen(el: Element, isIntersecting: boolean): void {
  for (const o of observersOf(el)) {
    (o as unknown as { callback: IntersectionObserverCallback }).callback(
      [{ target: el, isIntersecting } as IntersectionObserverEntry],
      o as unknown as IntersectionObserver,
    );
  }
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-title>', () => {
  it('draws the same text, aria-hidden, and keeps the light-DOM text as the name', async () => {
    const el = await mount();
    const drawn = el.shadowRoot!.querySelector('.drawn')!;
    expect(drawn.getAttribute('aria-hidden')).toBe('true');
    expect(drawn.textContent).toBe(FR);
    expect(el.textContent).toBe(FR);
    expect(el.shadowRoot!.querySelectorAll('.o .disc')).toHaveLength(12);
    expect(el.shadowRoot!.querySelectorAll('.o .disc.white')).toHaveLength(6);
    expect(el.shadowRoot!.querySelectorAll('.o .disc.red')).toHaveLength(6);
    expect([...el.shadowRoot!.querySelectorAll('.bang')].map((b) => b.textContent).join('')).toBe('!'.repeat(8));
  });

  it('tolerates the page’s <wbr> in its light DOM, and draws its groups with a <wbr> between them', async () => {
    resetMedia();
    const h1 = document.createElement('h1');
    const el = document.createElement('pogo-title') as PogoTitle;
    // The page's markup: the no-break space stays with the camp, before the <wbr>.
    el.append('POOOOOO', document.createElement('wbr'), 'GOOOOOO\u00a0', document.createElement('wbr'), '!' + '\u00a0!'.repeat(7));
    h1.append(el);
    document.body.append(h1);
    intersect(el);
    await flush();
    const text = 'POOOOOOGOOOOOO' + '\u00a0!'.repeat(8);
    expect(el.textContent).toBe(text);
    expect(el.querySelectorAll('wbr')).toHaveLength(2);
    const drawn = el.shadowRoot!.querySelector('.drawn')!;
    expect(drawn.textContent).toBe(text);
    expect([...drawn.children].map((c) => c.localName + (c.className ? '.' + c.className.replace(' ', '.') : ''))).toEqual([
      'span.part.camp',
      'wbr',
      'span.part.camp',
      'wbr',
      'span.part.bangs',
    ]);
    // Each drawn group ends where the page's <wbr> stands: the line of bangs starts on a bang.
    expect([...drawn.querySelectorAll('.part')].map((p) => p.textContent)).toEqual([
      'POOOOOO',
      'GOOOOOO\u00a0',
      '!' + '\u00a0!'.repeat(7),
    ]);
    expect([...el.shadowRoot!.querySelectorAll('.letter.red')].map((x) => x.textContent)).toEqual(['G']);
  });

  it('jumps only while on screen, and stops for good at disconnect', async () => {
    const el = await mount();
    onScreen(el, true);
    expect(el.hasAttribute('data-moving')).toBe(true);
    onScreen(el, false);
    expect(el.hasAttribute('data-moving')).toBe(false);
    onScreen(el, true);
    el.remove();
    expect(el.hasAttribute('data-moving')).toBe(false);
    expect(observersOf(el)).toHaveLength(0);
  });

  it('its sheet keeps the discs still under reduced motion and drops « Précisions »', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-title.css'), 'utf8');
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(reduced).toContain('animation: none');
    // A camp never breaks.
    expect(css).toMatch(/\.part\.camp \{\s*white-space: nowrap;/);
    expect(css).toMatch(/\.precisions,\s*\.failed \{\s*display: none;/);
    // Animation only under the attribute the visibility observer sets.
    expect(css).toMatch(/:host\(\[data-moving\]\) \.disc \{\s*animation: pogo/);
  });

  it('the letters and the bangs rock by a transparent glyph and its drawn copy, the text unchanged', async () => {
    const el = await mount();
    const sway = [...el.shadowRoot!.querySelectorAll<HTMLElement>('.sway')];
    expect(sway.map((x) => x.dataset.glyph).join('')).toBe('PG' + '!'.repeat(8));
    // The bangs out of step with one another, the letters on the beat.
    const own = sway.map((x) => Number(x.style.getPropertyValue('--own')));
    expect(own.slice(0, 2)).toEqual([0, 0]);
    expect(new Set(own.slice(2)).size).toBeGreaterThan(4);
    for (const o of own) expect(Math.abs(o)).toBeLessThanOrEqual(0.05);
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-title.css'), 'utf8');
    // Only a transform moves: the box is the text's.
    const sway2 = /@keyframes sway \{([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(sway2).toContain('rotate(');
    expect(sway2).not.toMatch(/translate|width|margin|left|top/);
  });
});

/** A media element whose time and play state the test sets. */
function clip(cls = 'pogo-concert-clip'): HTMLVideoElement & { set(t: number, paused: boolean): void } {
  const v = document.createElement('video') as HTMLVideoElement & { set(t: number, paused: boolean): void };
  v.className = cls;
  let time = 0;
  let paused = true;
  Object.defineProperty(v, 'currentTime', { get: () => time, configurable: true });
  Object.defineProperty(v, 'paused', { get: () => paused, configurable: true });
  v.set = (t, p) => {
    time = t;
    paused = p;
    v.dispatchEvent(new Event(p ? 'pause' : 'playing'));
  };
  document.body.append(v);
  return v;
}

async function mountClock(): Promise<PogoTitle> {
  resetMedia();
  const h1 = document.createElement('h1');
  const el = document.createElement('pogo-title') as PogoTitle;
  el.setAttribute('clock', '.pogo-concert-clip');
  el.setAttribute('beat', '0.4');
  el.setAttribute('beat-at', '0.28');
  el.textContent = FR;
  h1.append(el);
  document.body.append(h1);
  intersect(el);
  await flush();
  return el;
}

describe('<pogo-title clock>', () => {
  let frames: FrameRequestCallback[] = [];
  const step = (): void => {
    const run = frames;
    frames = [];
    for (const f of run) f(0);
  };
  const drawnClock = (el: PogoTitle) => (el.shadowRoot!.querySelector('.drawn') as HTMLElement).style.getPropertyValue('--clock');

  afterEach(() => {
    vi.unstubAllGlobals();
    frames = [];
  });

  function stubFrames(): void {
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
      frames.push(f);
      return ++id;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
  }

  it('follows the media’s time while it plays and the title is on screen, and freezes when it pauses', async () => {
    stubFrames();
    const v = clip();
    const el = await mountClock();
    expect(el.hasAttribute('data-clock')).toBe(true);
    expect(el.hasAttribute('data-moving')).toBe(false);
    onScreen(el, true);
    expect(frames).toHaveLength(0);
    v.set(1.2, false);
    expect(frames).toHaveLength(1);
    v.set(1.5, false);
    step();
    expect(drawnClock(el)).toBe('1.500');
    expect(frames).toHaveLength(1);
    // A loop: the time jumps back, the pieces with it.
    v.set(0.1, false);
    step();
    expect(drawnClock(el)).toBe('0.100');
    v.set(0.3, true);
    expect(frames).toHaveLength(0);
    expect(drawnClock(el)).toBe('0.300');
    // Off screen, it does not run even if the clip plays.
    onScreen(el, false);
    v.set(0.5, false);
    expect(frames).toHaveLength(0);
    onScreen(el, true);
    expect(frames).toHaveLength(1);
  });

  it('stops its loop and its listeners at disconnect', async () => {
    stubFrames();
    const v = clip();
    const el = await mountClock();
    onScreen(el, true);
    v.set(1, false);
    expect(frames).toHaveLength(1);
    el.remove();
    expect(frames).toHaveLength(0);
    expect(el.hasAttribute('data-clock')).toBe(false);
    v.set(2, false);
    expect(frames).toHaveLength(0);
  });

  it('runs no loop under reduced motion, and its sheet stills both modes', async () => {
    stubFrames();
    const v = clip();
    const el = await mountClock();
    setMedia(REDUCED_MOTION, true);
    onScreen(el, true);
    v.set(1, false);
    expect(frames).toHaveLength(0);
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-title.css'), 'utf8');
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)![1]!;
    for (const sel of [':host([data-moving]) .disc', ':host([data-clock]) .disc', ':host([data-moving]) .sway::before', ':host([data-clock]) .sway::before']) {
      expect(reduced).toContain(sel);
    }
  });

  it('finds a clip the page adds later; without one it runs free, at the beat as its period', async () => {
    stubFrames();
    const el = await mountClock();
    expect(el.hasAttribute('data-clock')).toBe(false);
    onScreen(el, true);
    expect(el.hasAttribute('data-moving')).toBe(true);
    expect((el.shadowRoot!.querySelector('.drawn') as HTMLElement).style.getPropertyValue('--_period')).toBe('0.4');
    clip();
    await flush();
    expect(el.hasAttribute('data-clock')).toBe(true);
    expect(el.hasAttribute('data-moving')).toBe(false);
  });

  it('with no clock and no beat, it keeps the period it always had', async () => {
    const el = await mount();
    expect((el.shadowRoot!.querySelector('.drawn') as HTMLElement).style.getPropertyValue('--_period')).toBe('1.24');
    expect(el.hasAttribute('data-clock')).toBe(false);
  });

  it('does not write the clock while the title is off screen', async () => {
    stubFrames();
    const v = clip();
    const el = await mountClock();
    v.set(1.5, true);
    expect(drawnClock(el)).toBe('');
    onScreen(el, true);
    expect(drawnClock(el)).toBe('1.500');
    onScreen(el, false);
    v.set(2.5, true);
    expect(drawnClock(el)).toBe('1.500');
  });

  it('stops looking once its clock names something that is not a media element', async () => {
    const observed = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const el = await mountClock();
    const before = observed.mock.calls.length;
    const div = document.createElement('div');
    div.className = 'pogo-concert-clip';
    document.body.append(div);
    await flush();
    expect(observed.mock.calls.length).toBe(before + 1);
    expect(el.hasAttribute('data-clock')).toBe(false);
    observed.mockRestore();
  });

  it('a clip found while it runs free switches to keyframes of another name, so the animations restart on the clock', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-title.css'), 'utf8');
    const free = /:host\(\[data-moving\]\) \.disc \{\s*animation: (\S+)/.exec(css)![1];
    const clocked = /:host\(\[data-clock\]\) \.disc \{\s*animation: (\S+)/.exec(css)![1];
    expect(free).toBe('pogo');
    expect(clocked).toBe('pogo-beat');
    expect(/:host\(\[data-clock\]\) \.sway::before \{\s*animation: (\S+)/.exec(css)![1]).toBe('sway-beat');
    // The two names hold the same frames.
    const frames = (name: string) => new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css)![1];
    expect(frames('pogo-beat')).toBe(frames('pogo'));
    expect(frames('sway-beat')).toBe(frames('sway'));
  });
});
