import { describe, expect, it } from 'vitest';
import { binomial, countSteps, formatCount } from './count-steps';

describe('the count of Pogo positions', () => {
  it('product is 232792560', () => {
    expect(countSteps().at(-1)!.product).toBe(232792560);
  });

  it('is C(12, 6) colour orders, then C(20, 8) ways to share 12 pieces among 9 stacks, then 2 players to move', () => {
    const steps = countSteps();
    expect(steps.map((s) => s.factor)).toEqual([924, 125970, 2]);
    expect(steps.map((s) => s.binomial)).toEqual([[12, 6], [20, 8], null]);
    expect(steps.map((s) => s.product)).toEqual([924, 116396280, 232792560]);
  });

  it('computes binomials exactly, and the total matches the solver’s positionsTotal', async () => {
    expect(binomial(12, 6)).toBe(924);
    expect(binomial(20, 8)).toBe(125970);
    expect(binomial(5, 0)).toBe(1);
    expect(binomial(5, 6)).toBe(0);
    const { readFileSync } = await import('node:fs');
    const reach = JSON.parse(readFileSync('public/data/reach.json', 'utf8')) as { positionsTotal: number };
    expect(countSteps().at(-1)!.product).toBe(reach.positionsTotal);
  });

  it('writes numbers in each language’s grouping', () => {
    expect(formatCount('fr', 232792560)).toBe('232 792 560');
    expect(formatCount('en', 232792560)).toBe('232,792,560');
    expect(formatCount('fr', 924)).toBe('924');
  });
});
