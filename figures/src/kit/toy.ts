// A toy: a figure the reader manipulates (round 5, convention 3). It is not a
// film. A film is watched and keeps its transport (kit/controls.ts, with
// kit/autoplay.ts); a toy plays a short introduction ONCE, the first time half
// of it is on screen, then belongs to the reader for good: no transport, no
// replay, no sentence of the introduction left on it.
//
// The three phases, on the figure's root as `data-toy`:
//
//   waiting   not seen yet. The figure shows its first state.
//   intro     the introduction plays: `intro.show(0)`, then each next step
//             after `intro.interval` (the kit's move tempo by default), the
//             last one held as long. It ends early, at once, when the reader
//             presses anything in the figure or uses a key in it (the press
//             then acts on the toy: the phase changes before the figure hears
//             it), and when the figure leaves the screen.
//   ready     the reader's. `onReady()` is called once, on entering it: the
//             figure shows the state its toy rests on and takes input from
//             then on. Under reduced motion a toy is ready from the start
//             and plays nothing.
//
// What the figure writes on a toy, and where:
//
//   - the invitation, ONE short line saying what to do (« Déplacez une pièce :
//     la rangée suit. »), is `invite`, placed by the figure directly above
//     what the reader manipulates, as the toy's first line. The theme hides
//     it until the toy is ready and keeps its room, so nothing shifts when it
//     appears and no « à vous » is ever on screen while a demonstration plays;
//   - while the introduction plays, what it says (if anything) goes in the
//     same place, in an element of its own that the figure empties in
//     onReady(): never both at once;
//   - which way the toy reads is drawn, not written: readingMark() is an ink
//     arrow, pointing from what is read first to what is read next. The figure
//     puts one between the two things a toy ties together (the board and what
//     it becomes), pointing at the result, and one along anything read in an
//     order the eye would not guess (a row, a stack read bottom to top), at
//     its start. A word goes with it only when the arrow alone cannot say it.
//
//   const play = toy(this, { root, invite: t(lang, '…'), intro: { steps, show }, onReady, signal });
//   root.append(play.invite, scene);  // call toy() last: under reduced motion onReady() runs in it
import type { ObserverCtor } from '../follow-panel';
import { halfOnScreen } from './autoplay';
import { MOVE_TEMPO_MS } from './tempo';

export type ToyPhase = 'waiting' | 'intro' | 'ready';

export interface ToyIntro {
  /** How many steps the introduction has: keep it short, it plays once and cannot be replayed. */
  steps: number;
  /** Shows step `i` (0 first). */
  show: (i: number) => void;
  /** How long step `i` is held, in ms (default: the kit's move tempo). */
  interval?: number | ((i: number) => number);
}

export interface ToyOptions {
  /** The figure's root in its shadow tree: carries `data-toy`, and is where the reader's first press or key is heard. */
  root: HTMLElement;
  /** The invitation, one short line. */
  invite: string;
  intro: ToyIntro;
  /** Called once, when the toy becomes the reader's: show the resting state, take input. */
  onReady: () => void;
  /** The figure's signal: aborting it stops everything. */
  signal: AbortSignal;
  Observer?: ObserverCtor;
}

export interface Toy {
  /** The invitation line (`.toy-invite`): the figure places it, directly above what the reader manipulates. */
  invite: HTMLParagraphElement;
  phase(): ToyPhase;
  /** Ends the introduction now, or never plays it: the toy is the reader's. */
  skip(): void;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** Keys that move through the page without acting on the figure. */
const PASSING_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/** Watches `host` (the figure's element) and runs the toy; see the header. */
export function toy(host: Element, o: ToyOptions): Toy {
  const invite = document.createElement('p');
  invite.className = 'toy-invite';
  invite.textContent = o.invite;

  let phase: ToyPhase = 'waiting';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let io: IntersectionObserver | undefined;
  const set = (p: ToyPhase): void => {
    phase = p;
    o.root.dataset.toy = p;
  };
  const stop = (): void => {
    clearTimeout(timer);
    timer = undefined;
    io?.disconnect();
    io = undefined;
  };
  const skip = (): void => {
    if (phase === 'ready' || o.signal.aborted) return;
    stop();
    set('ready');
    o.onReady();
  };
  const hold = (i: number): number => (typeof o.intro.interval === 'function' ? o.intro.interval(i) : (o.intro.interval ?? MOVE_TEMPO_MS));
  const step = (i: number): void => {
    o.intro.show(i);
    timer = setTimeout(() => (i + 1 < o.intro.steps ? step(i + 1) : skip()), hold(i));
  };

  set('waiting');
  const api: Toy = { invite, phase: () => phase, skip };
  if (o.signal.aborted) return api;
  if (matchMedia(REDUCED_MOTION).matches || o.intro.steps <= 0) {
    skip();
    return api;
  }

  // In the capture phase: the toy is ready before the figure's own listener hears the press.
  const onPress = (): void => skip();
  const onKey = (e: KeyboardEvent): void => {
    if (!PASSING_KEYS.has(e.key)) skip();
  };
  o.root.addEventListener('pointerdown', onPress, { capture: true, signal: o.signal });
  o.root.addEventListener('keydown', onKey, { capture: true, signal: o.signal });
  o.signal.addEventListener('abort', stop, { once: true });

  const Ctor = o.Observer ?? (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined);
  // Nothing to watch with: no introduction, the toy is the reader's.
  if (!Ctor) {
    skip();
    return api;
  }
  io = new Ctor(
    (entries) => {
      const e = entries.at(-1);
      if (!e) return;
      if (phase === 'waiting' && halfOnScreen(e)) {
        // Reduced motion asked for since the figure was built.
        if (matchMedia(REDUCED_MOTION).matches) return skip();
        set('intro');
        step(0);
      } else if (phase === 'intro' && !e.isIntersecting) {
        skip();
      }
    },
    { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1] },
  );
  io.observe(host);
  return api;
}

export type ReadingDirection = 'right' | 'left' | 'down' | 'up';

const NS = 'http://www.w3.org/2000/svg';
/** The arrow, 40 long and 16 across: its shaft, then its head. */
const ARROWS: Record<ReadingDirection, { box: string; d: string }> = {
  right: { box: '0 0 40 16', d: 'M2 8H36M29 2l8 6-8 6' },
  left: { box: '0 0 40 16', d: 'M38 8H4M11 2l-8 6 8 6' },
  down: { box: '0 0 16 40', d: 'M8 2V36M2 29l6 8 6-8' },
  up: { box: '0 0 16 40', d: 'M8 38V4M2 11l6-8 6 8' },
};

/**
 * Which way a toy reads: an ink arrow (`.reads`, theme.css), pointing from what is read first
 * to what is read next. Alone it is hidden from assistive tech (the figure's names say the
 * order); with `label`, a few words the arrow cannot say, it is read.
 */
export function readingMark(direction: ReadingDirection, label?: string): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.className = 'reads';
  mark.dataset.dir = direction;
  const { box, d } = ARROWS[direction];
  const [, , w, h] = box.split(' ');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', box);
  svg.setAttribute('width', w!);
  svg.setAttribute('height', h!);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  mark.append(svg);
  if (label) {
    const text = document.createElement('span');
    text.className = 'reads-label';
    text.textContent = label;
    mark.append(text);
  } else {
    mark.setAttribute('aria-hidden', 'true');
  }
  return mark;
}
