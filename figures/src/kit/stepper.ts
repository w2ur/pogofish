// Steps a figure through `steps` frames, by hand or on a timer. Under reduced
// motion there is no timer at all: `auto` is false, `play()` does nothing, and
// the figure shows its step buttons. The media query is followed live, and
// `onChange` subscribers hear every change of step, of play state and of `auto`.

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export interface StepperOptions {
  /** Milliseconds between automatic steps (default 900). */
  interval?: number;
  /** Called when automatic play reaches the last step. */
  onEnd?: () => void;
  /**
   * For a figure whose last step shows its first position again (a loop): automatic
   * play never ends, and after the last step goes on at this one. By hand it still stops.
   */
  wrapTo?: number;
  /** Aborting it destroys the stepper: a figure passes its own, aborted at disconnect. */
  signal?: AbortSignal;
}

export class Stepper {
  private i = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly media: MediaQueryList;
  private readonly interval: number;
  private readonly onEnd: (() => void) | undefined;
  private readonly wrapTo: number | undefined;
  private readonly listeners = new Set<() => void>();
  private destroyed = false;
  private readonly onMedia = (): void => {
    if (!this.auto) this.halt();
    this.emit();
  };

  constructor(
    readonly steps: number,
    private readonly onStep: (i: number) => void,
    options: StepperOptions = {},
  ) {
    this.interval = options.interval ?? 900;
    this.onEnd = options.onEnd;
    this.wrapTo = options.wrapTo;
    this.media = matchMedia(REDUCED_MOTION);
    if (options.signal?.aborted) {
      this.destroyed = true;
      return;
    }
    this.media.addEventListener('change', this.onMedia);
    options.signal?.addEventListener('abort', () => this.destroy(), { once: true });
  }

  /** False whenever the reader asks for reduced motion. */
  get auto(): boolean {
    return !this.media.matches;
  }

  get playing(): boolean {
    return this.timer !== undefined;
  }

  get index(): number {
    return this.i;
  }

  /** Subscribes to every change; returns the unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  play(): void {
    if (this.destroyed || !this.auto || this.playing || this.steps < 2) return;
    const last = this.steps - 1;
    const wrapTo = this.wrapTo;
    if (this.i === last && wrapTo === undefined) this.go(0);
    this.timer = setInterval(() => {
      if (wrapTo !== undefined && this.i === last) {
        this.go(wrapTo);
        return;
      }
      this.go(this.i + 1);
      if (wrapTo === undefined && this.i === last) {
        this.pause();
        this.onEnd?.();
      }
    }, this.interval);
    this.emit();
  }

  pause(): void {
    if (this.halt()) this.emit();
  }

  next(): void {
    this.go(this.i + 1);
  }

  prev(): void {
    this.go(this.i - 1);
  }

  /** Moves to step `i`, clamped; calls `onStep` only when the step changes. */
  go(i: number): void {
    const target = Math.max(0, Math.min(this.steps - 1, i));
    if (target === this.i) return;
    this.i = target;
    this.onStep(target);
    this.emit();
  }

  destroy(): void {
    this.destroyed = true;
    this.halt();
    this.media.removeEventListener('change', this.onMedia);
    this.listeners.clear();
  }

  /** Stops the timer; true when one was running. */
  private halt(): boolean {
    if (this.timer === undefined) return false;
    clearInterval(this.timer);
    this.timer = undefined;
    return true;
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
}
