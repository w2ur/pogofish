/**
 * Mirrors the Rust InsightsPayload schema in `crates/train/src/analyze.rs`.
 * Produced by the `analyze` binary, consumed by LearningsScene.
 */

export interface InsightsPayload {
  model_id: string;
  variant: string;
  games_played: number;
  avg_game_length: number;
  draw_rate: number;
  white_win_rate: number;
  red_win_rate: number;
  opening_move_distribution: OpeningCount[];
  capture_timing_histogram: number[];
  stack_size_at_endgame: number[];
  policy_probes: PolicyProbe[];
}

export interface OpeningCount {
  from_cell: number;
  to_cell: number;
  num_pieces: number;
  count: number;
  frequency: number;
}

export interface PolicyProbe {
  label: string;
  board: string[][];
  top_moves: TopMove[];
  value_estimate: number;
}

export interface TopMove {
  from_cell: number;
  to_cell: number;
  num_pieces: number;
  probability: number;
}

export async function loadInsights(): Promise<InsightsPayload> {
  const res = await fetch("/data/lc3-29-insights.json");
  if (!res.ok) throw new Error(`failed to load insights: ${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Convenience helpers                                                */
/* ------------------------------------------------------------------ */

export function findProbe(
  payload: InsightsPayload,
  label: string,
): PolicyProbe | null {
  return payload.policy_probes.find((p) => p.label === label) ?? null;
}

export function cellLabel(index: number): string {
  // Cells 0-8 in row-major order; our coord labels match the StoryBoard layout.
  const coords = ["a3", "b3", "c3", "a2", "b2", "c2", "a1", "b1", "c1"];
  return coords[index] ?? `cell ${index}`;
}

/** Format a Pogo move with the stack size moved.
 *  Reads as "a3 → b3 [×2]". The stack size is what makes a Pogo move
 *  unambiguous — the same source/destination pair can be played by
 *  moving 1, 2, or 3 pieces, and they are different moves. */
export function moveLabel(fromIdx: number, toIdx: number, numPieces: number): string {
  return `${cellLabel(fromIdx)} → ${cellLabel(toIdx)} [×${numPieces}]`;
}

export function formatPercent(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}
