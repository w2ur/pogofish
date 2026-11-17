// What the reader may change in <pogo-count>, apart from the DOM. The row is
// 20 places, twelve pieces and eight separators (count-row.ts): the reader
// takes any one of them and puts it at another place, the things between
// closing up, and the position the row folds into follows. On the board the
// reader lifts the top one, two or three pieces of a square and lands them on
// another square, as on every board of the page, and the row follows. Both
// edits keep twelve pieces, six of each colour, and eight separators, so every
// edit is a position, and every position can be reached either way.
//
// Each edit also says where every thing went (`pieces`, `bars`), so the figure
// moves the very piece the reader moved and no other.
import type { Colour, Move } from '../engine';
import { BARS, CELLS, PIECES, fromRow, places, toRow, type Row } from './count-row';

export type Item = Colour | 'bar';

/** The most pieces one lift takes, as in the game. */
export const MAX_LIFT = 3;

const fail = (why: string): never => {
  throw new Error(`pogo-count: ${why}`);
};

/** The row's 20 places, left to right: a piece's colour, or a separator. */
export function rowItems(row: Row): Item[] {
  const p = places(row);
  const items = new Array<Item>(PIECES + BARS);
  p.pieces.forEach((place, k) => (items[place] = row.order[k]!));
  for (const place of p.bars) items[place] = 'bar';
  return items;
}

/** The row read back from its 20 places. */
export function itemsRow(items: readonly Item[]): Row {
  if (items.length !== PIECES + BARS) fail(`a row has ${PIECES + BARS} places, not ${items.length}`);
  const order: Colour[] = [];
  const bars: number[] = [];
  for (const x of items) {
    if (x === 'bar') bars.push(order.length);
    else order.push(x);
  }
  // toRow's checks, through fromRow: six of each colour, eight separators.
  return toRow(fromRow({ order, bars }));
}

export interface Edit {
  /** The row after the edit. */
  row: Row;
  /** `pieces[k]`: the rank, in the new row, of the piece that had rank `k`. */
  pieces: number[];
  /** `bars[j]`: which separator of the new row the j-th separator became. */
  bars: number[];
}

/** The thing at place `from` is taken out and put at place `to`; what lay between closes up. */
export function moveItem(row: Row, from: number, to: number): Edit {
  const items = rowItems(row);
  for (const i of [from, to]) if (!Number.isInteger(i) || i < 0 || i >= items.length) fail(`place ${i} is out of the row`);
  // Each thing keeps its name through the move: p3 is the piece of rank 3, b0 the first separator.
  const before = places(row);
  const names = new Array<string>(items.length);
  before.pieces.forEach((place, k) => (names[place] = `p${k}`));
  before.bars.forEach((place, j) => (names[place] = `b${j}`));
  const [item] = items.splice(from, 1);
  const [name] = names.splice(from, 1);
  items.splice(to, 0, item!);
  names.splice(to, 0, name!);
  const pieces = new Array<number>(PIECES);
  const bars = new Array<number>(BARS);
  let [rank, bar] = [0, 0];
  for (const n of names) {
    if (n[0] === 'p') pieces[Number(n.slice(1))] = rank++;
    else bars[Number(n.slice(1))] = bar++;
  }
  return { row: itemsRow(items), pieces, bars };
}

/** The top `n` pieces of square `from` land on top of square `to`, in the order they had. */
export function movePieces(row: Row, from: number, n: number, to: number): Edit {
  const cells = fromRow(row);
  for (const i of [from, to]) if (!Number.isInteger(i) || i < 0 || i >= CELLS) fail(`square ${i} is off the board`);
  if (from === to) fail('pieces moved onto their own square do not move');
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIFT) fail(`a lift takes 1 to ${MAX_LIFT} pieces, not ${n}`);
  if (cells[from]!.length < n) fail(`square ${from} does not hold ${n} pieces`);
  // The old rank of every piece, square by square, moved as the pieces are.
  let k = 0;
  const ranks = cells.map((stack) => stack.map(() => k++));
  cells[to]!.push(...cells[from]!.splice(-n));
  ranks[to]!.push(...ranks[from]!.splice(-n));
  const pieces = new Array<number>(PIECES);
  ranks.flat().forEach((old, now) => (pieces[old] = now));
  // The separators stand between the same squares as before.
  return { row: toRow(cells), pieces, bars: Array.from({ length: BARS }, (_, j) => j) };
}

/** Every lift the board allows: the top 1 to 3 pieces of a square, onto any other square. */
export function boardMoves(cells: readonly (readonly Colour[])[]): Move[] {
  const moves: Move[] = [];
  cells.forEach((stack, from) => {
    for (let n = 1; n <= Math.min(MAX_LIFT, stack.length); n++) {
      for (let to = 0; to < CELLS; to++) if (to !== from) moves.push({ from_cell: from, num_pieces: n as Move['num_pieces'], to_cell: to });
    }
  });
  return moves;
}
