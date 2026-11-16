// <pogo-reach>: the breadth-first exploration of game A, one bar per move
// (ply) for the positions first seen there, from reach.json (reach-bars.ts).
// The chart is a real table: the move, then a bar and its number. One linear
// scale, every number written, so the small counts are read as text where a
// bar cannot show them. Nothing moves and nothing counts up.
import type { ReachData } from '../data';
import { PogoFigure } from '../kit/figure';
import { t } from '../kit/strings';
import { REACH_SOURCE, fetchReach } from '../reach';
import { countNodes } from './count-steps';
import reachCss from './pogo-reach.css?raw';
import { reachChart } from './reach-bars';

export class PogoReach extends PogoFigure {
  static override fidelity = 'measured' as const;
  static override source = REACH_SOURCE;
  /** The exploration stops at finished games and knows no repetition rule: game A's. */
  static override game = 'gameA' as const;
  static override styles = reachCss;
  static override stageMinHeight = '560px';

  /** The data load; a test swaps it. */
  static deps: { reach: () => Promise<ReachData> } = { reach: fetchReach };

  protected override precisions(): string[] {
    return [t(this.lang, 'reachScale')];
  }

  protected async render(signal: AbortSignal): Promise<void> {
    const data = await (this.constructor as typeof PogoReach).deps.reach();
    if (signal.aborted) return;
    const chart = reachChart(data);
    const lang = this.lang;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const root = el('div', 'reach');
    const table = el('table', 'bars');
    table.append(el('caption', 'label caption', t(lang, 'reachCaption')));
    const thead = el('thead', '');
    const head = el('tr', '');
    const plyHead = el('th', 'label ply', t(lang, 'reachPly'));
    plyHead.scope = 'col';
    const countHead = el('th', 'label count', t(lang, 'reachNew'));
    countHead.scope = 'col';
    head.append(plyHead, countHead);
    thead.append(head);

    const body = el('tbody', '');
    for (const r of chart.rows) {
      const tr = el('tr', '');
      const th = el('th', 'ply num', String(r.ply));
      th.scope = 'row';
      const td = el('td', 'count');
      const line = el('div', 'line');
      const track = el('div', 'track');
      track.setAttribute('aria-hidden', 'true');
      const bar = el('div', 'bar');
      bar.style.width = `${(r.share * 100).toFixed(4)}%`;
      track.append(bar);
      const value = el('span', 'value num');
      value.append(...countNodes(lang, r.count));
      line.append(track, value);
      td.append(line);
      tr.append(th, td);
      body.append(tr);
    }
    table.append(thead, body);

    const total = el('p', 'total');
    total.append(
      (() => {
        const n = el('span', 'shout num reachable');
        n.append(...countNodes(lang, chart.reachable));
        return n;
      })(),
      (() => {
        const what = el('span', 'label what');
        what.append(
          `${t(lang, 'reachReachable')} ${t(lang, 'outOf')} `,
          ...countNodes(lang, chart.possible),
          ` ${t(lang, 'reachPossible')}`,
        );
        return what;
      })(),
    );
    root.append(table, total);
    this.stage.append(root);
  }
}
