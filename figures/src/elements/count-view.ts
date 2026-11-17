// Where <pogo-count> draws each thing, apart from the DOM: one drawing holds
// the board and the row, so a piece can travel from one to the other. Three
// layouts, by the width of the figure: the row under the board (narrow, and
// wider from 480px), or beside it from 720px. All lengths are in the units of
// the drawing's viewBox; the board is 300 units wide and its pieces stand as
// kit/board-svg.ts draws them with room for the squares' names (`labelRoom`),
// so the marks of a lifted stack fall where they do on every board.
//
// Around the board and the row the layout keeps room for what says how the
// figure reads: at the board's left, the arrows of the reading order (each
// rank left to right, the ranks bottom to top); under it, one box for the line
// that says whose turn it is, which the count chooser takes while a stack is
// lifted; over the row, its own arrow; under it, the name of the square each
// run of pieces is.
import { BARS, CELLS, PIECES, places, type Row } from './count-row';

export interface Layout {
  name: 'narrow' | 'mid' | 'wide';
  width: number;
  height: number;
  /** The board's top-left corner. */
  board: { x: number; y: number };
  /** The row: its left end, the line its pieces sit on, and the width of one of its 20 places. */
  row: { x: number; y: number; slot: number };
  /** The box under the board: the line that says whose turn it is, or the count chooser while a stack is lifted. */
  under: { x: number; y: number; width: number; height: number };
}

export const CELL = 100;
/** A piece on the board, as board-svg.ts draws it with `labelRoom`: its radius, where a stack is centred in its square, how far each piece is offset from the one below, the room a stack may take. */
export const RADIUS = 22;
const CENTRE = 56;
const STEP = 11;
const STACK_ROOM = 70;
/** Room kept at the board's left for the arrows of the reading order. */
export const ORDER_ROOM = 40;
/** Room kept over the row for its arrow, and under it for the squares' names. */
const HEAD_ROOM = 30;
const NAME_ROOM = 26;
/** Half the width a square's name takes under the row, at the narrowest. */
const NAME_HALF = 16;

const SLOTS = PIECES + BARS;
/** Room kept at each end of the row, so its end pieces never touch the edge of the drawing. */
const EDGE = 4;
/** How far a separator reaches above and below the row's line, in places. */
export const BAR_REACH = 0.72;
/**
 * How far a place's button reaches above and below the row's line: as a separator does, and
 * never less than this, so a finger that drifts off a small piece is still over its place.
 */
export const hitReach = (l: Layout): number => Math.max(l.row.slot * BAR_REACH, 28);

const layout = (name: Layout['name'], slot: number, beside: boolean, room: number): Layout => {
  const side = 3 * CELL;
  if (beside) {
    const gap = 44;
    const row = { x: ORDER_ROOM + side + gap, y: side / 2, slot };
    // Beside the board the chooser may run under the row's empty half: one line at any width.
    return { name, width: row.x + SLOTS * slot + EDGE, height: side + room, board: { x: ORDER_ROOM, y: 0 }, row, under: { x: ORDER_ROOM, y: side, width: 520, height: room } };
  }
  const width = Math.max(side + ORDER_ROOM, SLOTS * slot + 2 * EDGE);
  const y = side + room + HEAD_ROOM + slot * BAR_REACH;
  return {
    name,
    width,
    height: y + slot * BAR_REACH + NAME_ROOM,
    board: { x: Math.max(ORDER_ROOM, (width - side) / 2), y: 0 },
    row: { x: (width - SLOTS * slot) / 2, y, slot },
    under: { x: 0, y: side, width, height: room },
  };
};

export const LAYOUTS: Record<Layout['name'], Layout> = {
  // The room under the board holds the chooser at the narrowest width the layout serves: narrow, its label takes a line of its own.
  narrow: layout('narrow', 16.6, false, 92),
  mid: layout('mid', 31, false, 64),
  wide: layout('wide', 35, true, 76),
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

/** The top-left corner of square `i` (a1 = 0); rank 1 is the bottom row, as on every board of the page. */
const corner = (l: Layout, i: number): [number, number] => [l.board.x + (i % 3) * CELL, l.board.y + (2 - Math.floor(i / 3)) * CELL];

/** Where the k-th piece of `row` stands on the board: its square, and its height in the stack. */
export function boardSpot(l: Layout, row: Row, k: number): Spot & { cell: number } {
  const cell = row.bars.filter((b) => b <= k).length;
  const start = cell === 0 ? 0 : row.bars[cell - 1]!;
  const end = cell === BARS ? PIECES : row.bars[cell]!;
  const [size, level] = [end - start, k - start];
  // As drawBoard: a tall stack tightens its offset to stay in its square.
  const step = size > 1 ? Math.min(STEP, (STACK_ROOM - 2 * RADIUS) / (size - 1)) : 0;
  const [x, y] = corner(l, cell);
  return { cell, x: x + CENTRE, y: y + CENTRE + ((size - 1) * step) / 2 - level * step, scale: 1 };
}

export interface Scene {
  /** Each piece, by its rank in the row: where it stands on the board, and where it lies in the row. */
  board: (Spot & { cell: number })[];
  row: (Spot & { cell: number })[];
  /** The 8 separators, in the row. */
  bars: Spot[];
}

export function scene(l: Layout, row: Row): Scene {
  const p = places(row);
  const board = row.order.map((_, k) => boardSpot(l, row, k));
  return {
    board,
    row: board.map((b, k) => ({ ...rowSpot(l, p.pieces[k]!), cell: b.cell })),
    bars: p.bars.map((place) => rowSpot(l, place)),
  };
}

/** The ink ring of a lifted stack, where board-svg.ts draws it. */
export function pickedRing(l: Layout, cell: number): { cx: number; cy: number; r: number } {
  const [x, y] = corner(l, cell);
  return { cx: x + CENTRE, cy: y + CENTRE, r: RADIUS + 10 };
}

/** The four corners of a square that could be chosen, as board-svg.ts draws them. */
export function targetCorners(l: Layout, cell: number): string {
  const [x, y] = corner(l, cell);
  const [left, top, right, bottom, a] = [x + 3, y + 3, x + CELL - 3, y + CELL - 3, 20];
  return [
    `M${left} ${top + a}V${top}H${left + a}`,
    `M${right - a} ${top}H${right}V${top + a}`,
    `M${right} ${bottom - a}V${bottom}H${right - a}`,
    `M${left + a} ${bottom}H${left}V${bottom - a}`,
  ].join('');
}

/**
 * The board's reading order, drawn at its left, from the bottom: an arrow along the first
 * rank, an arrow up to the next, an arrow along it, and so on. The row starts at a1.
 */
export function orderArrows(l: Layout): string[] {
  const { x, y } = l.board;
  const head = 6;
  const [from, to] = [x - 30, x - 6];
  const height = (rank: number): number => y + (2 - rank + 0.5) * CELL;
  const along = (rank: number): string => `M${from} ${height(rank)}H${to}M${to - head} ${height(rank) - head}L${to} ${height(rank)}L${to - head} ${height(rank) + head}`;
  const up = (rank: number): string => {
    const [side, bottom, top] = [(from + to) / 2, height(rank) - 20, height(rank + 1) + 20];
    return `M${side} ${bottom}V${top}M${side - head} ${top + head}L${side} ${top}L${side + head} ${top + head}`;
  };
  return [along(0), up(0), along(1), up(1), along(2)];
}

/** Each square that holds pieces, and the middle of its run of pieces in the row: where its name is written. */
export function runs(l: Layout, row: Row): { cell: number; x: number }[] {
  const cuts = [0, ...row.bars, PIECES];
  const out: { cell: number; x: number }[] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const [start, end] = [cuts[cell]!, cuts[cell + 1]!];
    if (end === start) continue;
    // The run's first piece lies after `cell` separators. At the row's ends the name keeps inside the drawing.
    const middle = l.row.x + (start + cell + (end - start) / 2) * l.row.slot;
    out.push({ cell, x: Math.min(Math.max(middle, NAME_HALF), l.width - NAME_HALF) });
  }
  return out;
}
