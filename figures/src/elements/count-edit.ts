// What the reader may change in <pogo-count>, apart from the DOM. The row is
// 20 places, twelve pieces and eight separators (count-row.ts): the reader
// swaps any two of them, and the position the row folds into follows. On the
// board the reader moves the top piece of a square onto another square, and
// the row follows. Both edits keep twelve pieces, six of each colour, and
// eight separators, so every edit is a position, and every position can be
// reached either way.
import type { Colour } from '../engine';
import { BARS, CELLS, PIECES, fromRow, places, toRow, type Row } from './count-row';

export type Item = Colour | 'bar';

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

/** Places `a` and `b` of the row change contents. */
export function swapItems(row: Row, a: number, b: number): Row {
  const items = rowItems(row);
  for (const i of [a, b]) if (!Number.isInteger(i) || i < 0 || i >= items.length) fail(`place ${i} is out of the row`);
  [items[a], items[b]] = [items[b]!, items[a]!];
  return itemsRow(items);
}

/** The top piece of square `from` goes on top of square `to`. */
export function moveTop(row: Row, from: number, to: number): Row {
  const cells = fromRow(row);
  for (const i of [from, to]) if (!Number.isInteger(i) || i < 0 || i >= CELLS) fail(`square ${i} is off the board`);
  if (from === to) fail('a piece moved onto its own square does not move');
  const piece = cells[from]!.pop();
  if (piece === undefined) fail(`square ${from} is empty`);
  cells[to]!.push(piece!);
  return toRow(cells);
}
