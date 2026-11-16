// The count of Pogo positions, as the figure shows it: three factors and the
// running product, each computed here and never typed. A position is an order
// of the 12 colours (6 White among 12 places), a way to share the 12 pieces
// among the 9 cells (stacks may be empty), and the player to move.
import type { Lang } from '../kit/strings';

/** C(n, k), exact while the result stays under 2^53; 0 outside 0 ≤ k ≤ n. */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const m = Math.min(k, n - k);
  let r = 1;
  // Each partial product is itself a binomial, so the division is exact.
  for (let i = 0; i < m; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

export type CountPart = 'colours' | 'stacks' | 'turn';

export interface CountStep {
  part: CountPart;
  factor: number;
  /** `[n, k]` when the factor is C(n, k). */
  binomial: [number, number] | null;
  /** The product of this factor and every one before it. */
  product: number;
}

const PIECES = 12;
const WHITE = 6;
const CELLS = 9;

export function countSteps(): CountStep[] {
  const parts: Omit<CountStep, 'product'>[] = [
    { part: 'colours', factor: binomial(PIECES, WHITE), binomial: [PIECES, WHITE] },
    // Stars and bars: 12 pieces and 8 walls between 9 cells.
    { part: 'stacks', factor: binomial(PIECES + CELLS - 1, CELLS - 1), binomial: [PIECES + CELLS - 1, CELLS - 1] },
    { part: 'turn', factor: 2, binomial: null },
  ];
  let product = 1;
  return parts.map((p) => ({ ...p, product: (product *= p.factor) }));
}

/** « 232 792 560 » with narrow no-break spaces in French, "232,792,560" in English. */
export function formatCount(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB').format(n);
}
