// Where <pogo-count> draws each thing, apart from the DOM: one drawing holds
// the board and the row, so a piece can travel from one to the other. Three
// layouts, by the width of the figure: the row under the board (narrow, and
// wider from 480px), or beside it from 720px. All lengths are in the units of
// the drawing's viewBox; the board is 300 units wide, as kit/board-svg.ts
// draws it, and a piece on it has the same radius.
import type { CountFrame, Row } from './count-row';
import { BARS, PIECES, places } from './count-row';

export interface Layout {
  name: 'narrow' | 'mid' | 'wide';
  width: number;
  height: number;
  /** The board's top-left corner. */
  board: { x: number; y: number };
  /** The row: its left end, the line its pieces sit on, and the width of one of its 20 places. */
  row: { x: number; y: number; slot: number };
}

export const CELL = 100;
/** A piece's radius on the board (board-svg.ts), and how far each piece of a stack is offset from the one below. */
export const RADIUS = 26;
const STEP = 12;
const STACK_ROOM = 78;
/** Room kept under the board for the line that says whose turn it is. */
const TURN_ROOM = 44;

const SLOTS = PIECES + BARS;
/** Room kept at each end of the row, so its end pieces never touch the edge of the drawing. */
const EDGE = 4;
const layout = (name: Layout['name'], slot: number, beside: boolean): Layout => {
  const side = 3 * CELL;
  if (beside) {
    const gap = 44;
    return { name, width: side + gap + SLOTS * slot + EDGE, height: side + TURN_ROOM, board: { x: 0, y: 0 }, row: { x: side + gap, y: side / 2, slot } };
  }
  const width = Math.max(side, SLOTS * slot + 2 * EDGE);
  const y = side + TURN_ROOM + slot * 0.9 + 8;
  return { name, width, height: y + slot * 0.9, board: { x: (width - side) / 2, y: 0 }, row: { x: (width - SLOTS * slot) / 2, y, slot } };
};

export const LAYOUTS: Record<Layout['name'], Layout> = {
  narrow: layout('narrow', 14.6, false),
  mid: layout('mid', 31, false),
  wide: layout('wide', 35, true),
};

/** The layout for a figure `width` CSS pixels wide (the sheet's own breakpoints). */
export function layoutFor(width: number): Layout {
  if (width >= 720) return LAYOUTS.wide;
  return width >= 480 ? LAYOUTS.mid : LAYOUTS.narrow;
}

export interface Spot {
  x: number;
  y: number;
  /** 1 on the board; smaller in the row, where a piece fits its place. */
  scale: number;
}

/** A piece's radius in the row, as a share of a place's width. */
const ROW_FILL = 0.41;

/** The centre of place `i` of the row. */
export function rowSpot(l: Layout, place: number): Spot {
  return { x: l.row.x + (place + 0.5) * l.row.slot, y: l.row.y, scale: (l.row.slot * ROW_FILL) / RADIUS };
}

/** Where the k-th piece of `row` stands on the board: its square, and its height in the stack. */
export function boardSpot(l: Layout, row: Row, k: number): Spot & { cell: number } {
  const cell = row.bars.filter((b) => b <= k).length;
  const start = cell === 0 ? 0 : row.bars[cell - 1]!;
  const end = cell === BARS ? PIECES : row.bars[cell]!;
  const [size, level] = [end - start, k - start];
  // As drawBoard: a tall stack tightens its offset to stay in its square.
  const step = size > 1 ? Math.min(STEP, (STACK_ROOM - 2 * RADIUS) / (size - 1)) : 0;
  const [col, rank] = [cell % 3, Math.floor(cell / 3)];
  return {
    cell,
    x: l.board.x + (col + 0.5) * CELL,
    // Rank 1 is the bottom row, as on every board of the page.
    y: l.board.y + (2 - rank + 0.5) * CELL + ((size - 1) * step) / 2 - level * step,
    scale: 1,
  };
}

export interface Scene {
  /** Each piece, by its rank in the row: where it is drawn in full, and where its trace is. */
  solid: (Spot & { cell: number })[];
  trace: Spot[];
  /** The 8 separators, in the row. */
  bars: Spot[];
}

export function scene(l: Layout, f: CountFrame): Scene {
  const p = places(f.row);
  const onBoard = f.row.order.map((_, k) => boardSpot(l, f.row, k));
  const inRow = onBoard.map((b, k) => ({ ...rowSpot(l, p.pieces[k]!), cell: b.cell }));
  return {
    solid: f.solid === 'board' ? onBoard : inRow,
    trace: f.solid === 'board' ? inRow : onBoard,
    bars: p.bars.map((place) => rowSpot(l, place)),
  };
}
