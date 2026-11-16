import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { features, initial, legal, play, type State } from '../engine';
import { encodingDiff, isSign, pieceColour } from './encoding-diff';
import { INPUTS, PER_CELL, SLOTS } from './encoding-rows';

const enc = (s: State) => ({ x: features(s), toMove: s.to_move });
const count = (xs: string[], k: string) => xs.filter((x) => x === k).length;

describe('what a move does to the 127 inputs', () => {
  it('tells the signs (12 slots and the top, per cell) from the quantities (height, repetitions)', () => {
    expect([0, 11, 12, 14, 26].map(isSign)).toEqual([true, true, true, true, true]);
    expect([13, 27, 125, 126].map(isSign)).toEqual([false, false, false, false]);
  });

  it('+1 is a piece of the player to move, −1 one of the opponent', () => {
    expect(pieceColour(1, 'White')).toBe('White');
    expect(pieceColour(-1, 'White')).toBe('Red');
    expect(pieceColour(1, 'Red')).toBe('Red');
    expect(pieceColour(0, 'Red')).toBeNull();
  });

  it('nothing changed between a position and itself', () => {
    const d = encodingDiff(enc(initial()), enc(initial()));
    expect(d).toHaveLength(INPUTS);
    expect(count(d, 'same')).toBe(INPUTS);
  });

  it('first move a1-1-a2: one slot emptied, one filled, a new top, two heights; every piece left in place flips', () => {
    const s0 = initial();
    const s1 = play(s0, [0, 1, 3]);
    const d = encodingDiff(enc(s0), enc(s1));
    const at = (cell: number, k: number) => d[cell * PER_CELL + k];
    // a1 keeps its bottom piece (flipped), loses its second (changed); its top is still White (flipped); its height changed.
    expect([at(0, 0), at(0, 1), at(0, SLOTS), at(0, SLOTS + 1)]).toEqual(['flipped', 'changed', 'flipped', 'changed']);
    // a2 gains a piece and a top.
    expect([at(3, 0), at(3, SLOTS), at(3, SLOTS + 1)]).toEqual(['changed', 'changed', 'changed']);
    expect(count(d, 'changed')).toBe(5);
    // The 11 pieces that did not move, and the 6 tops that did not change hands (a1's among them).
    expect(count(d, 'flipped')).toBe(11 + 6);
  });

  it('after any legal move, a flipped input is the same piece with the opposite sign, and a changed one differs in what it says (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 30 }), (picks) => {
        let s = initial();
        for (const p of picks) {
          const moves = legal(s);
          if (moves.length === 0) break;
          const next = play(s, moves[p % moves.length]!);
          const b = features(s);
          const a = features(next);
          encodingDiff(enc(s), enc(next)).forEach((kind, i) => {
            if (kind === 'flipped') expect(a[i]).toBe(-b[i]!);
            if (kind === 'flipped') expect(b[i]).not.toBe(0);
            if (kind === 'same') expect(isSign(i) ? a[i] === 0 && b[i] === 0 : a[i] === b[i]).toBe(true);
            if (kind === 'changed' && isSign(i)) expect(a[i] === -b[i]! && a[i] !== 0).toBe(false);
          });
          s = next;
        }
      }),
      { numRuns: 60 },
    );
  });

  it('refuses anything that is not 127 inputs', () => {
    expect(() => encodingDiff({ x: [1, 2], toMove: 'White' }, enc(initial()))).toThrow(/127/);
  });
});
