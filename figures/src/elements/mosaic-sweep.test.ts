import { describe, expect, it } from 'vitest';
import { SWEEP_MS, SWEEP_STEP_MS, shownStages, sweepDelay } from './mosaic-sweep';

describe('the mosaic’s sweep', () => {
  it('fills the squares in the order of the games, one step apart', () => {
    expect(sweepDelay(0)).toBe(0);
    expect(sweepDelay(1)).toBe(SWEEP_STEP_MS);
    for (let k = 1; k < 100; k++) expect(sweepDelay(k) - sweepDelay(k - 1)).toBe(SWEEP_STEP_MS);
  });

  it('a stage is filled when its last square is: under half a second', () => {
    expect(SWEEP_MS).toBe(sweepDelay(99));
    expect(SWEEP_MS).toBeLessThan(500);
  });

  it('refuses a game the mosaic does not hold', () => {
    expect(() => sweepDelay(100)).toThrow(/no game 100/);
    expect(() => sweepDelay(-1)).toThrow();
    expect(() => sweepDelay(1.5)).toThrow();
  });

  it('a step shows every stage up to its own', () => {
    expect(shownStages(4, 0)).toEqual([true, false, false, false]);
    expect(shownStages(4, 2)).toEqual([true, true, true, false]);
    expect(shownStages(4, 3)).toEqual([true, true, true, true]);
  });
});
