// What <pogo-count> shows, apart from the DOM: a position IS a pile of 12
// pieces cut by 8 separators. toRow() lifts the nine stacks of a position and
// lays them end to end, square after square (a1, b1, c1, a2 … c3), each stack
// from its bottom piece to its top one, with a separator at every change of
// square; fromRow() folds such a row back onto the board. The two are inverse
// of each other, so every position is one row and every row one position:
// the essay's two factors are the orders of the 12 pieces and the places of
// the 8 separators, and its third is the side to move.
//
// countFrames() is the figure's telling: a position, its row, another order of
// the pieces, other places for the separators, the position that row folds
// into, the turn passing; then the same again from there.
import type { Colour, State } from '../engine';

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

export type FrameKind = 'board' | 'unfold' | 'reorder' | 'slide' | 'fold' | 'turn';

export interface CountFrame {
  kind: FrameKind;
  /** The row shown, and the position it is: `cells` is `fromRow(row)`, always. */
  row: Row;
  cells: Colour[][];
  /** The side to move the figure shows with the position. */
  turn: Colour;
  /** Where the pieces are drawn in full: on the board, or laid in the row. The other one shows their trace. */
  solid: 'board' | 'row';
}

/**
 * The telling, from the first position through each of the others and back to the
 * first: for each change, the row of the position (unfold), the next position's
 * order of pieces under the same separators (reorder), its separators (slide), the
 * board again (fold), and the turn passing when the next position's differs (turn).
 * The last frame is the first position again, so the telling loops from frame 1.
 */
export function countFrames(positions: readonly Pick<State, 'cells' | 'to_move'>[]): CountFrame[] {
  if (positions.length < 2) fail('the telling needs two positions at least');
  const first = positions[0]!;
  const frame = (kind: FrameKind, row: Row, turn: Colour, solid: 'board' | 'row'): CountFrame => ({ kind, row, cells: fromRow(row), turn, solid });
  let turn = first.to_move;
  const frames = [frame('board', toRow(first.cells), turn, 'board')];
  positions.forEach((p, k) => {
    const next = positions[(k + 1) % positions.length]!;
    const [here, there] = [toRow(p.cells), toRow(next.cells)];
    frames.push(frame('unfold', here, turn, 'row'));
    frames.push(frame('reorder', { order: there.order, bars: here.bars }, turn, 'row'));
    frames.push(frame('slide', there, turn, 'row'));
    frames.push(frame('fold', there, turn, 'board'));
    if (next.to_move !== turn) {
      turn = next.to_move;
      frames.push(frame('turn', there, turn, 'board'));
    }
  });
  return frames;
}

/**
 * Which piece goes where when the row changes its order: `at[d]` is the rank, in the
 * row, of piece `d`. The pieces of one colour keep their order among themselves, so
 * no two of them ever cross: the white piece that came n-th among the white ones
 * takes the n-th white rank of the new order, and the same for red.
 */
export function reassign(at: readonly number[], colours: readonly Colour[], order: readonly Colour[]): number[] {
  const next = new Array<number>(at.length);
  for (const colour of ['White', 'Red'] as const) {
    const pieces = at.map((rank, d) => ({ rank, d })).filter((x) => colours[x.d] === colour).sort((a, b) => a.rank - b.rank);
    const ranks = order.flatMap((c, k) => (c === colour ? [k] : []));
    if (pieces.length !== ranks.length) fail('the new order does not hold the same pieces');
    pieces.forEach((x, n) => (next[x.d] = ranks[n]!));
  }
  return next;
}
