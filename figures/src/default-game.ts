// The game the figures show when the reader has finished none: part 1's
// nine-ply White win, `lines.openingWin` of public/data/table.json. A literal,
// so the store knows it without a fetch; store.test.ts checks it against the
// fixture and the data file.
import type { Triple } from './engine';

export const DEFAULT_GAME: readonly Triple[] = Object.freeze([
  [2, 1, 1],
  [7, 2, 1],
  [0, 1, 1],
  [6, 1, 3],
  [1, 3, 8],
  [3, 1, 0],
  [1, 1, 0],
  [6, 1, 3],
  [0, 3, 3],
] as Triple[]);
