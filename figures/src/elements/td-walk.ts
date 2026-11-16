// What <pogo-td-targets> computes: the TD(λ) targets of one finished game,
// walked backwards, as the trainer does (crates/train/src/td.rs,
// `game_targets`): the net values every position, the last is given its exact
// outcome for its mover instead, and lambdaReturns turns the values into
// targets. The figure shows both from White's view, where the sign flip of the
// mover-relative formula disappears and a target is λ × the next target +
// (1 − λ) × the next value, the essay's sentence. Then the adjustment the
// essay ends on: the net's weights moved to bring each value towards its
// target, several times over (tdRounds, tdScript).
import { DEFAULT_GAME } from '../default-game';
import { LC1_2, replay, terminal, winner, type State, type Triple } from '../engine';
import type { TdNet } from '../nets';
import { lambdaReturns } from '../players';
import type { Store } from '../store';
import { copyLayers, encode, forward, sgdStep } from './td-tune';

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

/** How many times the figure adjusts the net on the game shown. */
export const TD_ROUNDS = 5;

/**
 * The game valued by the net, then by the net adjusted once, twice… on this very
 * game (td-tune.ts, the trainer's step): `walks[0]` is the net as trained, and
 * each adjustment brings the values of `walks[r − 1]` towards its targets, after
 * which the adjusted net values the game again and the targets are computed anew.
 */
export function tdRounds(states: State[], net: Pick<TdNet, 'value' | 'layers'>, rounds = TD_ROUNDS): TdWalk[] {
  const walks = [tdWalk(states, (s) => net.value(s))];
  const layers = copyLayers(net);
  const xs = states.slice(0, -1).map(encode);
  for (let r = 1; r <= rounds; r++) {
    sgdStep(layers, xs, walks[r - 1]!.returns);
    walks.push(tdWalk(states, (s) => forward(layers, encode(s))));
  }
  return walks;
}

/** The mean distance between a position's value and its target, over the game's positions (the last has no target). */
export function meanGap(notes: readonly number[], targets: readonly number[]): number {
  return targets.reduce((sum, g, t) => sum + Math.abs(g - notes[t]!), 0) / targets.length;
}

export interface TdStep {
  /** `climb`: a target is computed (act 1); `adjust`: the net is adjusted; `retarget`: the adjusted net values the game again. */
  kind: 'start' | 'climb' | 'adjust' | 'retarget';
  /** The adjustment, 1…rounds; 0 in act 1. */
  round: number;
  /** The position whose target is computed, on a `climb`. */
  current: number | null;
  /** The positions whose target is known. */
  known: number[];
  /** What the chart shows once the step has settled, from White's view. */
  notes: number[];
  targets: number[];
  /** The values of earlier rounds, left behind as traces. */
  traces: number[][];
  /** The mean gap between `notes` and `targets`; null while some target is not known. */
  gap: number | null;
}

/** The figure's steps: the targets climb back up the game, then the net is adjusted `rounds` times. */
export function tdScript(walks: readonly TdWalk[]): TdStep[] {
  const first = walks[0]!;
  const T = first.returns.length;
  const all = Array.from({ length: T }, (_, i) => T - 1 - i);
  const steps: TdStep[] = [];
  for (let k = 0; k <= T; k++) {
    const f = tdFrame(first, k);
    steps.push({
      kind: k === 0 ? 'start' : 'climb',
      round: 0,
      current: f.current,
      known: f.known,
      notes: first.white.notes,
      targets: first.white.targets,
      traces: [],
      gap: k === T ? meanGap(first.white.notes, first.white.targets) : null,
    });
  }
  for (let r = 1; r < walks.length; r++) {
    const before = walks[r - 1]!.white;
    const after = walks[r]!.white;
    const traces = walks.slice(0, r).map((w) => w.white.notes);
    steps.push({ kind: 'adjust', round: r, current: null, known: all, notes: after.notes, targets: before.targets, traces, gap: meanGap(after.notes, before.targets) });
    steps.push({ kind: 'retarget', round: r, current: null, known: all, notes: after.notes, targets: after.targets, traces, gap: meanGap(after.notes, after.targets) });
  }
  return steps;
}
