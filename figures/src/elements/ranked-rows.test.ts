import { describe, expect, it } from 'vitest';
import { VISIBLE_MOVES, splitRows } from './ranked-rows';

const order = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('splitRows', () => {
  it('shows ten moves at most, in their order, the others hidden', () => {
    expect(VISIBLE_MOVES).toBe(10);
    expect(splitRows(order(16), null)).toEqual({ shown: order(10), hidden: [10, 11, 12, 13, 14, 15] });
    expect(splitRows(order(3), null)).toEqual({ shown: [0, 1, 2], hidden: [] });
  });

  it('keeps the move the search would play visible: it takes the last visible place', () => {
    expect(splitRows(order(16), 13)).toEqual({ shown: [0, 1, 2, 3, 4, 5, 6, 7, 8, 13], hidden: [9, 10, 11, 12, 14, 15] });
    // Already among the ten: nothing moves.
    expect(splitRows(order(16), 4)).toEqual({ shown: order(10), hidden: [10, 11, 12, 13, 14, 15] });
  });

  it('follows the order it is given, not the indices', () => {
    const o = [5, 3, 0, 1, 2, 4];
    expect(splitRows(o, 4, 3)).toEqual({ shown: [5, 3, 4], hidden: [0, 1, 2] });
  });
});
