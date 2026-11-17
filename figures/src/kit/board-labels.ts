// The board's coordinates, a1…c3, as fixed-size HTML laid over a drawBoard SVG.
// Drawn inside the SVG they scaled with the board and outweighed the pieces at
// 400px; here the type stays 12.8px whatever the board's width. When the board
// shows a move, the dashed ring where it came from carries, the same way, the
// number of pieces the move lifted (1, 2 or 3), read from the drawing.

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

/**
 * The number of pieces the move shown lifted, on the lower right of its dashed ring: what
 * drawBoard keeps on the ring (`data-lifted`), so it is always the move's own. Null when the
 * board shows no move, or not where it came from.
 */
function liftedCount(svg: SVGSVGElement): HTMLElement | null {
  const ring = svg.querySelector<SVGCircleElement>('.from[data-lifted]');
  if (!ring) return null;
  const cell = Number(ring.dataset.cell);
  // The ring's own centre and radius, in the board's units: the count sits where the drawing put the ring.
  const along = Number(ring.getAttribute('r')) * Math.SQRT1_2;
  const badge = document.createElement('span');
  badge.className = 'lifted';
  badge.dataset.cell = String(cell);
  badge.textContent = ring.dataset.lifted!;
  badge.style.left = pct(Number(ring.getAttribute('cx')) + along);
  badge.style.top = pct(Number(ring.getAttribute('cy')) + along);
  return badge;
}

/** `svg` (drawn with `labelRoom: true`) in a box that carries the coordinates, and the count of a move's lifted pieces. */
export function labelledBoard(svg: SVGSVGElement): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'board-frame';
  const labels = boardLabels();
  const lifted = liftedCount(svg);
  if (lifted) labels.append(lifted);
  frame.append(svg, labels);
  return frame;
}
