import { describe, expect, it } from 'vitest';
import {
  LC1_2,
  initial,
  key,
  legal,
  moveName,
  parseMoveName,
  play,
  replay,
  terminal,
  winner,
  type Triple,
} from './engine';

// Output of tools/article-visuals/shortest.mjs: White wins in three plies.
const SHORTEST_WIN: Triple[] = [
  [1, 2, 7],
  [6, 2, 8],
  [2, 2, 8],
];

// Two plies out, two plies back: the initial position again.
const LOOP: Triple[] = [
  [0, 1, 1],
  [6, 1, 3],
  [1, 1, 0],
  [3, 1, 6],
];

const repeat = (moves: Triple[], times: number): Triple[] =>
  Array.from({ length: times }, () => moves).flat();

describe('engine', () => {
  it('terminal(s, null) returns instead of throwing, and the engine still answers afterwards', () => {
    const s = initial();
    expect(terminal(s, null)).toBe(false);
    expect(winner(s, null)).toBeNull();
    expect(legal(s)).toHaveLength(16);
  });

  it('initial position has 16 legal moves (7 one-piece, 9 two-piece)', () => {
    const moves = legal(initial());
    expect(moves).toHaveLength(16);
    expect(moves.filter((m) => m.num_pieces === 1)).toHaveLength(7);
    expect(moves.filter((m) => m.num_pieces === 2)).toHaveLength(9);
  });

  it('replay of the shortest win ends terminal after 3 plies, winner W', () => {
    const states = replay(SHORTEST_WIN);
    expect(states).toHaveLength(4);
    const last = states[3]!;
    expect(terminal(states[2]!)).toBe(false);
    expect(terminal(last)).toBe(true);
    expect(winner(last)).toBe('W');
  });

  it('the back-and-forth loop returns to the initial key after 4 plies', () => {
    const states = replay(LOOP);
    expect(key(states[4]!)).toBe(key(initial()));
  });

  it('third repetition under LC1_2 loses for the repeater', () => {
    const states = replay(repeat(LOOP, 2));
    expect(terminal(states[4]!, LC1_2)).toBe(false);
    expect(terminal(states[7]!, LC1_2)).toBe(false);
    expect(terminal(states[8]!, LC1_2)).toBe(true);
    // Red made the move (ply 8) that produced the third occurrence.
    expect(winner(states[8]!, LC1_2)).toBe('W');
  });

  it('under game A the same line is not terminal', () => {
    const last = replay(repeat(LOOP, 2)).at(-1)!;
    expect(terminal(last, null)).toBe(false);
    expect(winner(last, null)).toBeNull();
  });

  it('moveName/parseMoveName round-trip all 16 opening moves', () => {
    const s = initial();
    for (const m of legal(s)) {
      const name = moveName(m);
      expect(name).toMatch(/^[abc][123]-[123]-[abc][123]$/);
      expect(parseMoveName(name)).toEqual([m.from_cell, m.num_pieces, m.to_cell]);
    }
    expect(moveName([0, 1, 1])).toBe('a1-1-b1');
  });

  it('play accepts a Move or a Triple and does not mutate its input', () => {
    const s = initial();
    const before = JSON.stringify(s);
    const m = legal(s)[0]!;
    const a = play(s, m);
    const b = play(s, [m.from_cell, m.num_pieces, m.to_cell]);
    expect(key(a)).toBe(key(b));
    expect(JSON.stringify(s)).toBe(before);
  });
});
