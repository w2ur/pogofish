// The page's one way to print a data file's date: day, month in words, year,
// read in UTC so the day is the one the file states whatever the reader's zone.
import type { Lang } from './strings';

/** '2026-11-11' → « 11 novembre 2026 » in French, "11 November 2026" in English. Throws on anything else. */
export function formatDate(lang: Lang, iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : undefined;
  if (!date || date.toISOString().slice(0, 10) !== iso) throw new Error(`not a date: ${JSON.stringify(iso)}`);
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
