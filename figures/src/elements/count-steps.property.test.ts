import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { binomial } from './count-steps';

describe('binomial', () => {
  it('is symmetric and follows Pascal’s rule', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 0, max: 40 }), (n, k) => {
        expect(binomial(n, k)).toBe(binomial(n, n - k));
        if (k >= 1 && k <= n) expect(binomial(n, k)).toBe(binomial(n - 1, k - 1) + binomial(n - 1, k));
      }),
      { numRuns: 1000 },
    );
  });
});
