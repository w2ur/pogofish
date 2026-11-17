import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAG_SLOP, dragAndDrop, type DragOptions } from './drag';

let controller: AbortController;

afterEach(() => {
  controller.abort();
  document.body.innerHTML = '';
});

/** Five places in a row, 40px wide each from x = 0, 40px tall: place i spans [40i, 40i + 40). */
function setup(over: Partial<DragOptions> = {}) {
  controller = new AbortController();
  const row = document.createElement('div');
  document.body.append(row);
  // What each place holds: place 2 is empty and cannot be taken.
  const holds = ['A', 'B', '', 'D', 'E'];
  const places = holds.map((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.getBoundingClientRect = () => ({ left: 40 * i, right: 40 * i + 40, top: 0, bottom: 40, width: 40, height: 40, x: 40 * i, y: 0 }) as DOMRect;
    b.setPointerCapture = vi.fn();
    b.releasePointerCapture = vi.fn();
    row.append(b);
    return b;
  });
  const dropped: [number, number][] = [];
  const dragged: unknown[] = [];
  const drag = dragAndDrop({
    lang: 'fr',
    places,
    canTake: (i) => holds[i] !== '',
    onDrop: (from, to) => {
      dropped.push([from, to]);
      [holds[from], holds[to]] = [holds[to]!, holds[from]!];
    },
    name: (i) => `Place ${i + 1} : ${holds[i] || 'vide'}`,
    onDrag: (d) => dragged.push(d),
    signal: controller.signal,
    ...over,
  });
  row.append(drag.live);
  drag.sync();
  const pointer = (type: string, i: number, x: number, y = 20, init: PointerEventInit = {}) =>
    places[i]!.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, ...init }));
  const key = (i: number, k: string) => places[i]!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const stops = () => places.flatMap((p, i) => (p.tabIndex === 0 ? [i] : []));
  return { places, holds, dropped, dragged, drag, pointer, key, stops };
}

describe('dragAndDrop, by pointer (mouse, pen, touch)', () => {
  it('names each place and marks those that may be taken, which alone keep the page from scrolling under a finger', () => {
    const { places } = setup();
    expect(places.map((p) => p.getAttribute('aria-label'))).toEqual(['Place 1 : A', 'Place 2 : B', 'Place 3 : vide', 'Place 4 : D', 'Place 5 : E']);
    expect(places.map((p) => p.hasAttribute('data-takeable'))).toEqual([true, true, false, true, true]);
    expect(places.every((p) => p.classList.contains('drag-place'))).toBe(true);
  });

  it('a press that moves past the slop drags: the figure is told how far and over which place, then the drop', () => {
    const { places, pointer, dragged, dropped, drag } = setup();
    pointer('pointerdown', 0, 20);
    expect(places[0]!.setPointerCapture).toHaveBeenCalledWith(1);
    // Within the slop nothing drags yet.
    pointer('pointermove', 0, 20 + DRAG_SLOP - 1);
    expect(dragged).toEqual([]);
    pointer('pointermove', 0, 150, 26);
    expect(dragged.at(-1)).toEqual({ from: 0, dx: 130, dy: 6, over: 3 });
    expect(places[0]!.hasAttribute('data-held')).toBe(true);
    expect(places[3]!.hasAttribute('data-over')).toBe(true);
    pointer('pointerup', 0, 150, 26);
    expect(dropped).toEqual([[0, 3]]);
    // The drag is over: the figure is told, the marks are gone, the result is said.
    expect(dragged.at(-1)).toBeNull();
    expect(places.some((p) => p.hasAttribute('data-held') || p.hasAttribute('data-over'))).toBe(false);
    expect(drag.live.textContent).toBe('Place 4 : A, en place.');
    // The click the browser sends after the release takes nothing.
    places[0]!.click();
    expect(drag.held()).toBeNull();
  });

  it('released off every place, or where it may not go, nothing moves and it says so', () => {
    const { pointer, dropped, drag, dragged } = setup({ canDrop: (_from, to) => to !== 4 });
    pointer('pointerdown', 1, 60);
    pointer('pointermove', 1, 60, 300);
    expect(dragged.at(-1)).toEqual({ from: 1, dx: 0, dy: 280, over: null });
    pointer('pointerup', 1, 60, 300);
    pointer('pointerdown', 1, 60);
    pointer('pointermove', 1, 180);
    expect(dragged.at(-1)).toEqual({ from: 1, dx: 120, dy: 0, over: null });
    pointer('pointerup', 1, 180);
    expect(dropped).toEqual([]);
    expect(drag.live.textContent).toBe('Rien n’a bougé.');
  });

  it('a drag the browser cancels (a scroll takes over) drops nothing', () => {
    const { pointer, dropped, dragged } = setup();
    pointer('pointerdown', 0, 20);
    pointer('pointermove', 0, 150);
    pointer('pointercancel', 0, 150);
    pointer('pointerup', 0, 150);
    expect(dropped).toEqual([]);
    expect(dragged.at(-1)).toBeNull();
  });

  it('what may not be taken does not drag, nor does a second button or a second finger', () => {
    const { pointer, dragged, places } = setup();
    pointer('pointerdown', 2, 100);
    pointer('pointermove', 2, 180);
    pointer('pointerdown', 0, 20, 20, { button: 2 });
    pointer('pointermove', 0, 180);
    pointer('pointerdown', 0, 20, 20, { isPrimary: false });
    pointer('pointermove', 0, 180);
    expect(dragged).toEqual([]);
    expect(places[0]!.setPointerCapture).not.toHaveBeenCalled();
  });
});

describe('dragAndDrop, without dragging (a tap, or the keyboard)', () => {
  it('a press takes, a press elsewhere puts: each is said, with how to go on', () => {
    const { places, drag, dropped } = setup();
    places[1]!.click();
    expect(drag.held()).toBe(1);
    expect(places[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(places[1]!.hasAttribute('data-held')).toBe(true);
    expect(drag.live.textContent).toBe('Place 2 : B, en main. Flèches pour choisir une place, Entrée pour y déposer, Échap pour reposer.');
    // Where it may go is marked while it is held.
    expect(places.map((p) => p.hasAttribute('data-droppable'))).toEqual([true, false, true, true, true]);
    places[2]!.click();
    expect(dropped).toEqual([[1, 2]]);
    expect(drag.held()).toBeNull();
    expect(places[1]!.getAttribute('aria-pressed')).toBe('false');
    expect(places.some((p) => p.hasAttribute('data-droppable'))).toBe(false);
    expect(drag.live.textContent).toBe('Place 3 : B, en place.');
    // Named afresh: place 2 is now the empty one.
    expect(places[1]!.getAttribute('aria-label')).toBe('Place 2 : vide');
    expect(places[1]!.hasAttribute('data-takeable')).toBe(false);
  });

  it('a second press on what is held, or Escape, puts it back', () => {
    const { places, drag, key, dropped } = setup();
    places[0]!.click();
    places[0]!.click();
    expect(drag.held()).toBeNull();
    expect(drag.live.textContent).toBe('Rien n’a bougé.');
    places[0]!.click();
    expect(key(3, 'Escape')).toBe(false);
    expect(drag.held()).toBeNull();
    expect(dropped).toEqual([]);
    // With nothing held, Escape is the page's.
    expect(key(3, 'Escape')).toBe(true);
  });

  it('a press where it may not go takes that place instead when it can be taken, else changes nothing', () => {
    const { places, drag, dropped } = setup({ canDrop: (_from, to) => to === 2 });
    places[0]!.click();
    places[3]!.click();
    expect(drag.held()).toBe(3);
    expect(dropped).toEqual([]);
    const { places: p2, drag: d2 } = setup({ canDrop: () => false });
    p2[0]!.click();
    p2[2]!.click();
    expect(d2.held()).toBe(0);
  });

  it('nothing is taken from a place that holds nothing to take', () => {
    const { places, drag } = setup();
    places[2]!.click();
    expect(drag.held()).toBeNull();
    expect(drag.live.textContent).toBe('');
  });

  it('the places are one tab stop; the arrows, Home and End move it, and stop at the ends', () => {
    const { places, key, stops } = setup();
    expect(stops()).toEqual([0]);
    expect(key(0, 'ArrowRight')).toBe(false);
    expect(stops()).toEqual([1]);
    expect(document.activeElement).toBe(places[1]);
    key(1, 'ArrowLeft');
    key(0, 'ArrowLeft');
    expect(stops()).toEqual([0]);
    key(0, 'End');
    expect(stops()).toEqual([4]);
    key(4, 'ArrowDown');
    expect(stops()).toEqual([4]);
    key(4, 'Home');
    expect(stops()).toEqual([0]);
    // A press moves the tab stop too.
    places[3]!.click();
    expect(stops()).toEqual([3]);
  });

  it('says the same in English', () => {
    const { places, drag } = setup({ lang: 'en' });
    places[0]!.click();
    expect(drag.live.textContent).toContain('in hand. Arrow keys choose a place, Enter drops there, Escape puts it back.');
    places[0]!.click();
    expect(drag.live.textContent).toBe('Nothing moved.');
  });

  it('the live region is polite, and hidden from sight', () => {
    const { drag } = setup();
    expect(drag.live.getAttribute('aria-live')).toBe('polite');
    expect(drag.live.getAttribute('role')).toBe('status');
    expect(drag.live.className).toBe('sr');
    // The kit's own sheet hides it: a figure that forgets the rule never shows the announcements.
    const css = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');
    const rule = /\n\.sr \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('clip-path: inset(50%)');
    expect(rule).toContain('position: absolute');
  });

  it('once the figure is gone it hears nothing', () => {
    const { places, drag } = setup();
    controller.abort();
    places[0]!.click();
    expect(drag.held()).toBeNull();
  });
});
