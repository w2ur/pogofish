// The board, drawn as an SVG and nothing else: no layout reads, no colour.
// Every paint comes from theme.css classes, so a theme change needs no redraw.
import type { State } from '../engine';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 100;
const SIDE = 3 * CELL;

export interface BoardOptions {
  /** Origin of the move that led to `s`: carries the dashed ring. */
  from?: number;
  /** Destination of that move: its top `moving` discs are the moved ones. */
  to?: number;
  moving?: number;
  /** Width and height in CSS pixels (default 240). */
  size?: number;
  /**
   * Leaves each cell's top-left corner free for the coordinates, which `boardLabels`
   * (board-labels.ts) lays over the board as fixed-size HTML. Draws no text itself.
   */
  labelRoom?: boolean;
  /**
   * Rings drawn above the stacks, so a stack never hides one: `target` is the
   * dashed ring of what can be tapped, `picked` the solid ink ring of a lifted stack.
   */
  marks?: { cell: number; kind: 'target' | 'picked' }[];
  /** Text alternative, in the figure's language. Without it the drawing is hidden from assistive tech. */
  title?: string;
}

let titles = 0;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

/** Cell `i` (row-major, a1 = 0) to its top-left corner; rank 1 is the bottom row. */
const corner = (i: number): [number, number] => [(i % 3) * CELL, (2 - Math.floor(i / 3)) * CELL];

/**
 * Draws position `s` seen from above, White's back row (a1–c1) at the bottom.
 * A stack is a column of discs offset upward, bottom first, so its height reads
 * at a glance and its top disc is whole. With `from`/`to`/`moving`, `s` is the
 * position after the move.
 */
export function drawBoard(s: State, o: BoardOptions = {}): SVGSVGElement {
  const size = o.size ?? 240;
  const svg = el('svg', { viewBox: `0 0 ${SIDE} ${SIDE}`, width: size, height: size, class: 'board' });

  if (o.title) {
    const id = `pogo-board-title-${++titles}`;
    el('title', { id }, svg).textContent = o.title;
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-labelledby', id);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  for (let i = 0; i < 9; i++) {
    const [x, y] = corner(i);
    el('rect', { class: 'cell', 'data-cell': i, x, y, width: CELL, height: CELL }, svg);
  }

  // With room for labels the stack moves down and right to clear the corner they sit in.
  const radius = o.labelRoom ? 22 : 26;
  const baseStep = o.labelRoom ? 11 : 12;
  const centre = o.labelRoom ? 56 : 50;
  // Vertical room a stack may take, centre to centre of its end discs plus one disc.
  const room = o.labelRoom ? 70 : 78;
  const gap = 3;

  if (o.from !== undefined) {
    const [x, y] = corner(o.from);
    el('circle', { class: 'from', 'data-cell': o.from, cx: x + centre, cy: y + centre, r: radius + 10 }, svg);
  }
  if (o.to !== undefined) {
    const [x, y] = corner(o.to);
    el('rect', { class: 'to', 'data-cell': o.to, x: x + 3, y: y + 3, width: CELL - 6, height: CELL - 6 }, svg);
  }

  s.cells.forEach((stack, i) => {
    if (stack.length === 0) return;
    const [x, y] = corner(i);
    const g = el('g', { class: 'stack', 'data-cell': i }, svg);
    const cx = x + centre;
    // A tall stack (four discs and more) tightens its offset to stay in its cell.
    const step = stack.length > 1 ? Math.min(baseStep, (room - 2 * radius) / (stack.length - 1)) : 0;
    const bottom = y + centre + ((stack.length - 1) * step) / 2;
    const moved = i === o.to ? Math.min(o.moving ?? 0, stack.length) : 0;
    stack.forEach((colour, k) => {
      const cy = bottom - k * step;
      // The cut-out in the ground colour separates a disc from the one below.
      el('circle', { class: 'gap', cx, cy, r: radius + gap }, g);
      const disc = el('circle', { class: `disc ${colour === 'White' ? 'white' : 'red'}`, cx, cy, r: radius }, g);
      disc.dataset.colour = colour;
      if (k >= stack.length - moved) disc.classList.add('moved');
      el('circle', { class: 'ring', cx, cy, r: radius - 1 }, g);
    });
  });

  for (const { cell, kind } of o.marks ?? []) {
    const [x, y] = corner(cell);
    el('circle', { class: `mark ${kind}`, 'data-cell': cell, cx: x + centre, cy: y + centre, r: radius + 10 }, svg);
  }

  return svg;
}

/** How long a piece takes to travel in a figure (DESIGN.md, « Motion »). */
export const MOVE_MS = 240;

/**
 * The moved discs travel from where they stood in `before` to where they land in
 * `after`, both drawn by drawBoard (`after` with `to`/`moving`). The caller checks
 * reduced motion first; without the Web Animations API nothing moves.
 */
export function animateMove(before: SVGSVGElement, after: SVGSVGElement, [from, n]: readonly number[]): void {
  const left = [...before.querySelectorAll<SVGCircleElement>(`.stack[data-cell="${from}"] .disc`)].slice(-n!);
  const landed = [...after.querySelectorAll<SVGCircleElement>('.disc.moved')];
  landed.forEach((disc, k) => {
    const old = left[k];
    if (!old || typeof disc.animate !== 'function') return;
    const dx = Number(old.getAttribute('cx')) - Number(disc.getAttribute('cx'));
    const dy = Number(old.getAttribute('cy')) - Number(disc.getAttribute('cy'));
    // The cut-out before the disc and the ink ring after it travel with it.
    for (const node of [disc.previousElementSibling, disc, disc.nextElementSibling]) {
      (node as SVGElement | null)?.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: MOVE_MS, easing: 'ease-out' },
      );
    }
  });
}
