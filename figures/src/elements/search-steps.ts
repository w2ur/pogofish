// What <pogo-search> runs and keeps: AlphaZero's search on one position, 100
// simulations as the board's normal level (mcts.ts, the bench's count), every
// snapshot search() emits and every simulation's trace (recordFull); the figure
// stops after 1, 2, 3, 5, 10, 20, 50 and 100 of them (search-script.ts), each
// one the snapshot emitted then, never a value made up between two. Puzzle 5 is the position of
// docs/experiments/v5/puzzles/az-s1-p100.json, rebuilt from its diagram as
// tools/article-visuals/azsearch.mjs does; search-steps.test.ts holds it to the
// fixture's.
import type { State } from '../engine';
import type { SearchSnapshot, SimulationTrace } from '../mcts';

export const STOPS = [1, 2, 3, 5, 10, 20, 50, 100] as const;
export const SEARCH_SIMS: number = STOPS[STOPS.length - 1]!;

/** Red to move; each stack bottom first. */
export const PUZZLE5: State = {
  cells: [[], ['Red', 'Red', 'White', 'White', 'White'], [], [], ['Red', 'White', 'Red'], ['White'], ['Red', 'White'], ['Red'], []],
  to_move: 'Red',
  move_count: 0,
  history: [],
};

export type SearchRun = (o: {
  onSnapshot: (s: SearchSnapshot) => void;
  /** Asked for by recordFull: what each simulation did. */
  onTrace?: (t: SimulationTrace) => void;
  signal: AbortSignal;
}) => Promise<SearchSnapshot>;

/** Indices of the root rows, the net's strongest preference first, ties in engine order: one order for every step. */
export function rowOrder(snapshot: SearchSnapshot): number[] {
  return snapshot.root.map((_, i) => i).sort((a, b) => snapshot.root[b]!.prior - snapshot.root[a]!.prior || a - b);
}

/** Every snapshot (`snaps[k]` after k + 1 simulations) and every simulation's trace of one run; rejects with an `AbortError` when `signal` aborts. */
export async function recordFull(run: SearchRun, signal: AbortSignal): Promise<{ snaps: SearchSnapshot[]; traces: SimulationTrace[] }> {
  const snaps: SearchSnapshot[] = [];
  const traces: SimulationTrace[] = [];
  await run({ signal, onSnapshot: (s) => void snaps.push(s), onTrace: (t) => void traces.push(t) });
  if (snaps.length !== SEARCH_SIMS || traces.length !== SEARCH_SIMS) {
    throw new Error(`pogo-figures: the search reported ${snaps.length} snapshots and ${traces.length} traces, not ${SEARCH_SIMS}`);
  }
  return { snaps, traces };
}
