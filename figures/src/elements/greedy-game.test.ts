import { describe, expect, it } from 'vitest';
import { LC1_2, initial, play, terminal, winner, type State } from '../engine';
import { LOSS_SCORE, WIN_SCORE, greedyMove, mulberry32 } from '../players';
import { greedyGame, nextSeed, parseSeed, scoreText } from './greedy-game';

// `node tools/article-visuals/greedy.mjs OUT moves SEED`, run on 2026-11-16: the tool's games.
const GREEDY_MJS = {
  1: [[1,2,7],[6,1,7],[2,1,1],[7,3,2],[1,1,2],[7,1,4],[2,2,8],[7,1,8],[2,2,4],[8,2,4],[0,1,3],[8,2,2],[3,1,4],[2,1,1],[4,2,2],[1,1,0],[4,2,6],[0,2,2],[4,2,8],[2,3,7],[6,1,7],[2,1,1],[7,2,1],[2,2,8],[6,2,8]],
  2: [[2,1,5],[8,1,5],[0,2,6],[7,1,6],[2,1,5],[6,3,5],[1,1,4],[6,2,4],[1,1,4],[7,1,4]],
  17: [[2,1,5],[8,1,5],[1,2,5],[6,1,3],[0,1,3],[7,2,5],[2,1,5],[8,1,5],[3,2,5],[6,1,7],[5,3,8],[7,1,8],[5,3,8]],
} as const;

const moves = (seed: number) => greedyGame(seed).frames.slice(1).map((f) => f.move);

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
      expect(f.move).toEqual([m.from_cell, m.num_pieces, m.to_cell]);
      s = play(s, m);
    }
  });

  it('each move carries the score that chose it, the number of moves weighed and of moves tied', () => {
    const g = greedyGame(1);
    const first = g.frames[1]!;
    expect(first.mover).toBe('White');
    expect(first.weighed).toBe(16);
    expect(first.tied).toBeGreaterThanOrEqual(1);
    const last = g.frames.at(-1)!;
    expect(last.score).toBe(WIN_SCORE);
    expect(g.finished).toBe(true);
    expect(terminal(last.state, LC1_2)).toBe(true);
    expect(last.result).toEqual({ winner: winner(last.state, LC1_2), byRepetition: false });
    expect(g.frames.slice(0, -1).every((f) => f.result === null)).toBe(true);
  });
});

describe('scoreText', () => {
  it('sentinels are shown as words, never as numbers', () => {
    expect(scoreText('fr', WIN_SCORE)).toBe('gagne');
    expect(scoreText('fr', LOSS_SCORE)).toBe('perd');
    expect(scoreText('en', WIN_SCORE)).toBe('wins');
    expect(scoreText('en', LOSS_SCORE)).toBe('loses');
    for (const lang of ['fr', 'en'] as const) {
      expect(scoreText(lang, WIN_SCORE)).not.toMatch(/\d/);
      expect(scoreText(lang, LOSS_SCORE)).not.toMatch(/\d/);
    }
  });

  it('a difference is signed, with a true minus', () => {
    expect(scoreText('fr', 2)).toBe('+2');
    expect(scoreText('fr', 0)).toBe('0');
    expect(scoreText('fr', -3)).toBe('−3');
  });
});

describe('seeds', () => {
  it('« Nouvelle partie » draws the next seed from the current one, reproducibly, never the same', () => {
    expect(nextSeed(1)).toBe(nextSeed(1));
    let s = 1;
    for (let i = 0; i < 50; i++) {
      const n = nextSeed(s);
      expect(n).not.toBe(s);
      expect(Number.isInteger(n) && n >= 1 && n <= 9999).toBe(true);
      s = n;
    }
  });

  it('the seed attribute is a positive integer, 1 by default', () => {
    expect(parseSeed(null)).toBe(1);
    expect(parseSeed('17')).toBe(17);
    expect(() => parseSeed('x')).toThrow();
    expect(() => parseSeed('0')).toThrow();
  });
});
