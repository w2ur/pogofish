import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LC1_2, initial, legal, play, replay, terminal, winner, type State, type Triple } from './engine';
import { LOSS_SCORE, WIN_SCORE, greedyMove, greedyScores, lambdaReturns, mulberry32, qTarget, qUpdate } from './players';

interface Position {
  label: string;
  state: State;
  td: number;
  legal: Triple[];
  greedy: number[];
}

interface Reference {
  positions: Position[];
  openingWin: { first: number; outcome: number; lambda: number; returns: number[] };
}

const reference = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json')).toString()) as Reference;
const lines = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/lines.json')).toString()) as { openingWin: Triple[] };

const triple = (m: { from_cell: number; num_pieces: number; to_cell: number }): Triple => [
  m.from_cell,
  m.num_pieces,
  m.to_cell,
];

describe('greedy', () => {
  it('greedy scores equal Rust on every fixture position', () => {
    for (const p of reference.positions) {
      const scores = greedyScores(p.state);
      expect(scores.map((x) => triple(x.move)), p.label).toEqual(p.legal);
      expect(scores.map((x) => x.score), p.label).toEqual(p.greedy);
    }
  });

  it('the fixture exercises the win sentinel and the top difference', () => {
    const all = reference.positions.flatMap((p) => p.greedy);
    expect(all).toContain(WIN_SCORE);
    expect(all.some((x) => x !== WIN_SCORE && x !== LOSS_SCORE)).toBe(true);
  });

  it('a winning move scores WIN_SCORE', () => {
    const win = reference.positions.find((p) => p.greedy.includes(WIN_SCORE))!;
    const m = greedyScores(win.state).find((x) => x.score === WIN_SCORE)!.move;
    expect(winner(play(win.state, m), LC1_2)).toBe(win.state.to_move === 'White' ? 'W' : 'R');
  });

  // Mirrors greedy_avoids_a_losing_move_under_a_variant (players.rs): after
  // seven plies of a back-and-forth loop, Red's move 3-1-6 would produce its
  // own third occurrence, which loses under lc1-2.
  describe('a move that repeats the mover\'s own third occurrence', () => {
    const loop: Triple[] = [[0, 1, 1], [6, 1, 3], [1, 1, 0], [3, 1, 6]];
    const s = replay(Array.from({ length: 7 }, (_, i) => loop[i % 4]!)).at(-1)!;
    const losing: Triple = [3, 1, 6];

    it('scores LOSS_SCORE and is never chosen by greedyMove', () => {
      expect(s.to_move).toBe('Red');
      const scored = greedyScores(s);
      expect(scored.find((x) => triple(x.move).join() === losing.join())!.score).toBe(LOSS_SCORE);
      expect(scored.length).toBeGreaterThan(1);
      for (let seed = 0; seed < 200; seed++) {
        expect(triple(greedyMove(s, mulberry32(seed)))).not.toEqual(losing);
      }
    });

    it('has a qTarget of -1', () => {
      const m = legal(s).find((x) => triple(x).join() === losing.join())!;
      expect(qTarget(s, m, () => 0.5)).toBe(-1);
    });
  });

  // The expected list is the output of
  //   node tools/article-visuals/greedy.mjs OUT moves 4
  // (greedy.mjs seeds game 4 with its own mulberry32 and draws ties from it);
  // it printed 8 plies.
  const GAME_4: Triple[] = [[2, 2, 8], [7, 1, 8], [0, 2, 6], [8, 3, 1], [6, 1, 7], [8, 1, 7], [6, 3, 1], [7, 2, 1]];

  it("greedyMove with seed 4 replays greedy.mjs's game 4", () => {
    const rng = mulberry32(4);
    let s = initial();
    const played: Triple[] = [];
    while (!terminal(s, LC1_2) && played.length < 200) {
      const m = greedyMove(s, rng);
      played.push(triple(m));
      s = play(s, m);
    }
    expect(played).toEqual(GAME_4);
  });

  it('greedyMove only returns a maximal-score move', () => {
    for (const p of reference.positions.filter((q) => q.legal.length > 0)) {
      const best = Math.max(...p.greedy);
      for (let seed = 0; seed < 5; seed++) {
        const m = greedyMove(p.state, mulberry32(seed));
        const score = greedyScores(p.state).find((x) => triple(x.move).join() === triple(m).join())!.score;
        expect(score, p.label).toBe(best);
      }
    }
  });
});

describe('qTarget and qUpdate', () => {
  it('qUpdate(0, 1) === 0.1', () => {
    expect(qUpdate(0, 1)).toBe(0.1);
  });

  it('qUpdate moves by alpha of the gap', () => {
    expect(qUpdate(0.5, -0.5, 0.25)).toBeCloseTo(0.25, 12);
  });

  // Invariant: one update lands between the old value and the target.
  it('qUpdate never leaves [min(v,t), max(v,t)]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (v, t, alpha) => {
          const u = qUpdate(v, t, alpha);
          const eps = 1e-12;
          expect(u).toBeGreaterThanOrEqual(Math.min(v, t) - eps);
          expect(u).toBeLessThanOrEqual(Math.max(v, t) + eps);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('qTarget is +1 for a winning move, and -v(next) otherwise', () => {
    const p = reference.positions.find((q) => q.greedy.includes(WIN_SCORE))!;
    const scores = greedyScores(p.state);
    const win = scores.find((x) => x.score === WIN_SCORE)!.move;
    const quiet = scores.find((x) => x.score !== WIN_SCORE)!.move;
    const v = (): number => 0.37;
    expect(qTarget(p.state, win, v)).toBe(1);
    expect(qTarget(p.state, quiet, v)).toBe(-0.37);
  });
});

describe('lambdaReturns', () => {
  it('equals the fixture\'s lambda_returns within 1e-6', () => {
    const { first, outcome, lambda, returns } = reference.openingWin;
    const values = replay(lines.openingWin).map((_, i) => reference.positions[first + i]!.td);
    values[values.length - 1] = outcome;
    const got = lambdaReturns(values, lambda);
    expect(got).toHaveLength(returns.length);
    got.forEach((g, t) => expect(Math.abs(g - returns[t]!), `G_${t}`).toBeLessThanOrEqual(1e-6));
  });

  it('defaults to lambda 0.7 and gives no target for a game over at the start', () => {
    expect(lambdaReturns([-1])).toEqual([]);
    expect(lambdaReturns([0, 0.5, -1])).toEqual(lambdaReturns([0, 0.5, -1], 0.7));
  });

  it('lambda 1 is the game result with alternating signs', () => {
    expect(lambdaReturns([0.3, -0.2, 0.9, -1], 1)).toEqual([1, -1, 1]);
  });
});

describe('mulberry32', () => {
  it('is reproducible and in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
