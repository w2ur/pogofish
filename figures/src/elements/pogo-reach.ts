// <pogo-reach>: the breadth-first exploration of game A, played level by level
// from reach.json (reach-bars.ts). Each step lands the next ply's bar with its
// number, the frontier swelling to move 10 and dying out at 15; the next step
// is the first ply with nothing new, where the exploration stops (the file
// ends there because the search did: crates/search/src/retro.rs, `bfs`, breaks
// on a level that finds nothing). Under the bars, one band stands for every
// possible position, on its own linear scale: each level fills its part of it,
// and at the end what is left empty, drawn to scale, is the positions no game
// ever reaches. Every number is written whole when it lands, never counted up.
// It plays by itself on screen (kit/autoplay.ts); under reduced motion, the
// finished chart.
import type { ReachData } from '../data';
import { autoplay } from '../kit/autoplay';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { t, type Lang } from '../kit/strings';
import { fetchReach } from '../reach';
import { countNodes } from './count-steps';
import reachCss from './pogo-reach.css?raw';
import { reachChart, reachSteps, type ReachStep } from './reach-bars';

/** How long a level is held, in automatic play: long enough to read its number. */
export const LEVEL_MS = 900;
/** The empty level and the total are held longer: they are the figure's two points. */
export const STOP_MS = 2200;

const pc = (f: number): string => `${(f * 100).toFixed(4)}%`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** The counter: « coup 3 sur 16 » while it explores, « total » at the end. */
export function reachCounter(lang: Lang, step: ReachStep, end: number): string {
  if (step.kind === 'total') return t(lang, 'reachTotal');
  return `${t(lang, 'ply')} ${step.ply} ${t(lang, 'outOf')} ${end}`;
}

export class PogoReach extends PogoFigure {
  /** The exploration stops at finished games and knows no repetition rule: game A's. */
  static override styles = reachCss;
  static override stageMinHeight = '700px';

  /** The data load; a test swaps it. */
  static deps: { reach: () => Promise<ReachData> } = { reach: fetchReach };

  protected async render(signal: AbortSignal): Promise<void> {
    const data = await (this.constructor as typeof PogoReach).deps.reach();
    if (signal.aborted) return;
    const chart = reachChart(data);
    const steps = reachSteps(chart);
    const end = chart.rows.length;
    const lang = this.lang;

    const root = el('div', 'reach');
    const table = el('table', 'bars');
    table.append(el('caption', 'say caption', t(lang, 'reachCaption')));
    const thead = el('thead');
    const head = el('tr');
    const plyHead = el('th', 'label ply', t(lang, 'reachPly'));
    plyHead.scope = 'col';
    const countHead = el('th', 'label count', t(lang, 'reachNew'));
    countHead.scope = 'col';
    head.append(plyHead, countHead);
    thead.append(head);

    const body = el('tbody');
    const rows = chart.rows.map((r) => {
      const tr = el('tr', 'level');
      const th = el('th', 'ply num', String(r.ply));
      th.scope = 'row';
      const td = el('td', 'count');
      const line = el('div', 'line');
      const track = el('div', 'track');
      track.setAttribute('aria-hidden', 'true');
      const bar = el('div', 'bar');
      bar.style.setProperty('--share', pc(r.share));
      track.append(bar);
      const value = el('span', 'value num');
      value.append(...countNodes(lang, r.count));
      line.append(track, value);
      td.append(line);
      tr.append(th, td);
      body.append(tr);
      return tr;
    });
    // The level that finds nothing: the exploration's end, said in words.
    const stop = el('tr', 'level stop');
    const stopTh = el('th', 'ply num', String(end));
    stopTh.scope = 'row';
    const stopTd = el('td', 'count');
    // The words sit where its bar would be: the level is there, and it is empty.
    const stopLine = el('div', 'line');
    const stopTrack = el('div', 'track');
    stopTrack.append(el('p', 'stop-words', t(lang, 'reachNone')));
    stopLine.append(stopTrack, el('span', 'value num', '0'));
    stopTd.append(stopLine);
    stop.append(stopTh, stopTd);
    body.append(stop);
    table.append(thead, body);

    // Every possible position, as one band on its own scale: the levels fill it, the sliver left is never reached.
    const whole = el('div', 'whole');
    const band = el('div', 'band');
    band.setAttribute('aria-hidden', 'true');
    const fill = el('div', 'fill');
    const sliver = el('div', 'sliver');
    sliver.style.width = pc(chart.unreached / chart.possible);
    band.append(fill, sliver);
    const possible = el('p', 'possible');
    possible.append(...countNodes(lang, chart.possible), ` ${t(lang, 'reachAllPossible')}`);
    const total = el('div', 'total');
    const reachable = el('p', 'reached');
    const n = el('span', 'shout num reachable');
    n.append(...countNodes(lang, chart.reachable));
    const what = el('span', 'what');
    what.append(`${t(lang, 'reachReachable')} ${t(lang, 'outOf')} `, ...countNodes(lang, chart.possible), ` ${t(lang, 'reachPossible')}`);
    reachable.append(n, what);
    const never = el('p', 'never');
    const neverN = el('span', 'never-n num');
    neverN.append(...countNodes(lang, chart.unreached));
    never.append(neverN, ` ${t(lang, 'reachNever')}`);
    total.append(reachable, never);
    whole.append(possible, band, total);

    const show = (i: number): void => {
      const s = steps[i]!;
      rows.forEach((tr, k) => {
        tr.toggleAttribute('data-off', k >= s.landed);
        tr.toggleAttribute('data-front', s.kind === 'level' && k === s.ply);
      });
      stop.toggleAttribute('data-off', s.kind === 'level');
      stop.toggleAttribute('data-front', s.kind === 'stop');
      fill.style.width = pc(s.reached / chart.possible);
      total.toggleAttribute('data-off', s.kind !== 'total');
      root.dataset.step = s.kind;
    };
    show(0);

    const stepper = new Stepper(steps.length, show, {
      signal,
      interval: (i) => (steps[i + 1]?.kind === 'level' ? LEVEL_MS : STOP_MS),
    });
    const controls = transport(stepper, { lang, counter: (i) => reachCounter(lang, steps[i]!, end) });
    // The transport right under the bars it lands; the band and the total after it. The total keeps
    // its room while the levels land: at the figure's foot, it leaves no blank between chart and controls.
    root.append(table, controls, whole);
    this.stage.append(root);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
  }
}
