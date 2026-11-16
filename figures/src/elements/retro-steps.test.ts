import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TableData } from '../data';
import { key, legal, moveName, play, terminal, winner } from '../engine';
import { nextMarks, retroSteps } from './retro-steps';

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
    expect(steps.map((s) => s.boards.length)).toEqual([2, 2, 1]);
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
      expect(m.mover).toBe(b.state.to_move);
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

  it('the sentences of the figure hold on the engine: who owns the stacks, one move, every move', () => {
    const [lost0, won1, lost2] = retroSteps(table);
    // « Toutes les piles appartiennent à l’adversaire ».
    for (const b of lost0!.boards) {
      const tops = b.state.cells.filter((c) => c.length > 0).map((c) => c.at(-1));
      expect(tops.length).toBeGreaterThan(0);
      expect(tops.every((c) => c !== b.state.to_move)).toBe(true);
    }
    const lost0Keys = lost0!.boards.map((b) => key(b.state));
    const won1Keys = won1!.boards.map((b) => key(b.state));
    // « Un coup mène à une position perdue pour l’adversaire »: at least one legal move does.
    for (const b of won1!.boards) expect(legal(b.state).some((m) => lost0Keys.includes(key(play(b.state, m))))).toBe(true);
    // « Tous les coups mènent à une position gagnée pour l’adversaire »: every legal move does.
    for (const b of lost2!.boards) expect(legal(b.state).every((m) => won1Keys.includes(key(play(b.state, m))))).toBe(true);
    // The side to move changes along every arrow: « pour l’adversaire ».
    for (const b of [...won1!.boards, ...lost2!.boards]) {
      for (const m of b.moves) expect(play(b.state, m.move).to_move).not.toBe(b.state.to_move);
    }
  });

  it('« et ainsi de suite »: the next two marks are won in 3, then lost in 4', () => {
    expect(nextMarks(retroSteps(table))).toEqual([
      { outcome: 'won', plies: 3 },
      { outcome: 'lost', plies: 4 },
    ]);
  });

  it('refuses data that would draw a false step', () => {
    const missing = clone();
    missing.retro[2]!.positions[0]!.moves!.pop();
    expect(() => retroSteps(missing)).toThrow(/every legal move/);
    const wrongTarget = clone();
    wrongTarget.retro[1]!.positions[0]!.moves![0]!.to = 1;
    expect(() => retroSteps(wrongTarget)).toThrow();
    // A final position no arrow reaches would stand alone in the tree.
    const orphan = clone();
    orphan.retro[0]!.positions.push(orphan.retro[0]!.positions[0]!);
    expect(() => retroSteps(orphan)).toThrow(/reached by no move/);
    const reordered = clone();
    reordered.retro.reverse();
    expect(() => retroSteps(reordered)).toThrow();
  });
});
