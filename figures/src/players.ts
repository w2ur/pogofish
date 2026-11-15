// The greedy player, the Q-learning update and the TD(lambda) targets, as the
// Rust crates compute them: crates/search/src/players.rs, qtab.rs and
// crates/infer/src/returns.rs. Pure TypeScript over the engine's rules.
import { LC1_2, legal, play, terminal, winner, type Move, type Rules, type State } from './engine';

/**
 * Greedy's sentinels are the Rust integers, not +/-Infinity, so a score
 * compares with the fixture's `greedy_score` by plain equality: `i32::MAX`
 * for a move that wins, `i32::MIN + 1` for one that loses.
 */
export const WIN_SCORE = 2 ** 31 - 1;
export const LOSS_SCORE = -(2 ** 31) + 1;

/** mulberry32, the seeded generator of tools/article-visuals/greedy.mjs. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const tops = (s: State, colour: State['to_move']): number =>
  s.cells.reduce((n, c) => n + (c.length > 0 ? (c[c.length - 1] === colour ? 1 : 0) : 0), 0);

/**
 * What greedy maximises for each legal move, in engine order: WIN_SCORE for a
 * move that wins, LOSS_SCORE for one that loses, 0 for an earned draw,
 * otherwise the mover's stacks on top minus the opponent's after the move
 * (`greedy_score` in players.rs).
 */
export function greedyScores(s: State, rules: Rules = LC1_2): { move: Move; score: number }[] {
  const mover = s.to_move;
  const code = mover === 'White' ? 'W' : 'R';
  return legal(s).map((move) => {
    const next = play(s, move);
    if (!terminal(next, rules)) {
      const other = mover === 'White' ? 'Red' : 'White';
      return { move, score: tops(next, mover) - tops(next, other) };
    }
    const w = winner(next, rules);
    return { move, score: w === null ? 0 : w === code ? WIN_SCORE : LOSS_SCORE };
  });
}

/** A maximal-score move; ties are drawn with `rng`, as greedy.mjs does. */
export function greedyMove(s: State, rng: () => number, rules: Rules = LC1_2): Move {
  const scored = greedyScores(s, rules);
  const best = Math.max(...scored.map((x) => x.score));
  const tied = scored.filter((x) => x.score === best);
  return tied[Math.floor(rng() * tied.length)]!.move;
}

/**
 * Q(s, m) of qtab.rs: the exact result for the mover (+1 win, -1 loss, 0
 * earned draw) if `m` ends the game, else minus the value of the position
 * after it, which is the opponent's.
 */
export function qTarget(s: State, m: Move, v: (s: State) => number, rules: Rules = LC1_2): number {
  const next = play(s, m);
  if (!terminal(next, rules)) return -v(next);
  const w = winner(next, rules);
  if (w === null) return 0;
  return w === (s.to_move === 'White' ? 'W' : 'R') ? 1 : -1;
}

/** One step of V(s) += alpha * (target - V(s)). */
export function qUpdate(v: number, target: number, alpha = 0.1): number {
  return v + alpha * (target - v);
}

/**
 * The lambda-returns G_0..G_{T-1} of `values` = V(s_0)..V(s_T), V(s_T) being
 * the exact outcome or the net's estimate. Each value is from its own mover's
 * side, hence the sign flip: G_t = -[(1 - l) V(s_{t+1}) + l G_{t+1}], G_T = V(s_T).
 */
export function lambdaReturns(values: number[], lambda = 0.7): number[] {
  const end = values.length - 1;
  const g = new Array<number>(end);
  let next = values[end]!;
  for (let t = end - 1; t >= 0; t--) {
    g[t] = -((1 - lambda) * values[t + 1]! + lambda * next);
    next = g[t]!;
  }
  return g;
}
