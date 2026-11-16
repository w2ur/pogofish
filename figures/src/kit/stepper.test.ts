import { REDUCED_MOTION, mediaListeners, resetMedia, setMedia } from '../test-dom';
import { Stepper } from './stepper';

beforeEach(() => {
  resetMedia();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Stepper', () => {
  it('plays one step per interval and calls onEnd at the last step', () => {
    const seen: number[] = [];
    const onEnd = vi.fn();
    const s = new Stepper(3, (i) => seen.push(i), { onEnd });
    expect(s.auto).toBe(true);
    s.play();
    expect(s.playing).toBe(true);
    vi.advanceTimersByTime(900);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(900);
    expect(seen).toEqual([1, 2]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(s.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with wrapTo, automatic play never ends: past the last step it goes on at wrapTo', () => {
    const seen: number[] = [];
    const onEnd = vi.fn();
    const s = new Stepper(5, (i) => seen.push(i), { onEnd, wrapTo: 1 });
    s.play();
    vi.advanceTimersByTime(900 * 7);
    expect(seen).toEqual([1, 2, 3, 4, 1, 2, 3]);
    expect(s.playing).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
    // Started from the last step, it goes on at wrapTo rather than rewinding to 0.
    s.pause();
    s.go(4);
    seen.length = 0;
    s.play();
    vi.advanceTimersByTime(900);
    expect(seen).toEqual([1]);
    s.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honours the interval option', () => {
    const seen: number[] = [];
    const s = new Stepper(5, (i) => seen.push(i), { interval: 100 });
    s.play();
    vi.advanceTimersByTime(250);
    expect(seen).toEqual([1, 2]);
    s.pause();
  });

  it('leaves no timer running after pause()', () => {
    const s = new Stepper(10, () => {});
    s.play();
    s.pause();
    expect(vi.getTimerCount()).toBe(0);
    expect(s.playing).toBe(false);
  });

  it('steps by hand, clamped to the ends', () => {
    const seen: number[] = [];
    const s = new Stepper(2, (i) => seen.push(i));
    s.prev();
    s.next();
    s.next();
    s.prev();
    expect(seen).toEqual([1, 0]);
    s.go(1);
    expect(s.index).toBe(1);
  });

  it('play() from the last step starts again at the first', () => {
    const seen: number[] = [];
    const s = new Stepper(2, (i) => seen.push(i), { interval: 10 });
    s.go(1);
    s.play();
    expect(seen).toEqual([1, 0]);
    s.pause();
  });

  it('does not auto-play under reduced motion', () => {
    setMedia(REDUCED_MOTION, true);
    const onStep = vi.fn();
    const s = new Stepper(5, onStep);
    expect(s.auto).toBe(false);
    s.play();
    vi.advanceTimersByTime(5000);
    expect(onStep).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    s.next();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('under reduced motion the reader may still play: playByReader() runs the timer that play() refuses', () => {
    setMedia(REDUCED_MOTION, true);
    const seen: number[] = [];
    const s = new Stepper(3, (i) => seen.push(i));
    s.play();
    expect(s.playing).toBe(false);
    s.playByReader();
    expect(s.playing).toBe(true);
    vi.advanceTimersByTime(900);
    expect(seen).toEqual([1]);
    s.destroy();
  });

  it('remembers a reader’s pause until the reader plays again; a pause by code is not the reader’s', () => {
    const s = new Stepper(5, () => {});
    s.play();
    s.pause();
    expect(s.readerPaused).toBe(false);
    s.play();
    s.pauseByReader();
    expect(s.playing).toBe(false);
    expect(s.readerPaused).toBe(true);
    // Code may not lift it.
    s.play();
    expect(s.readerPaused).toBe(true);
    s.playByReader();
    expect(s.readerPaused).toBe(false);
    expect(s.playing).toBe(true);
    s.destroy();
  });

  it('says it has ended once automatic play stops on the last step of a figure that does not loop', () => {
    const s = new Stepper(3, () => {}, { interval: 10 });
    expect(s.ended).toBe(false);
    s.play();
    vi.advanceTimersByTime(20);
    expect(s.ended).toBe(true);
    s.prev();
    expect(s.ended).toBe(false);
    const loop = new Stepper(3, () => {}, { interval: 10, wrapTo: 0 });
    loop.go(2);
    expect(loop.ended).toBe(false);
    loop.destroy();
  });

  it('a loop rests on its last step for interval + rest before it starts again', () => {
    const seen: number[] = [];
    const s = new Stepper(3, (i) => seen.push(i), { interval: 100, wrapTo: 0, rest: 1000 });
    s.play();
    vi.advanceTimersByTime(200);
    expect(seen).toEqual([1, 2]);
    vi.advanceTimersByTime(1099);
    expect(seen).toEqual([1, 2]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([1, 2, 0]);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([1, 2, 0, 1]);
    s.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('follows the media query: switching it mid-run stops auto', () => {
    const seen: number[] = [];
    const s = new Stepper(10, (i) => seen.push(i));
    s.play();
    vi.advanceTimersByTime(900);
    setMedia(REDUCED_MOTION, true);
    expect(s.auto).toBe(false);
    expect(s.playing).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
    setMedia(REDUCED_MOTION, false);
    expect(s.auto).toBe(true);
  });

  it('tells its subscribers when auto flips, when play starts or stops, and when the step moves', () => {
    const s = new Stepper(5, () => {});
    const seen: string[] = [];
    s.onChange(() => seen.push(`${s.index}:${s.playing ? 'play' : 'stop'}:${s.auto ? 'auto' : 'manual'}`));
    s.play();
    vi.advanceTimersByTime(900);
    setMedia(REDUCED_MOTION, true);
    setMedia(REDUCED_MOTION, false);
    s.next();
    expect(seen).toEqual(['0:play:auto', '1:play:auto', '1:stop:manual', '1:stop:auto', '2:stop:auto']);
  });

  it('onChange returns an unsubscribe', () => {
    const s = new Stepper(5, () => {});
    const fn = vi.fn();
    const off = s.onChange(fn);
    off();
    s.next();
    expect(fn).not.toHaveBeenCalled();
  });

  it('a stepper built with an already-aborted signal attaches no media listener', () => {
    const controller = new AbortController();
    controller.abort();
    const s = new Stepper(10, () => {}, { signal: controller.signal });
    expect(mediaListeners(REDUCED_MOTION)).toBe(0);
    s.play();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroy() and an aborted signal clear the timer and the media listener', () => {
    const a = new Stepper(10, () => {});
    a.play();
    a.destroy();
    const controller = new AbortController();
    const b = new Stepper(10, () => {}, { signal: controller.signal });
    b.play();
    controller.abort();
    expect(vi.getTimerCount()).toBe(0);
    expect(mediaListeners(REDUCED_MOTION)).toBe(0);
  });
});
