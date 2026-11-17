// What <pogo-count> shows, apart from the DOM: a position IS a pile of 12
// pieces cut by 8 separators. toRow() lifts the nine stacks of a position and
// lays them end to end, square after square (a1, b1, c1, a2 … c3), each stack
// from its bottom piece to its top one, with a separator at every change of
// square; fromRow() folds such a row back onto the board. The two are inverse
// of each other, so every position is one row and every row one position:
// the essay's two factors are the orders of the 12 pieces and the places of
// the 8 separators, and its third is the side to move.
import type { Colour } from '../engine';

export const PIECES = 12;
export const CELLS = 9;
export const BARS = CELLS - 1;

export interface Row {
  /** The 12 pieces in pile order: square after square, each stack bottom first. */
  order: Colour[];
  /** For each of the 8 separators, how many pieces lie before it: never decreasing, 0 to 12. */
  bars: number[];
}

const fail = (why: string): never => {
  throw new Error(`pogo-count: ${why}`);
};

function checkRow(row: Row): void {
  if (row.order.length !== PIECES) fail(`a row holds ${PIECES} pieces, not ${row.order.length}`);
  const white = row.order.filter((c) => c === 'White').length;
  if (white * 2 !== PIECES || row.order.some((c) => c !== 'White' && c !== 'Red')) fail('a row holds as many white pieces as red ones');
  if (row.bars.length !== BARS) fail(`a row holds ${BARS} separators, not ${row.bars.length}`);
  row.bars.forEach((b, j) => {
    if (!Number.isInteger(b) || b < 0 || b > PIECES) fail(`separator ${j} is out of the row`);
    if (j > 0 && b < row.bars[j - 1]!) fail(`separator ${j} comes before separator ${j - 1}`);
  });
}

/** The position's nine stacks as one row. */
export function toRow(cells: readonly (readonly Colour[])[]): Row {
  if (cells.length !== CELLS) fail(`a board has ${CELLS} squares, not ${cells.length}`);
  const order = cells.flat();
  const bars: number[] = [];
  let before = 0;
  cells.slice(0, -1).forEach((stack) => bars.push((before += stack.length)));
  const row = { order, bars };
  checkRow(row);
  return row;
}

/** The row folded back onto the board: nine stacks, each bottom first. */
export function fromRow(row: Row): Colour[][] {
  checkRow(row);
  const cuts = [0, ...row.bars, PIECES];
  return Array.from({ length: CELLS }, (_, i) => row.order.slice(cuts[i], cuts[i + 1]));
}

/**
 * Where each thing sits in the row's 20 places: `pieces[k]` is the place of the
 * k-th piece, `bars[j]` the place of the j-th separator. Two separators side by
 * side are an empty square.
 */
export function places(row: Row): { pieces: number[]; bars: number[] } {
  checkRow(row);
  return {
    // A piece comes after every separator that has fewer pieces before it than it has, itself counted.
    pieces: row.order.map((_, k) => k + row.bars.filter((b) => b <= k).length),
    bars: row.bars.map((b, j) => b + j),
  };
}
