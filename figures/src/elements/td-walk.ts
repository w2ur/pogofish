// What <pogo-td-targets> computes: the TD(λ) targets of one finished game,
// walked backwards, as the trainer does (crates/train/src/td.rs,
// `game_targets`): the net values every position, the last is given its exact
// outcome for its mover instead, and lambdaReturns turns the values into
// targets. The figure shows both from White's view, where the sign flip of the
// mover-relative formula disappears and a target is λ × the next target +
// (1 − λ) × the next value, the essay's sentence.
import { DEFAULT_GAME } from '../default-game';
import { LC1_2, replay, terminal, winner, type State, type Triple } from '../engine';
import { lambdaReturns } from '../players';
import type { Store } from '../store';

/** The λ the TD net was trained with: models/v4-td-lc1-s1/config.json, `"lambda": 0.7`. */
export const TD_LAMBDA = 0.7;

export interface TdGame {
  source: 'reader' | 'default';
  moves: readonly Triple[];
  states: State[];
  result: 'W' | 'R' | null;
}

/** The reader's last finished game, else DEFAULT_GAME. */
export function tdGame(store: Pick<Store, 'lastFinished'>): TdGame {
  const g = store.lastFinished();
  if (g) return { source: 'reader', moves: g.moves, states: g.states, result: g.result };
  const states = replay(DEFAULT_GAME as Triple[]);
  return { source: 'default', moves: DEFAULT_GAME, states, result: winner(states.at(-1)!, LC1_2) };
}

export interface TdWalk {
  /** V(s_0)…V(s_T), each for its mover; V(s_T) is the exact outcome. */
  values: number[];
  /** G_0…G_{T−1}, each for its mover: lambdaReturns(values, TD_LAMBDA). */
  returns: number[];
  /** The same from White's view: +1 White wins, −1 Red wins. */
  white: { notes: number[]; targets: number[] };
}

const toWhite = (s: State, v: number): number => (s.to_move === 'White' ? v : -v);

export function tdWalk(states: State[], value: (s: State) => number): TdWalk {
  const last = states.at(-1);
  if (!last || states.length < 2 || !terminal(last, LC1_2)) throw new Error('pogo-figures: TD(λ) targets need a finished game');
  const w = winner(last, LC1_2);
  const outcome = w === null ? 0 : (w === 'W') === (last.to_move === 'White') ? 1 : -1;
  const values = states.map((s, t) => (t === states.length - 1 ? outcome : value(s)));
  const returns = lambdaReturns(values, TD_LAMBDA);
  return {
    values,
    returns,
    white: { notes: values.map((v, t) => toWhite(states[t]!, v)), targets: returns.map((g, t) => toWhite(states[t]!, g)) },
  };
}

/**
 * Step `k` of the walk, 0…T + 1: at 0 no target is known; at k the targets of the
 * last k positions before the end are, the one computed at this step being `current`;
 * at T + 1 every target is known and none is being computed.
 */
export function tdFrame(walk: TdWalk, k: number): { current: number | null; known: number[] } {
  const T = walk.returns.length;
  if (k <= 0) return { current: null, known: [] };
  if (k > T) return { current: null, known: Array.from({ length: T }, (_, i) => T - 1 - i) };
  const n = Math.min(k, T);
  return { current: T - n, known: Array.from({ length: n }, (_, i) => T - 1 - i) };
}
