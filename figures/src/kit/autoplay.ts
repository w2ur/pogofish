// A figure that plays starts by itself: the first time at least half of it is
// on screen, it plays; when it leaves the screen it pauses, and when it comes
// back it resumes from where it was, unless the reader paused it (a reader's
// pause is sticky: only ▶ undoes it). A figure that has ended stays on its last
// state with its replay control. Under reduced motion nothing ever starts by
// itself: the figure shows its most telling still state (`still`), and ▶.
//
// One call per figure, after its transport exists. The IntersectionObserver is
// injected, as in follow-panel.ts, so a test drives it.
import type { ObserverCtor } from '../follow-panel';

/** What autoplay drives: a Stepper, or a figure's own wrapper around one. */
export interface Playable {
  readonly playing: boolean;
  readonly readerPaused: boolean;
  /** Automatic play: refused under reduced motion and over a reader's pause. */
  play(): void;
  /** A pause by code, not the reader's. */
  pause(): void;
}

export interface AutoplayOptions {
  /** The figure's signal: aborting it stops the watch. */
  signal: AbortSignal;
  /** Under reduced motion, called once, now: shows the figure's most telling still state. */
  still?: () => void;
  Observer?: ObserverCtor;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Whether at least half of the figure is on screen. A figure taller than two
 * viewports can never be half on screen: for it, half of the viewport will do.
 */
export function halfOnScreen(e: IntersectionObserverEntry): boolean {
  if (!e.isIntersecting) return false;
  if (e.intersectionRatio >= 0.5) return true;
  const viewport = e.rootBounds?.height ?? 0;
  return viewport > 0 && e.boundingClientRect.height > 2 * viewport && e.intersectionRect.height >= viewport / 2;
}

/** Watches `host` and plays or pauses `target` as it comes and goes; see the header. */
export function autoplay(host: Element, target: Playable, o: AutoplayOptions): void {
  if (o.signal.aborted) return;
  const reduced = (): boolean => matchMedia(REDUCED_MOTION).matches;
  if (reduced()) o.still?.();
  const Ctor = o.Observer ?? (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined);
  if (!Ctor) return;
  let started = false;
  let pausedByScreen = false;
  const io = new Ctor(
    (entries) => {
      const e = entries.at(-1);
      if (!e) return;
      if (halfOnScreen(e)) {
        if (reduced() || target.readerPaused) return;
        if (!started || pausedByScreen) {
          target.play();
          started = target.playing || started;
          pausedByScreen = false;
        }
      } else if (!e.isIntersecting && target.playing) {
        target.pause();
        pausedByScreen = true;
      }
    },
    { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1] },
  );
  io.observe(host);
  o.signal.addEventListener('abort', () => io.disconnect(), { once: true });
}
