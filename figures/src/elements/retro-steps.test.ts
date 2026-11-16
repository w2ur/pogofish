import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TableData } from '../data';
import { key, legal, moveName, play, terminal, winner } from '../engine';
import { retroSteps } from './retro-steps';

const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
const clone = (): TableData => JSON.parse(JSON.stringify(table)) as TableData;

describe('retroSteps', () => {
  it('retrograde steps go lost-0 → won-1 → lost-2 in that order', () => {
    const steps = retroSteps(table);
    expect(steps.map((s) => s.label)).toEqual(['lost-0', 'won-1', 'lost-2']);
    expect(steps.map((s) => [s.outcome, s.plies])).toEqual([
      ['lost', 0],
      ['won', 1],
      ['lost', 2],
    ]);
  });

  it('letters the positions A to E across the three steps', () => {
    expect(retroSteps(table).map((s) => s.boards.map((b) => b.letter))).toEqual([['A', 'B'], ['C', 'D'], ['E']]);
  });

  it('lost-0: every stack is the other side’s, with the loser to move', () => {
    for (const b of retroSteps(table)[0]!.boards) {
      expect(terminal(b.state, null)).toBe(true);
      expect(winner(b.state, null)).toBe(b.state.to_move === 'White' ? 'R' : 'W');
    }
  });

  it('won-1: each move lands on the lost-0 position it names', () => {
    const [lost0, won1] = retroSteps(table);
    for (const b of won1!.boards) {
      expect(b.moves).toHaveLength(1);
      const m = b.moves[0]!;
      expect(m.toLetter).toBe(lost0!.boards[m.to]!.letter);
      expect(key(play(b.state, m.move))).toBe(key(lost0!.boards[m.to]!.state));
    }
  });

  it('lost-2: its moves are all of legal(), and each lands on a won-1 position', () => {
    const [, won1, lost2] = retroSteps(table);
    const b = lost2!.boards[0]!;
    expect(b.moves.map((m) => moveName(m.move)).sort()).toEqual(legal(b.state).map(moveName).sort());
    expect(b.moves.map((m) => moveName(m.move))).toEqual(['c1-1-b1', 'c1-1-c2']);
    for (const m of b.moves) expect(key(play(b.state, m.move))).toBe(key(won1!.boards[m.to]!.state));
  });

  it('refuses data that would draw a false step', () => {
    const missing = clone();
    missing.retro[2]!.positions[0]!.moves!.pop();
    expect(() => retroSteps(missing)).toThrow(/every legal move/);
    const wrongTarget = clone();
    wrongTarget.retro[1]!.positions[0]!.moves![0]!.to = 1;
    expect(() => retroSteps(wrongTarget)).toThrow();
    // Moves from two stacks would be drawn with one ring: refused, not drawn wrong.
    const twoStacks = clone();
    twoStacks.retro[2]!.positions[0]!.moves![1]!.move = [1, 1, 4];
    expect(() => retroSteps(twoStacks)).toThrow(/more than one stack/);
    const reordered = clone();
    reordered.retro.reverse();
    expect(() => retroSteps(reordered)).toThrow();
  });
});
