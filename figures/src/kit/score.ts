// The page's one way to print a measured share: as a percentage with one
// decimal; a score with its 95 % interval in the same unit, as the essay speaks
// of scores (« de 7 à plus de 78 % ») and as the stage picker counts training.
import type { Score } from '../data';
import type { Lang } from './strings';

/** 0.8905 → 89.1: rounded on the thousandth, half up, so a score ending in 5 is not floored. */
export const percent = (x: number): number => Math.round(x * 1000) / 10;

/** The number alone, one decimal, with the language's decimal mark: « 89,1 » / "89.1". */
const number = (lang: Lang, x: number): string => {
  const text = percent(x).toFixed(1);
  return lang === 'fr' ? text.replace('.', ',') : text;
};

/** A share 0–1 as « 52,2 % » in French (U+202F before « % »), "52.2%" in English. */
export function formatShare(lang: Lang, x: number): string {
  return lang === 'fr' ? `${number(lang, x)} %` : `${number(lang, x)}%`;
}

/** « 89,1 % [87,8 ; 90,3] » in French (U+202F before « % » and « ; »), "89.1% [87.8; 90.3]" in English. */
export function formatScore(lang: Lang, s: Pick<Score, 'score'> & { ci95: readonly [number, number] }): string {
  const [lo, hi] = s.ci95;
  return lang === 'fr'
    ? `${formatShare(lang, s.score)} [${number(lang, lo)} ; ${number(lang, hi)}]`
    : `${formatShare(lang, s.score)} [${number(lang, lo)}; ${number(lang, hi)}]`;
}
