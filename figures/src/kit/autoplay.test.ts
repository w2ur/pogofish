import type { ObserverCtor } from '../follow-panel';
import { REDUCED_MOTION, resetMedia, setMedia } from '../test-dom';
import { autoplay, halfOnScreen } from './autoplay';
import { Stepper } from './stepper';

/** An observer the test drives by hand. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  constructor(
    readonly cb: IntersectionObserverCallback,
    readonly init?: IntersectionObserverInit,
  ) {
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
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** `ratio` of the figure on screen; the figure is `height` px tall in a 800px viewport. */
  deliver(target: Element, ratio: number, height = 400): void {
    const entry = {
      target,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
      intersectionRect: { height: ratio * height } as DOMRectReadOnly,
      boundingClientRect: { height } as DOMRectReadOnly,
      rootBounds: { height: 800 } as DOMRectReadOnly,
    } as IntersectionObserverEntry;
    this.cb([entry], this as unknown as IntersectionObserver);
  }
}
const Fake = FakeObserver as unknown as ObserverCtor;

let host: HTMLElement;
let controller: AbortController;

beforeEach(() => {
  resetMedia();
  vi.useFakeTimers();
  FakeObserver.all = [];
  host = document.createElement('div');
  document.body.append(host);
  controller = new AbortController();
});
afterEach(() => {
  controller.abort();
  vi.useRealTimers();
  host.remove();
});

const observer = (): FakeObserver => FakeObserver.all.at(-1)!;
const stepper = (steps = 5): Stepper => new Stepper(steps, () => {}, { signal: controller.signal, interval: 100 });

describe('halfOnScreen', () => {
  it('is half of the figure, or half of the viewport for a figure taller than two viewports', () => {
    const e = (ratio: number, height: number) =>
      ({
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
        intersectionRect: { height: ratio * height },
        boundingClientRect: { height },
        rootBounds: { height: 800 },
      }) as IntersectionObserverEntry;
    expect(halfOnScreen(e(0.49, 400))).toBe(false);
    expect(halfOnScreen(e(0.5, 400))).toBe(true);
    // 2000px tall: never half on screen, but 400 of its pixels fill half the viewport.
    expect(halfOnScreen(e(0.19, 2000))).toBe(false);
    expect(halfOnScreen(e(0.2, 2000))).toBe(true);
    expect(halfOnScreen(e(0, 400))).toBe(false);
  });
});

describe('autoplay', () => {
  it('starts the first time at least half of the figure is on screen, not before', () => {
    const s = stepper();
    autoplay(host, s, { signal: controller.signal, Observer: Fake });
    expect(observer().targets.has(host)).toBe(true);
    observer().deliver(host, 0.3);
    expect(s.playing).toBe(false);
    observer().deliver(host, 0.6);
    expect(s.playing).toBe(true);
  });

  it('pauses when it leaves the screen and resumes where it was when it comes back', () => {
    const s = stepper();
    autoplay(host, s, { signal: controller.signal, Observer: Fake });
    observer().deliver(host, 1);
    vi.advanceTimersByTime(200);
    expect(s.index).toBe(2);
    observer().deliver(host, 0);
    expect(s.playing).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(s.index).toBe(2);
    // Coming back in a sliver does not count; half of it does.
    observer().deliver(host, 0.2);
    expect(s.playing).toBe(false);
    observer().deliver(host, 0.5);
    expect(s.playing).toBe(true);
    expect(s.index).toBe(2);
  });

  it('a reader’s pause is sticky: leaving and coming back does not undo it', () => {
    const s = stepper();
    autoplay(host, s, { signal: controller.signal, Observer: Fake });
    observer().deliver(host, 1);
    s.pauseByReader();
    observer().deliver(host, 0);
    observer().deliver(host, 1);
    expect(s.playing).toBe(false);
    // The reader plays it again: from then on the screen drives it again.
    s.playByReader();
    observer().deliver(host, 0);
    expect(s.playing).toBe(false);
    observer().deliver(host, 1);
    expect(s.playing).toBe(true);
  });

  it('a figure that has ended does not start again when it comes back on screen', () => {
    const s = stepper(3);
    autoplay(host, s, { signal: controller.signal, Observer: Fake });
    observer().deliver(host, 1);
    vi.advanceTimersByTime(200);
    expect(s.ended).toBe(true);
    observer().deliver(host, 0);
    observer().deliver(host, 1);
    expect(s.playing).toBe(false);
    expect(s.index).toBe(2);
  });

  it('never starts under reduced motion: it shows the still state once, and ▶ still plays', () => {
    setMedia(REDUCED_MOTION, true);
    const s = stepper();
    const still = vi.fn(() => s.go(4));
    autoplay(host, s, { signal: controller.signal, Observer: Fake, still });
    expect(still).toHaveBeenCalledTimes(1);
    expect(s.index).toBe(4);
    observer().deliver(host, 1);
    expect(s.playing).toBe(false);
    s.playByReader();
    expect(s.playing).toBe(true);
  });

  it('the still state is for reduced motion only', () => {
    const still = vi.fn();
    autoplay(host, stepper(), { signal: controller.signal, Observer: Fake, still });
    expect(still).not.toHaveBeenCalled();
  });

  it('stops watching when the figure’s signal aborts', () => {
    const s = stepper();
    autoplay(host, s, { signal: controller.signal, Observer: Fake });
    const o = observer();
    controller.abort();
    expect(o.disconnected).toBe(true);
  });

  it('watches nothing with an already-aborted signal, and nothing without an observer', () => {
    controller.abort();
    autoplay(host, stepper(), { signal: controller.signal, Observer: Fake });
    expect(FakeObserver.all).toHaveLength(0);
  });
});
