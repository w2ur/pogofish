// Drag and drop for what is not a board (round 5, convention 2): a row of
// places, each holding something the reader may take and put on another
// place. A board never uses this: pieces on a board are taken the page's one
// way (take-pieces.ts).
//
// One primitive, three ways in, all doing the same thing:
//
//   - a pointer (mouse, pen, finger): press on what a place holds, drag, and
//     release over another place. The page does not scroll under a finger that
//     starts on something takeable (`touch-action: none`, theme.css), and a
//     drag the browser takes back (pointercancel) drops nothing;
//   - a tap: press a place to take what it holds, press another to put it
//     there. No dragging needed, for those who cannot drag;
//   - the keyboard: the places are one tab stop that the arrow keys, Home and
//     End move; Enter or Space takes, and puts; Escape puts back.
//
// Each step is said in a polite live region (`live`): « Place 3 : pièce rouge,
// en main. Flèches pour choisir une place, Entrée pour y déposer, Échap pour
// reposer. », « Place 7 : pièce rouge, en place. », « Rien n’a bougé. ».
//
// The figure owns everything else. It lays the places (buttons, in reading
// order) over what it draws; says which may be taken (`canTake`) and where
// each may go (`canDrop`); decides what a drop means (`onDrop`: a swap, an
// insertion, a slide); and, to make the drag visible, moves what it drew while
// the pointer does (`onDrag`). This module sets on the places:
//
//   .drag-place            every place (theme.css: no outline of its own);
//   [data-takeable]        it holds something that may be taken (grab cursor);
//   [data-held]            taken now, by a drag or a tap (aria-pressed="true");
//   [data-droppable]       while something is held by a tap: it may go here;
//   [data-over]            while dragging: the place a release would drop on.
//
//   const drag = dragAndDrop({ lang, places, canTake, onDrop, name, onDrag, signal });
//   root.append(drag.live);
//   drag.sync(); // and after every change of what the places hold
import { t, type Lang } from './strings';

/** How far a pressed pointer moves, in CSS pixels, before it drags: under it, a press is a tap. */
export const DRAG_SLOP = 6;

export interface DragMove {
  /** The place the drag started from. */
  from: number;
  /** How far the pointer is from where it pressed, in CSS pixels. */
  dx: number;
  dy: number;
  /** The place a release would drop on now, or null. */
  over: number | null;
}

export interface DragOptions {
  lang: Lang;
  /** The places, in reading order: one button each, whether or not it holds something. */
  places: readonly HTMLElement[];
  /** Whether what place `i` holds may be taken. */
  canTake: (i: number) => boolean;
  /** Whether what was taken at `from` may be put at `to` (default: at any other place). */
  canDrop?: (from: number, to: number) => boolean;
  /** The reader put what was at `from` on `to`. What that does is the figure's; the places are named afresh after it. */
  onDrop: (from: number, to: number) => void;
  /** Place `i` and what it holds, in words: each button's name, and what the announcements say (« Place 3 : pièce rouge »). */
  name: (i: number) => string;
  /** While a pointer drags, at each move; then null once, when the drag ends, dropped or not. */
  onDrag?: (drag: DragMove | null) => void;
  /** The figure's signal: aborting it removes every listener. */
  signal: AbortSignal;
}

export interface Drag {
  /** The live region that says what was taken and put: append it to the figure, once. */
  live: HTMLElement;
  /** Names the places and marks those that may be taken: call once at first, then after every change of what they hold. */
  sync(): void;
  /** The place taken by a tap or a key and not yet put, or null. */
  held(): number | null;
  /** Puts back what is held, without a word. */
  cancel(): void;
}

export function dragAndDrop(o: DragOptions): Drag {
  const { lang, places, signal } = o;
  const canDrop = (from: number, to: number): boolean => to !== from && (o.canDrop?.(from, to) ?? true);

  const live = document.createElement('p');
  live.className = 'sr';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const say = (text: string): void => {
    live.textContent = text;
  };

  /** Taken by a tap or a key. */
  let held: number | null = null;
  /** A pointer pressed on a takeable place: `dragging` once it has moved past the slop. */
  let press: { from: number; id: number; x: number; y: number; dragging: boolean; over: number | null; rects: DOMRect[] } | null = null;
  /** The click that follows the release of a drag is not a tap. */
  let swallowClick = false;
  let stop = 0;

  const sync = (): void => {
    places.forEach((p, i) => {
      p.classList.add('drag-place');
      p.setAttribute('aria-label', o.name(i));
      p.setAttribute('aria-pressed', String(held === i));
      p.toggleAttribute('data-takeable', o.canTake(i));
      p.toggleAttribute('data-held', held === i || (press?.dragging === true && press.from === i));
      p.toggleAttribute('data-droppable', held !== null && canDrop(held, i));
      p.toggleAttribute('data-over', press?.dragging === true && press.over === i);
      p.tabIndex = i === stop ? 0 : -1;
    });
  };

  const tap = (i: number): void => {
    stop = i;
    if (held === null) {
      if (!o.canTake(i)) return sync();
      held = i;
      sync();
      return say(`${o.name(i)}, ${t(lang, 'dragTaken')}. ${t(lang, 'dragHow')}`);
    }
    if (held === i) {
      held = null;
      sync();
      return say(t(lang, 'dragBack'));
    }
    if (canDrop(held, i)) return drop(held, i);
    // Not a place for what is held: taken instead, if it can be.
    if (o.canTake(i)) {
      held = i;
      sync();
      return say(`${o.name(i)}, ${t(lang, 'dragTaken')}. ${t(lang, 'dragHow')}`);
    }
    sync();
  };

  function drop(from: number, to: number): void {
    held = null;
    o.onDrop(from, to);
    sync();
    say(`${o.name(to)}, ${t(lang, 'dragPut')}.`);
  }

  const placeAt = (rects: readonly DOMRect[], x: number, y: number): number | null => {
    const i = rects.findIndex((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom);
    return i < 0 ? null : i;
  };

  const endDrag = (): void => {
    const was = press;
    press = null;
    if (!was?.dragging) return;
    sync();
    o.onDrag?.(null);
  };

  places.forEach((place, i) => {
    place.addEventListener(
      'pointerdown',
      (e) => {
        swallowClick = false;
        if (!e.isPrimary || e.button !== 0 || !o.canTake(i)) return;
        // Measured once per drag: nothing is laid out afresh while the pointer moves.
        press = { from: i, id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, over: null, rects: places.map((p) => p.getBoundingClientRect()) };
        // Every later event of this pointer comes here, wherever it goes.
        try {
          place.setPointerCapture(e.pointerId);
        } catch {
          // A pointer already gone: the press stays a tap.
        }
      },
      { signal },
    );
    place.addEventListener(
      'pointermove',
      (e) => {
        if (!press || e.pointerId !== press.id) return;
        const [dx, dy] = [e.clientX - press.x, e.clientY - press.y];
        if (!press.dragging && Math.hypot(dx, dy) < DRAG_SLOP) return;
        if (!press.dragging) {
          press.dragging = true;
          // A drag takes over from a tap in progress.
          held = null;
        }
        const at = placeAt(press.rects, e.clientX, e.clientY);
        press.over = at !== null && canDrop(press.from, at) ? at : null;
        sync();
        o.onDrag?.({ from: press.from, dx, dy, over: press.over });
      },
      { signal },
    );
    place.addEventListener(
      'pointerup',
      (e) => {
        if (!press || e.pointerId !== press.id) return;
        const { from, over, dragging } = press;
        endDrag();
        if (!dragging) return;
        swallowClick = true;
        // A browser that sends no click after a drag must not lose the next key press.
        setTimeout(() => (swallowClick = false), 0);
        stop = over ?? from;
        if (over === null) {
          sync();
          return say(t(lang, 'dragBack'));
        }
        drop(from, over);
      },
      { signal },
    );
    place.addEventListener('pointercancel', (e) => void (press && e.pointerId === press.id && endDrag()), { signal });
    place.addEventListener(
      'click',
      () => {
        if (swallowClick) {
          swallowClick = false;
          return;
        }
        tap(i);
      },
      { signal },
    );
    place.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          if (held === null) return;
          e.preventDefault();
          held = null;
          sync();
          return say(t(lang, 'dragBack'));
        }
        const last = places.length - 1;
        const to = { ArrowRight: Math.min(i + 1, last), ArrowDown: Math.min(i + 1, last), ArrowLeft: Math.max(i - 1, 0), ArrowUp: Math.max(i - 1, 0), Home: 0, End: last }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        stop = to;
        sync();
        places[to]?.focus();
      },
      { signal },
    );
  });

  return {
    live,
    sync,
    held: () => held,
    cancel: () => {
      held = null;
      sync();
    },
  };
}
