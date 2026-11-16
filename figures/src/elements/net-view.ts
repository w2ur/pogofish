// The parts the net figures share (<pogo-net>, <pogo-encoding>,
// <pogo-search>): the line that says which position is shown, a value on its
// −1…+1 scale, and the net's preference per move as a table of bars. Ink only:
// a quantity is a length on a scale the figure states, and its number.
import type { Colour, State } from '../engine';
import { formatShare } from '../kit/score';
import { moveTip, type TipHooks } from '../kit/move-tip';
import { colon, t, type Lang } from '../kit/strings';
import { positionWords, type NetPosition } from './net-position';
import type { PolicyRow } from './net-readout';
import { signedNote } from './q-steps';
import { VISIBLE_MOVES, splitRows } from './ranked-rows';
import { pctText } from './stage-view';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export const colourName = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'white' : 'red');

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
      what.textContent = `${t(lang, 'netScaleFrom')} (${colourName(lang, s.to_move)}).`;
    },
  };
}

export interface RankedTable {
  element: HTMLElement;
  caption: HTMLElement;
  /**
   * Shows the rows of `order` (ten at most, `keep` always among them), pads with blank
   * rows to ten, and puts the rest behind « Les N autres coups », with their share of
   * the net's preference.
   */
  update(order: readonly number[], keep: number | null, row: (i: number) => HTMLTableRowElement, blank: () => HTMLTableRowElement, prior: (i: number) => number): void;
}

/**
 * A table of moves that keeps one height whatever the position: room for ten rows,
 * the others in a closed disclosure whose line is always there (unseen when empty).
 * The page below does not move as the reader plays.
 */
export function rankedTable(lang: Lang, className: string, headers: readonly { text: string; cls: string }[]): RankedTable {
  const element = el('div', `ranked ${className}`);
  const head = (): HTMLTableSectionElement => {
    const thead = el('thead');
    const tr = el('tr');
    for (const h of headers) {
      const th = el('th', `label ${h.cls}`, h.text);
      th.scope = 'col';
      tr.append(th);
    }
    thead.append(tr);
    return thead;
  };
  const table = el('table', `bars ${className}-table`);
  const caption = el('caption', 'say');
  const body = el('tbody');
  table.append(caption, head(), body);
  const others = el('details', 'others');
  const summary = el('summary', 'others-summary num');
  const hiddenTable = el('table', `bars ${className}-table`);
  const hiddenBody = el('tbody');
  hiddenTable.append(head(), hiddenBody);
  others.append(summary, hiddenTable);
  element.append(table, others);
  return {
    element,
    caption,
    update(order, keep, row, blank, prior) {
      const { shown, hidden } = splitRows(order, keep);
      body.replaceChildren(...shown.map(row));
      for (let k = shown.length; k < VISIBLE_MOVES; k++) {
        const b = blank();
        b.classList.add('blank');
        b.setAttribute('aria-hidden', 'true');
        body.append(b);
      }
      hiddenBody.replaceChildren(...hidden.map(row));
      const share = hidden.reduce((a, i) => a + prior(i), 0);
      const n = hidden.length;
      const who = n === 1 ? t(lang, 'movesOtherOne') : `${t(lang, 'movesOthersBefore')} ${n} ${t(lang, 'movesOthersAfter')}`;
      summary.textContent = `${who}, ${formatShare(lang, share)} ${t(lang, 'movesOthersShare')}`;
      // No other move: the line keeps its room, unseen and out of the reading order.
      others.toggleAttribute('data-none', n === 0);
      if (n === 0) others.open = false;
      others.setAttribute('aria-hidden', String(n === 0));
    },
  };
}

/** A row for a move that is not there: the same cells, so a blank row has a real row's height. */
export function blankRow(cells: number): HTMLTableRowElement {
  const tr = el('tr');
  // A no-break space: the row keeps a real row's height, and no move name could show if the sheet failed.
  const th = el('th', 'move num', '\u00a0');
  tr.append(th);
  for (let k = 1; k < cells; k++) tr.append(barCell('\u00a0', 0));
  return tr;
}

/** The net's preference for each legal move, on one 0–100 % scale, the strongest first; ten shown at most. */
export function policyView(lang: Lang, hooks?: (m: PolicyRow['move']) => TipHooks): { element: HTMLElement; update(rows: PolicyRow[], actions: number): void } {
  const element = el('div', 'policy');
  const lede = el('p', 'note');
  const ranked = rankedTable(lang, 'policy', [
    { text: t(lang, 'netMove'), cls: 'move' },
    { text: t(lang, 'netPreference'), cls: 'share' },
  ]);
  ranked.caption.textContent = t(lang, 'netPrefsTitle');
  // The bars' scale, under them: a length means nothing without it.
  element.append(lede, ranked.element, el('p', 'note scale-note', t(lang, 'netPrefScale')));
  return {
    element,
    update(rows, actions) {
      const illegal = actions - rows.length;
      lede.textContent =
        `${t(lang, 'netLegalBefore')} ${rows.length} ${t(lang, 'netLegalShare')} ${pctText(lang, 100)}` +
        (illegal > 0 ? `${lang === 'fr' ? '\u202f;' : ';'} ${t(lang, 'netIllegalBefore')} ${illegal} ${t(lang, 'netIllegalZero')}.` : '.');
      ranked.update(
        rows.map((_, i) => i),
        null,
        (i) => {
          const r = rows[i]!;
          const tr = el('tr');
          tr.dataset.move = r.name;
          const th = el('th', 'move num');
          th.append(moveTip(lang, r.move, hooks?.(r.move)));
          th.scope = 'row';
          tr.append(th, barCell(formatShare(lang, r.prior), r.prior));
          return tr;
        },
        () => blankRow(2),
        (i) => rows[i]!.prior,
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
