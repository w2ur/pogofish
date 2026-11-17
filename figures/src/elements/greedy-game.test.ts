import { describe, expect, it } from 'vitest';
import { LC1_2, initial, legal, play, terminal, winner, type Colour, type State } from '../engine';
import { LOSS_SCORE, WIN_SCORE, greedyMove, mulberry32 } from '../players';
import { GAME_SEED, SHORT_PLIES, gapText, greedyGame, positionKey, stacks, suits, valueRows } from './greedy-game';

// `node tools/article-visuals/greedy.mjs OUT moves SEED`, run on 2026-11-16: the tool's games.
const GREEDY_MJS = {
  1: [[1,2,7],[6,1,7],[2,1,1],[7,3,2],[1,1,2],[7,1,4],[2,2,8],[7,1,8],[2,2,4],[8,2,4],[0,1,3],[8,2,2],[3,1,4],[2,1,1],[4,2,2],[1,1,0],[4,2,6],[0,2,2],[4,2,8],[2,3,7],[6,1,7],[2,1,1],[7,2,1],[2,2,8],[6,2,8]],
  2: [[2,1,5],[8,1,5],[0,2,6],[7,1,6],[2,1,5],[6,3,5],[1,1,4],[6,2,4],[1,1,4],[7,1,4]],
  17: [[2,1,5],[8,1,5],[1,2,5],[6,1,3],[0,1,3],[7,2,5],[2,1,5],[8,1,5],[3,2,5],[6,1,7],[5,3,8],[7,1,8],[5,3,8]],
} as const;

const moves = (seed: number) => greedyGame(seed).frames.slice(1).map((f) => f.choice!.move);

/** The stacks `colour` tops in `s`, counted here from the position alone. */
const tops = (s: State, colour: Colour): number => s.cells.filter((c) => c.length > 0 && c.at(-1) === colour).length;
const other = (c: Colour): Colour => (c === 'White' ? 'Red' : 'White');

describe('greedyGame', () => {
  it('a seed gives the same greedy game twice and another seed another game', () => {
    expect(moves(1)).toEqual(moves(1));
    expect(moves(2)).not.toEqual(moves(1));
  });

  it('plays the games of greedy.mjs, seed for seed', () => {
    for (const [seed, line] of Object.entries(GREEDY_MJS)) expect(moves(Number(seed))).toEqual(line);
  });

  it('each move is the one greedyMove picks with the same generator, under lc1-2', () => {
    const rng = mulberry32(17);
    let s: State = initial();
    for (const f of greedyGame(17).frames.slice(1)) {
      const m = greedyMove(s, rng, LC1_2);
      expect(f.choice!.move).toEqual([m.from_cell, m.num_pieces, m.to_cell]);
      s = play(s, m);
    }
  });
});

describe('the game the figure shows', () => {
  const game = greedyGame();
  const frames = game.frames;

  it('is the default, and the first seed that suits: seed 1’s game is refused, and why', () => {
    expect(game.seed).toBe(GAME_SEED);
    expect(suits(game)).toBe(true);
    for (let seed = 1; seed < GAME_SEED; seed++) expect(suits(greedyGame(seed)), `seed ${seed}`).toBe(false);
    // Seed 1's game is refused for its length alone.
    expect(greedyGame(1).frames.length - 1).toBeGreaterThan(SHORT_PLIES);
    // The controls: a game that meets a position twice is refused, and so is one won by the repetition rule.
    const twice = { ...game, frames: [...game.frames.slice(0, 3), game.frames[1]!, ...game.frames.slice(3)] };
    expect(suits(twice)).toBe(false);
    const last = game.frames.at(-1)!;
    const byRule = { ...game, frames: [...game.frames.slice(0, -1), { ...last, result: { ...last.result!, byRepetition: true } }] };
    expect(suits(byRule)).toBe(false);
  });

  it('is short and ends: a real win, every stack to the winner, nothing after it', () => {
    expect(game.finished).toBe(true);
    expect(frames.length - 1).toBeLessThanOrEqual(SHORT_PLIES);
    const last = frames.at(-1)!;
    expect(terminal(last.state, LC1_2)).toBe(true);
    // Won by the stacks, not by the repetition rule: the game is over under game A's rules too.
    expect(terminal(last.state, null)).toBe(true);
    expect(last.result).toEqual({ winner: winner(last.state, LC1_2), byRepetition: false });
    const loser: Colour = last.result!.winner === 'W' ? 'Red' : 'White';
    expect(tops(last.state, loser)).toBe(0);
    expect(frames.slice(0, -1).every((f) => f.result === null && !terminal(f.state, LC1_2))).toBe(true);
  });

  it('never meets a position twice', () => {
    const keys = frames.map((f) => positionKey(f.state));
    expect(new Set(keys).size).toBe(keys.length);
    // The control: the key tells two positions apart by the side to move alone.
    expect(positionKey({ ...initial(), to_move: 'Red' })).not.toBe(positionKey(initial()));
  });

  it('every move is one the greedy rule allows: legal, and no legal move leaves a better gap', () => {
    frames.slice(1).forEach((f, i) => {
      const before = frames[i]!.state;
      const c = f.choice!;
      const mover = before.to_move;
      expect(c.mover).toBe(mover);
      const options = legal(before);
      expect(c.weighed).toBe(options.length);
      const mine = options.find((m) => m.from_cell === c.move[0] && m.num_pieces === c.move[1] && m.to_cell === c.move[2]);
      expect(mine, `move ${i + 1} is legal`).toBeDefined();
      // The gap of each legal move, recounted here from the position it leads to.
      const gaps = options.map((m) => {
        const next = play(before, m);
        return { gap: tops(next, mover) - tops(next, other(mover)), ends: terminal(next, LC1_2), won: winner(next, LC1_2) === (mover === 'White' ? 'W' : 'R') };
      });
      const played = gaps[options.indexOf(mine!)]!;
      expect(c.gap).toBe(played.gap);
      expect(c.wins).toBe(played.ends && played.won);
      if (c.wins) {
        // A move that wins is taken before any gap: it ties only with the other winning moves.
        expect(c.tied).toBe(gaps.filter((g) => g.ends && g.won).length);
      } else {
        // No move ends this game before its last: the best gap decides, and the ties are the moves that reach it.
        expect(gaps.some((g) => g.ends)).toBe(false);
        expect(played.gap).toBe(Math.max(...gaps.map((g) => g.gap)));
        expect(c.tied).toBe(gaps.filter((g) => g.gap === played.gap).length);
      }
      expect(c.tied).toBeGreaterThanOrEqual(1);
    });
  });

  it('is short enough to show every move greedy weighs: six moves at most', () => {
    expect(SHORT_PLIES).toBe(6);
    expect(frames.length - 1).toBeLessThanOrEqual(6);
  });

  it('each move carries every legal move with what greedy gives it: the gap it leaves, or the end it brings', () => {
    frames.slice(1).forEach((f, i) => {
      const before = frames[i]!.state;
      const mover = before.to_move;
      const c = f.choice!;
      const options = legal(before);
      expect(c.options.map((o) => o.move)).toEqual(options.map((m) => [m.from_cell, m.num_pieces, m.to_cell]));
      c.options.forEach((o, k) => {
        const next = play(before, options[k]!);
        // Recounted here from the position the move leads to.
        const expected = terminal(next, LC1_2)
          ? winner(next, LC1_2) === null
            ? 0
            : winner(next, LC1_2) === (mover === 'White' ? 'W' : 'R')
              ? WIN_SCORE
              : LOSS_SCORE
          : tops(next, mover) - tops(next, other(mover));
        expect(o.score, `move ${i + 1}, option ${k}`).toBe(expected);
      });
    });
  });

  it('valueRows: one row per value, the greatest first, the move played in the first row, ties counted', () => {
    for (const f of frames.slice(1)) {
      const c = f.choice!;
      const rows = valueRows(c);
      const scores = rows.map((r) => r.score);
      expect(scores).toEqual([...new Set(c.options.map((o) => o.score))].sort((a, b) => b - a));
      expect(rows.flatMap((r) => r.moves)).toHaveLength(c.options.length);
      expect(rows.map((r) => r.best)).toEqual(rows.map((_, k) => k === 0));
      expect(rows[0]!.moves).toContainEqual(c.move);
      expect(rows[0]!.moves).toHaveLength(c.tied);
    }
    // The figure's game shows a move where the best greedy can do still leaves it behind.
    expect(frames.slice(1).some((f) => valueRows(f.choice!)[0]!.score < 0)).toBe(true);
  });

  it('each frame counts the stacks of its own position', () => {
    for (const f of frames) expect(f.stacks).toEqual({ white: tops(f.state, 'White'), red: tops(f.state, 'Red') });
    expect(frames[0]!.stacks).toEqual({ white: 3, red: 3 });
    expect(stacks(initial())).toEqual({ white: 3, red: 3 });
  });
});

describe('gapText', () => {
  it('a gap is signed, with a true minus', () => {
    expect(gapText(2)).toBe('+2');
    expect(gapText(0)).toBe('0');
    expect(gapText(-3)).toBe('−3');
  });
});
