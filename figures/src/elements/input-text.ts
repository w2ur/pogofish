// How an input of the nets is written, in the grid of <pogo-encoding> and under the
// pointer in <pogo-net>.
import type { Lang } from '../kit/strings';

/** An input as the table writes it: « +1 », « −1 », « 0 », « 0,25 ». */
export function inputText(lang: Lang, x: number): string {
  if (x === 0) return '0';
  if (Number.isInteger(x)) return x > 0 ? `+${x}` : `−${-x}`;
  const text = x.toFixed(2).replace(/0$/, '');
  return lang === 'fr' ? text.replace('.', ',') : text;
}
