// How the figures write a large number: grouped as its language groups it, and
// as nodes that give each group separator room to be seen.
import type { Lang } from '../kit/strings';

/** « 232 792 560 » with narrow no-break spaces in French, "232,792,560" in English. */
export function formatCount(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB').format(n);
}

/**
 * The same number as nodes: digits as text, each group separator in a `.sep` span the
 * figure gives room to, since the narrow no-break space all but vanishes at small sizes.
 */
export function countNodes(lang: Lang, n: number): (string | HTMLElement)[] {
  return formatCount(lang, n)
    .split(/([^0-9])/)
    .filter((part) => part !== '')
    .map((part) => {
      if (/^[0-9]+$/.test(part)) return part;
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = part;
      return sep;
    });
}
