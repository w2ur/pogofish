/**
 * Stable piece identity for the 12-move story game.
 *
 * Pogo pieces don't have inherent identity, but for animation we need
 * each on-screen disc to track which physical piece it is across moves.
 * We assign IDs based on the initial position and replay the move list,
 * always taking pieces from the TOP of a stack (Pogo's stacking rules).
 */

export type PieceColor = "W" | "R";
export type PieceId = string; // e.g. "W0".."W5", "R0".."R5"

export interface TrackedPiece {
  id: PieceId;
  color: PieceColor;
  cell: number; // 0..8
  stackIdx: number; // 0 = bottom of stack
}

/** Cells: 0..8 in row-major order, row 0 = a3..c3 (top), row 2 = a1..c1 (bottom). */
export const NUM_CELLS = 9;
export const COLS = ["a", "b", "c"];

export interface Move {
  from: number;
  to: number;
  count: number;
  /** Convenience label, e.g. "b1→b2 (1)" */
  label: string;
  /** Which color is moving (the top piece of the lifted stack) */
  mover: PieceColor;
}

/** The 12 half-moves of the legal story game, indices into 0..8.
 *  Cells map: row 3 = 0,1,2 ; row 2 = 3,4,5 ; row 1 = 6,7,8.
 *  Comments mirror data.ts. */
export const MOVES: Move[] = [
  { from: 7, to: 4, count: 1, label: "b1→b2", mover: "W" }, // 1  W
  { from: 1, to: 4, count: 1, label: "b3→b2", mover: "R" }, // 2  R
  { from: 6, to: 0, count: 2, label: "a1→a3", mover: "W" }, // 3  W
  { from: 2, to: 8, count: 2, label: "c3→c1", mover: "R" }, // 4  R
  { from: 7, to: 6, count: 1, label: "b1→a1", mover: "W" }, // 5  W
  { from: 4, to: 5, count: 1, label: "b2→c2", mover: "R" }, // 6  R (R on top)
  { from: 0, to: 2, count: 2, label: "a3→c3", mover: "W" }, // 7  W
  { from: 8, to: 6, count: 2, label: "c1→a1", mover: "R" }, // 8  R
  { from: 4, to: 3, count: 1, label: "b2→a2", mover: "W" }, // 9  W
  { from: 5, to: 4, count: 1, label: "c2→b2", mover: "R" }, // 10 R
  { from: 2, to: 5, count: 1, label: "c3→c2", mover: "W" }, // 11 W
  { from: 6, to: 7, count: 1, label: "a1→b1", mover: "R" }, // 12 R
];

/**
 * Replay the moves and produce a frame per state (13 frames total: F0..F12).
 * Each frame is a flat list of all 12 pieces with their current cell + stack index.
 */
export function buildTrackedFrames(): TrackedPiece[][] {
  const cells: PieceId[][] = [
    ["R0", "R1"], ["R2", "R3"], ["R4", "R5"],
    [], [], [],
    ["W0", "W1"], ["W2", "W3"], ["W4", "W5"],
  ];

  const snapshot = (): TrackedPiece[] => {
    const out: TrackedPiece[] = [];
    cells.forEach((stack, cell) => {
      stack.forEach((id, stackIdx) => {
        out.push({ id, color: id[0] as PieceColor, cell, stackIdx });
      });
    });
    return out;
  };

  const frames: TrackedPiece[][] = [snapshot()];

  for (const m of MOVES) {
    const moving = cells[m.from]!.splice(-m.count, m.count);
    cells[m.to]!.push(...moving);
    frames.push(snapshot());
  }

  return frames;
}

/** Index a piece by its stable ID from a frame. */
export function pieceMap(frame: TrackedPiece[]): Map<PieceId, TrackedPiece> {
  const m = new Map<PieceId, TrackedPiece>();
  for (const p of frame) m.set(p.id, p);
  return m;
}

export const TRACKED_FRAMES = buildTrackedFrames();
export const ALL_PIECE_IDS: PieceId[] = TRACKED_FRAMES[0]!.map((p) => p.id);
