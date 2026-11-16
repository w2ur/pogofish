// The parts the net figures share (<pogo-net>, <pogo-encoding>,
// <pogo-search>): the line that says which position is shown, a value on its
// −1…+1 scale, and the net's preference per move as a table of bars. Ink only:
// a quantity is a length on a scale the figure states, and its number.
import type { Colour, State } from '../engine';
import { formatShare } from '../kit/score';
import { colon, t, type Lang } from '../kit/strings';
import { countNodes } from './count-steps';
import { positionWords, type NetPosition } from './net-position';
import type { PolicyRow } from './net-readout';
import { signedNote } from './q-steps';
import { pctText } from './stage-view';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export const colourName = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'white' : 'red');

/** « Réseau az-lc1-s1 · 130 164 nombres réglables (poids et biais). » */
export function netLine(lang: Lang, name: string, weights: number): HTMLParagraphElement {
  // The count's digit groups get room (countNodes): the narrow space all but vanishes at 12.8px.
  const p = el('p', 'net-name');
  p.append(`${t(lang, 'netName')} ${name} · `, ...countNodes(lang, weights), ` ${t(lang, 'netAdjustable')}.`);
  return p;
}

/** Which position is shown, in words, and the hint to play one's own when it is the default. */
export function positionLine(lang: Lang): { element: HTMLElement; update(p: NetPosition): void } {
  const element = el('div', 'position-words');
  const words = el('p', 'where-from');
  const hint = el('p', 'hint', t(lang, 'posHint'));
  element.append(words, hint);
  return {
    element,
    update(p) {
      words.textContent = positionWords(lang, p);
      // The hint keeps its room when hidden, so the board below never moves.
      hint.toggleAttribute('data-off', p.source !== 'default');
    },
  };
}

/** A value in [−1, 1]: its number, a marker on the scale, and what the scale is, for whom. */
export function valueView(lang: Lang, title: string): { element: HTMLElement; update(v: number, s: State): void } {
  const element = el('div', 'value-view');
  const number = el('p', 'shout num value-number');
  const scale = el('div', 'scale');
  scale.setAttribute('aria-hidden', 'true');
  const marker = el('span', 'marker');
  scale.append(el('span', 'axis'), el('span', 'zero'), marker);
  const ends = el('div', 'scale-ends num');
  ends.setAttribute('aria-hidden', 'true');
  ends.append(el('span', '', '−1'), el('span', '', '0'), el('span', '', '+1'));
  const what = el('p', 'note');
  element.append(el('p', 'label value-title', title), number, scale, ends, what);
  return {
    element,
    update(v, s) {
      number.textContent = signedNote(lang, v);
      marker.style.left = `${(((Math.max(-1, Math.min(1, v)) + 1) / 2) * 100).toFixed(3)}%`;
      what.textContent = `${t(lang, 'netScaleFrom')} (${colourName(lang, s.to_move)}). ${t(lang, 'netNotShare')}`;
    },
  };
}

/** The net's preference for each legal move, on one 0–100 % scale, the strongest first. */
export function policyView(lang: Lang): { element: HTMLElement; update(rows: PolicyRow[], actions: number): void } {
  const element = el('div', 'policy');
  const lede = el('p', 'note');
  const table = el('table', 'bars');
  table.append(el('caption', 'label', t(lang, 'netPrefsTitle')));
  const head = el('tr');
  for (const [key, cls] of [
    ['netMove', 'move'],
    ['netPreference', 'share'],
  ] as const) {
    const th = el('th', `label ${cls}`, t(lang, key));
    th.scope = 'col';
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  table.append(thead, body);
  element.append(lede, table, el('p', 'note', t(lang, 'netPrefScale')));
  return {
    element,
    update(rows, actions) {
      const illegal = actions - rows.length;
      lede.textContent =
        `${t(lang, 'netLegalBefore')} ${rows.length} ${t(lang, 'netLegalShare')} ${pctText(lang, 100)}` +
        (illegal > 0 ? `${lang === 'fr' ? ' ;' : ';'} ${t(lang, 'netIllegalBefore')} ${illegal} ${t(lang, 'netIllegalZero')}.` : '.');
      body.replaceChildren(
        ...rows.map((r) => {
          const tr = el('tr');
          tr.dataset.move = r.name;
          const th = el('th', 'move num', r.name);
          th.scope = 'row';
          tr.append(th, barCell(formatShare(lang, r.prior), r.prior));
          return tr;
        }),
      );
    },
  };
}

/** A table cell: the number, then a bar of `share` (0–1) of the track under it. */
export function barCell(text: string, share: number, className = 'share'): HTMLTableCellElement {
  const td = el('td', `${className} num`);
  const value = el('span', 'value', text);
  const track = el('span', 'track');
  track.setAttribute('aria-hidden', 'true');
  const bar = el('span', 'bar');
  bar.style.width = `${(Math.max(0, Math.min(1, share)) * 100).toFixed(3)}%`;
  track.append(bar);
  const line = el('span', 'line');
  line.append(value, track);
  td.append(line);
  return td;
}

export { colon };
