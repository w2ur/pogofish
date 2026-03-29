/** Piece colors */
export type Player = "W" | "R";

export const W: Player = "W";
export const R: Player = "R";

export const BOARD_SIZE = 3;
export const NUM_CELLS = BOARD_SIZE * BOARD_SIZE; // 9
export const MAX_STACK = 12; // Total pieces in game (6W + 6R)

/** A cell is a stack of pieces, bottom to top. */
export type Cell = readonly string[];

/** A board is 9 cells, row-major (0-2 = row 0, 3-5 = row 1, 6-8 = row 2). */
export type Board = readonly Cell[];

/** Immutable game state. */
export interface GameState {
  readonly board: Board;
  readonly currentPlayer: Player;
}

/** A move: pick numPieces from fromCell, place on toCell. */
export interface Move {
  readonly fromCell: number;
  readonly numPieces: number;
  readonly toCell: number;
}

/**
 * Valid Manhattan distances for each pickup count.
 * 1 piece → d=1, 2 pieces → d=2, 3 pieces → d=1 or d=3.
 */
export const DISTANCES: Record<number, readonly number[]> = {
  1: [1],
  2: [2],
  3: [1, 3],
};
