import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ObserverCtor } from '../follow-panel';
import { intersect, observing, resetMedia } from '../test-dom';
import { autoplay } from './autoplay';
import { transport } from './controls';
import { findSequence, type ExportSequence } from './export';
import { PogoFigure } from './figure';
import { Stepper } from './stepper';
import { MOVE_TEMPO_MS } from './tempo';
import { toy } from './toy';

/** The kit's sheet as written (vitest hands `?raw` CSS over empty, and happy-dom does not cascade :host rules). */
const themeCss = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');

/** An observer that records what it watches and is never fired unless the test does. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(readonly cb: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
  }
  unobserve(el: Element): void {
    this.targets.delete(el);
  }
  disconnect(): void {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** The whole figure on screen. */
  deliver(target: Element): void {
    const entry = {
      target,
      isIntersecting: true,
      intersectionRatio: 1,
      intersectionRect: { height: 400 } as DOMRectReadOnly,
      boundingClientRect: { height: 400 } as DOMRectReadOnly,
      rootBounds: { height: 800 } as DOMRectReadOnly,
    } as IntersectionObserverEntry;
    this.cb([entry], this as unknown as IntersectionObserver);
  }
}
const Fake = FakeObserver as unknown as ObserverCtor;

/** A box holding `node`, as a figure's stage holds its rows. */
function wrap(node: Element): HTMLElement {
  const box = document.createElement('div');
  box.append(node);
  return box;
}

/** A film of four steps, the third told in three beats, with its transport. */
class Film extends PogoFigure {
  stepper: Stepper | undefined;
  shown: number[] = [];
  protected render(signal: AbortSignal): void {
    const stepper = new Stepper(4, (i) => this.shown.push(i), {
      signal,
      interval: (i) => (i === 2 ? 3000 : 1000),
      beats: (i) => (i === 2 ? [0, 900, 2000] : [0]),
    });
    this.stepper = stepper;
    this.stage.append(transport(stepper, { lang: 'fr' }));
    autoplay(this, stepper, { signal });
  }
}
customElements.define('kit-export-film', Film);

let controller: AbortController;

beforeEach(() => {
  resetMedia();
  FakeObserver.all = [];
  controller = new AbortController();
  vi.useFakeTimers();
});
afterEach(() => {
  controller.abort();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('Stepper.hold and Stepper.beats', () => {
  it('holds a step as automatic play does: its interval, and on a loop’s last step the rest too', () => {
    const fixed = new Stepper(3, () => undefined, { interval: 700 });
    expect([0, 1, 2].map((i) => fixed.hold(i))).toEqual([700, 700, 700]);
    const loop = new Stepper(3, () => undefined, { interval: (i) => 100 * (i + 1), wrapTo: 0, rest: 2000 });
    expect([0, 1, 2].map((i) => loop.hold(i))).toEqual([100, 200, 2300]);
    // Automatic play waits exactly that long on the loop's last step.
    const seen: number[] = [];
    const timed = new Stepper(2, (i) => seen.push(i), { interval: 500, wrapTo: 0, rest: 1000 });
    timed.play();
    vi.advanceTimersByTime(500);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(1499);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([1, 0]);
    timed.destroy();
  });

  it('has one beat at 0 unless the figure tells its beats', () => {
    expect(new Stepper(2, () => undefined).beats(1)).toEqual([0]);
    const told = new Stepper(2, () => undefined, { beats: (i) => (i === 1 ? [0, 400] : [0]) });
    expect([told.beats(0), told.beats(1)]).toEqual([[0], [0, 400]]);
  });
});

describe('export mode on a film', () => {
  it('renders at once, without waiting to near the screen, and offers its steps', async () => {
    const el = document.createElement('kit-export-film') as Film;
    el.setAttribute('export', '');
    document.body.append(el);
    await el.whenRendered();
    expect(el.stepper).toBeDefined();
    expect(observing(el)).toBe(0);
    const seq = el.exportSequence() as ExportSequence;
    expect(seq.steps).toBe(4);
    expect(seq.loops).toBe(false);
    expect([0, 1, 2, 3].map((i) => seq.hold(i))).toEqual([1000, 1000, 3000, 1000]);
    expect(seq.beats(2)).toEqual([0, 900, 2000]);
    for (let i = 0; i < seq.steps; i++) seq.go(i);
    expect(el.shown).toEqual([1, 2, 3]);
  });

  it('never plays by itself', async () => {
    const el = document.createElement('kit-export-film') as Film;
    el.setAttribute('export', '');
    document.body.append(el);
    await el.whenRendered();
    intersect(el);
    vi.advanceTimersByTime(10_000);
    expect(el.stepper!.playing).toBe(false);
    expect(el.shown).toEqual([]);
  });

  it('without the attribute changes nothing: the figure waits for the screen, then plays', async () => {
    const el = document.createElement('kit-export-film') as Film;
    document.body.append(el);
    await el.whenRendered();
    expect(el.stepper).toBeUndefined();
    expect(observing(el)).toBe(1);
    intersect(el);
    await el.whenRendered();
    expect(el.stepper).toBeDefined();
  });

  it('autoplay watches nothing for an exported host, and plays a plain one', () => {
    const plain = document.createElement('div');
    const drawn = document.createElement('div');
    drawn.setAttribute('export', '');
    const a = new Stepper(3, () => undefined, { signal: controller.signal });
    const b = new Stepper(3, () => undefined, { signal: controller.signal });
    autoplay(plain, a, { signal: controller.signal, Observer: Fake });
    autoplay(drawn, b, { signal: controller.signal, Observer: Fake });
    expect(FakeObserver.all).toHaveLength(1);
    FakeObserver.all[0]!.deliver(plain);
    expect(a.playing).toBe(true);
    expect(b.playing).toBe(false);
  });

  it('the transport offers its stepper’s steps, wherever the row is placed', () => {
    const s = new Stepper(3, () => undefined, { interval: 400, signal: controller.signal });
    const box = document.createElement('div');
    box.append(document.createElement('p'), transport(s, { lang: 'en' }));
    const seq = findSequence(box)!;
    expect(seq.steps).toBe(3);
    seq.go(2);
    expect(s.index).toBe(2);
    expect(seq.hold(1)).toBe(400);
    expect(findSequence(document.createElement('div'))).toBeUndefined();
    expect(seq.loops).toBe(false);
    const loop = new Stepper(3, () => undefined, { wrapTo: 1, rest: 500, signal: controller.signal });
    const looped = findSequence(wrap(transport(loop, { lang: 'en' })))!;
    expect(looped.loops).toBe(true);
    expect(looped.hold(2)).toBe(900 + 500);
  });
});

describe('export mode on a toy', () => {
  const build = (host: Element) => {
    const root = document.createElement('div');
    const show = vi.fn();
    const onReady = vi.fn();
    const play = toy(host, {
      root,
      invite: 'Move a piece.',
      intro: { steps: 3, show, interval: (i) => (i === 0 ? 2000 : 500) },
      onReady,
      signal: controller.signal,
      Observer: Fake,
    });
    return { root, show, onReady, play };
  };

  it('offers its introduction as the sequence, and never becomes the reader’s', () => {
    const host = document.createElement('div');
    host.setAttribute('export', '');
    const { root, show, onReady, play } = build(host);
    expect(FakeObserver.all).toHaveLength(0);
    expect(play.phase()).toBe('intro');
    expect(root.dataset.toy).toBe('intro');
    const seq = findSequence(host.appendChild(root).parentElement!)!;
    expect(seq.steps).toBe(3);
    expect([0, 1, 2].map((i) => seq.hold(i))).toEqual([2000, 500, 500]);
    expect(seq.beats(1)).toEqual([0]);
    // An introduction plays once, then the toy rests with the reader.
    expect(seq.loops).toBe(false);
    for (let i = 0; i < seq.steps; i++) seq.go(i);
    expect(show.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
    vi.advanceTimersByTime(60_000);
    expect(onReady).not.toHaveBeenCalled();
    expect(play.phase()).toBe('intro');
  });

  it('holds an introduction at the kit’s move tempo by default', () => {
    const host = document.createElement('div');
    host.setAttribute('export', '');
    const root = document.createElement('div');
    host.append(root);
    toy(host, { root, invite: '', intro: { steps: 2, show: () => undefined }, onReady: () => undefined, signal: controller.signal, Observer: Fake });
    expect(findSequence(host)!.hold(0)).toBe(MOVE_TEMPO_MS);
  });

  it('without the attribute changes nothing: the toy waits for the screen', () => {
    const host = document.createElement('div');
    const { show, play } = build(host);
    expect(play.phase()).toBe('waiting');
    expect(FakeObserver.all).toHaveLength(1);
    expect(show).not.toHaveBeenCalled();
  });
});

describe('export mode in the theme', () => {
  it('leaves out, only under the attribute, what is for a reader’s hand', () => {
    const block = themeCss.slice(themeCss.indexOf(':host([export]) .controls'));
    const rule = block.slice(0, block.indexOf('}') + 1);
    for (const sel of ['.controls', '.play-from', '.toy-invite', '.move-tip']) expect(rule).toContain(`:host([export]) ${sel}`);
    expect(rule).toMatch(/display:\s*none/);
    // A move's name loses its hover underline, and a rule of equal weight in an element's sheet (a step underlined as the current one) still wins.
    expect(themeCss).toMatch(/:host\(\[export\]\) \.move-name \{\s*text-decoration: none;\s*\}/);
    // Nothing else in the sheet names the attribute.
    expect(themeCss.split('[export]').length - 1).toBe(5);
  });
});
