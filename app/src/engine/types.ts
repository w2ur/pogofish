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
  /** Move counter — needed by LC2/LC3 cap rules. Preserved from Rust engine. */
  readonly moveCount: number;
  /** Position history keys — needed by LC1 repetition detection. Opaque to TS. */
  readonly positionHistory: readonly unknown[];
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

/**
 * A net's input features, as its training run's config.json names them
 * (crates/infer/src/features.rs). Round-1 nets use "absolute".
 */
export type Features = "absolute" | "mover-relative" | "mover-relative-repetition";

/**
 * Rule variant — must match Rust serde format exactly.
 * LC1: loss on Nth repetition of the (board, to_move) tuple.
 * LC2: hard move cap — if nobody has won by the cap, the player to move loses.
 * LC3: soft cap — player with more towers at cap wins; ties are earned draws.
 */
export type RuleSet =
  | { LC1: { repetitions: number } }
  | { LC2: { cap: number } }
  | { LC3: { cap: number } };

export const RULES_LC1_2: RuleSet = { LC1: { repetitions: 2 } };
export const RULES_LC2_50: RuleSet = { LC2: { cap: 50 } };
export const RULES_LC3_29: RuleSet = { LC3: { cap: 29 } };
