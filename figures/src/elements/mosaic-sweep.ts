// The sweep of <pogo-mosaic>'s main view, apart from the DOM: going from one
// stage's hundred squares to another's, which squares change state, and when.
// A square changes at once (it is in one state or the other); the squares
// change one by one in the order of the games, square k at k × SWEEP_STEP_MS,
// so the three grids, swept together, run in step. Under reduced motion every
// change is at 0. The element hands each square its delay as a CSS custom
// property and lets a zero-length transition do the timing. A stage change
// mid-sweep plans against the target already given to each square, not
// against what is on screen: only the squares whose previous target differs
// get a new delay and state, and a square still waiting on its delay is left
// to CSS, which runs its pending change to that same target. `stateAt` and
// `applySweep` model the grid between and after two targets.
import type { GameMark } from './mosaic-grid';

/** Milliseconds between one game's square and the next: 100 squares sweep in under half a second. */
export const SWEEP_STEP_MS = 5;

export interface SquareState {
  result: 'win' | 'loss';
  mark: GameMark;
}

export interface SweepPlan {
  /** Squares whose state differs, in game order, each with its delay and its new state. */
  changes: { index: number; delay: number; to: SquareState }[];
  /** Delay of the last change: when the grid shows the target stage. */
  duration: number;
}

const same = (a: SquareState, b: SquareState): boolean => a.result === b.result && a.mark === b.mark;

export function sweepPlan(from: readonly SquareState[] | null, to: readonly SquareState[], reduced: boolean): SweepPlan {
  if (from && from.length !== to.length) throw new Error(`pogo-mosaic: a sweep from ${from.length} squares to ${to.length}`);
  const changes = to
    .map((state, index) => ({ index, state }))
    .filter(({ index, state }) => !from || !same(from[index]!, state))
    .map(({ index, state }) => ({ index, delay: reduced ? 0 : index * SWEEP_STEP_MS, to: { ...state } }));
  return { changes, duration: changes.length === 0 ? 0 : changes.at(-1)!.delay };
}

/** What the grid shows `t` ms into a sweep from `from`: the changes whose delay has passed. */
export function stateAt(from: readonly SquareState[], plan: SweepPlan, t: number): SquareState[] {
  const now = from.map((s) => ({ ...s }));
  for (const c of plan.changes) if (c.delay <= t) now[c.index] = { ...c.to };
  return now;
}

/** The grid once the sweep is over. */
export function applySweep(from: readonly SquareState[], plan: SweepPlan): SquareState[] {
  return stateAt(from, plan, Infinity);
}
