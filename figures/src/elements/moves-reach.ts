// What <pogo-moves view="moves"> shows, apart from the DOM: from a stack, the
// cells each count of pieces can reach. Everything comes from legal(); nothing
// here knows the rules.
import { cellName, counts, destinations } from '../board-state';
import type { Move } from '../engine';
import { colon, t, type Lang } from '../kit/strings';

export interface Reach {
  count: number;
  cells: number[];
}

/** For each count that can leave `from`, the cells it can land on, both ascending. */
export function reach(moves: readonly Move[], from: number): Reach[] {
  return counts(moves, from).map((count) => ({ count, cells: destinations(moves, from, count) }));
}

/** « a1, 2 pièces : c1, b2, a3 » / "a1, 1 piece: b1, a2". */
export function reachText(lang: Lang, from: number, count: number, cells: readonly number[]): string {
  const unit = t(lang, count === 1 ? 'piece' : 'piecesUnit');
  return `${cellName(from)}, ${count} ${unit}${colon(lang)} ${cells.map(cellName).join(', ')}`;
}
