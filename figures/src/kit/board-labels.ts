// The board's coordinates, a1…c3, as fixed-size HTML laid over a drawBoard SVG.
// Drawn inside the SVG they scaled with the board and outweighed the pieces at
// 400px; here the type stays 12.8px whatever the board's width.

/** Each label's offset from its cell's top-left corner, in the board's 300-unit viewBox. */
const INSET = 8;
const SIDE = 300;
const pct = (units: number): string => `${((units / SIDE) * 100).toFixed(3)}%`;

/** Cells in screen order, a3 first, as a reader scans the board. */
const SCREEN_ORDER = [6, 7, 8, 3, 4, 5, 0, 1, 2];

const cellName = (i: number): string => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;

/**
 * The nine coordinates as an overlay for a board drawn by `drawBoard`.
 *
 * Contract:
 * - Place the overlay in the same positioned box as the board's SVG, with the SVG
 *   filling that box (`labelledBoard` builds one; a figure with its own frame appends
 *   the overlay to it).
 * - Draw the SVG with `labelRoom: true`, which moves the stacks off the corner each
 *   label takes.
 * - Labels are placed by percentage of the box, so they follow the rendered board with
 *   no layout read, and their type is the kit's label cut at 12.8px in `--pogo-muted`.
 * - The overlay is `aria-hidden` and lets the pointer through: a figure names its cells
 *   itself.
 * - Below a 240px rendered board the labels reach the pieces: leave them out there.
 */
export function boardLabels(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'board-labels';
  overlay.setAttribute('aria-hidden', 'true');
  for (const i of SCREEN_ORDER) {
    const label = document.createElement('span');
    label.className = 'coord';
    label.dataset.cell = String(i);
    label.textContent = cellName(i);
    label.style.left = pct((i % 3) * 100 + INSET);
    label.style.top = pct((2 - Math.floor(i / 3)) * 100 + INSET);
    overlay.append(label);
  }
  return overlay;
}

/** `svg` (drawn with `labelRoom: true`) in a box that carries the coordinates. */
export function labelledBoard(svg: SVGSVGElement): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'board-frame';
  frame.append(svg, boardLabels());
  return frame;
}
