// The page's one way to print a measured score: as a percentage with one
// decimal, its 95 % interval in the same unit, as the essay speaks of scores
// (« de 7 à plus de 78 % ») and as the stage picker counts training.
import type { Score } from '../data';
import type { Lang } from './strings';

/** 0.8905 → 89.1: rounded on the thousandth, half up, so a score ending in 5 is not floored. */
export const percent = (x: number): number => Math.round(x * 1000) / 10;

/** « 89,1 % [87,8 ; 90,3] » in French (U+202F before « % » and « ; »), "89.1% [87.8; 90.3]" in English. */
export function formatScore(lang: Lang, s: Pick<Score, 'score'> & { ci95: readonly [number, number] }): string {
  const n = (x: number): string => {
    const text = percent(x).toFixed(1);
    return lang === 'fr' ? text.replace('.', ',') : text;
  };
  const [lo, hi] = s.ci95;
  return lang === 'fr'
    ? `${n(s.score)} % [${n(lo)} ; ${n(hi)}]`
    : `${n(s.score)}% [${n(lo)}; ${n(hi)}]`;
}
