// Steps a figure through `steps` frames, by hand or on a timer. Under reduced
// motion nothing plays by itself: `auto` is false and `play()` does nothing.
// The reader may still ask for it, with ▶ (`playByReader()`). The media query
// is followed live, and `onChange` subscribers hear every change of step, of
// play state and of `auto`.
//
// Two pauses are told apart: one by code (the figure left the screen), which
// the figure may undo, and one by the reader, which only the reader undoes
// (`readerPaused`, read by kit/autoplay.ts).

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export interface StepperOptions {
  /** Milliseconds between automatic steps (default 900). */
  interval?: number;
  /** Called when automatic play reaches the last step. */
  onEnd?: () => void;
  /**
   * For a figure that loops: automatic play never ends, and after the last step goes
   * on at this one. By hand it still stops.
   */
  wrapTo?: number;
  /** For a loop: extra milliseconds the last step is held before it starts again (default 0). */
  rest?: number;
  /** Aborting it destroys the stepper: a figure passes its own, aborted at disconnect. */
  signal?: AbortSignal;
}

export class Stepper {
  private i = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly media: MediaQueryList;
  private readonly interval: number;
  private readonly rest: number;
  private readonly onEnd: (() => void) | undefined;
  private readonly wrapTo: number | undefined;
  private readonly listeners = new Set<() => void>();
  private destroyed = false;
  private heldByReader = false;
  private finished = false;
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
    this.rest = options.rest ?? 0;
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

  /** False whenever the reader asks for reduced motion: nothing then plays by itself. */
  get auto(): boolean {
    return !this.media.matches;
  }

  get playing(): boolean {
    return this.timer !== undefined;
  }

  get index(): number {
    return this.i;
  }

  /** The reader paused it, and has not played it since. */
  get readerPaused(): boolean {
    return this.heldByReader;
  }

  /** Automatic play stopped on the last step of a figure that does not loop: ▶ now replays it. */
  get ended(): boolean {
    return this.finished;
  }

  /** Subscribes to every change; returns the unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Automatic play, as code asks for it: never under reduced motion, never over a reader's pause. */
  play(): void {
    if (!this.auto || this.heldByReader) return;
    this.start();
  }

  /** The reader pressed ▶: plays even under reduced motion, and lifts the reader's pause. */
  playByReader(): void {
    this.heldByReader = false;
    if (!this.start()) this.emit();
  }

  /** A pause by code (the figure left the screen): the figure may play again. */
  pause(): void {
    if (this.halt()) this.emit();
  }

  /** The reader pressed ⏸: the figure stays paused until the reader plays it again. */
  pauseByReader(): void {
    this.heldByReader = true;
    this.halt();
    this.emit();
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
    this.finished = false;
    this.onStep(target);
    this.emit();
  }

  destroy(): void {
    this.destroyed = true;
    this.halt();
    this.media.removeEventListener('change', this.onMedia);
    this.listeners.clear();
  }

  /** Starts the timer; false when nothing started. */
  private start(): boolean {
    if (this.destroyed || this.playing || this.steps < 2) return false;
    if (this.i === this.steps - 1 && this.wrapTo === undefined) this.go(0);
    this.schedule();
    this.emit();
    return true;
  }

  /** One step after `interval`; on a loop's last step, after `interval + rest`. */
  private schedule(): void {
    const last = this.steps - 1;
    const wrapTo = this.wrapTo;
    const wait = wrapTo !== undefined && this.i === last ? this.interval + this.rest : this.interval;
    // The timer stays set while the step is shown, so subscribers hear it as playing.
    const timer = setTimeout(() => {
      if (wrapTo !== undefined && this.i === last) this.go(wrapTo);
      else this.go(this.i + 1);
      // A subscriber paused or destroyed it meanwhile.
      if (this.timer !== timer) return;
      if (wrapTo === undefined && this.i === last) {
        this.timer = undefined;
        this.finished = true;
        this.emit();
        this.onEnd?.();
        return;
      }
      this.schedule();
    }, wait);
    this.timer = timer;
  }

  /** Stops the timer; true when one was running. */
  private halt(): boolean {
    if (this.timer === undefined) return false;
    clearTimeout(this.timer);
    this.timer = undefined;
    return true;
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
}
