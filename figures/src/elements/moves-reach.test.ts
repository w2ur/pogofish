import { describe, expect, it } from 'vitest';
import { initial, legal, play } from '../engine';
import { reach, reachText } from './moves-reach';

describe('reach', () => {
  it('from the start position, cell a1 reaches exactly the cells legal() lists', () => {
    const moves = legal(initial());
    const r = reach(moves, 0);
    // Rebuilt from legal() alone: every (count, destination) pair leaving a1, and nothing else.
    const expected = new Map<number, number[]>();
    for (const m of moves.filter((m) => m.from_cell === 0)) {
      expected.set(m.num_pieces, [...(expected.get(m.num_pieces) ?? []), m.to_cell].sort((a, b) => a - b));
    }
    expect(r).toEqual([...expected].sort(([a], [b]) => a - b).map(([count, cells]) => ({ count, cells })));
    // As the rules say: one piece one step, two pieces two steps, never back to a1.
    expect(r).toEqual([
      { count: 1, cells: [1, 3] },
      { count: 2, cells: [2, 4, 6] },
    ]);
  });

  it('is empty for a stack the side to move cannot lift', () => {
    expect(reach(legal(initial()), 6)).toEqual([]);
    expect(reach(legal(initial()), 4)).toEqual([]);
  });

  it('offers three pieces once a stack holds three of the mover’s', () => {
    // a1-1-b1 gives b1 three pieces, White on top; Red replies; White may now lift three.
    const s = play(play(initial(), [0, 1, 1]), [6, 1, 3]);
    expect(reach(legal(s), 1).map((r) => r.count)).toEqual([1, 2, 3]);
  });
});

describe('reachText', () => {
  it('names the stack, the count and the cells, in each language', () => {
    expect(reachText('fr', 0, 2, [2, 4, 6])).toBe('a1, 2 pièces : c1, b2, a3');
    expect(reachText('en', 0, 1, [1, 3])).toBe('a1, 1 piece: b1, a2');
  });
});
