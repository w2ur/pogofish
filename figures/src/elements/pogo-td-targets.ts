// <pogo-td-targets>: the TD(λ) targets of one finished game, computed from
// the end and climbing back position by position (fig. 18). The game is the
// reader's last finished one, else DEFAULT_GAME (td-walk.ts), and the figure
// says which and follows the store when a game finishes. The real TD net
// values every position, the last gets its exact result, and the targets are
// lambdaReturns with the trainer's λ. Both are drawn from White's view on one
// −1…+1 chart, where a target is λ × the next target + (1 − λ) × the next
// value, the essay's sentence; each step writes that sum with its numbers.
import type { Colour } from '../engine';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang } from '../kit/strings';
import type { TdNet } from '../nets';
import { sharedTd } from '../nets-shared';
import { store, type GameRecord, type Store } from '../store';
import { plies } from './net-position';
import { colourName, el } from './net-view';
import netCss from './net.css?raw';
import tdCss from './pogo-td-targets.css?raw';
import { signedNote } from './q-steps';
import { TD_LAMBDA, tdFrame, tdGame, tdWalk, type TdGame, type TdWalk } from './td-walk';

const NS = 'http://www.w3.org/2000/svg';
/** The chart's units: the SVG scales to the figure's width, and carries no text. */
const W = 400;
const H = 200;
const PAD_X = 8;
const PAD_Y = 10;

/** « 70 % » from λ, never typed. */
const pct = (lang: Lang, x: number): string => `${Math.round(x * 100)}${lang === 'fr' ? ' ' : ''}%`;
/** A signed value in a sum: « (−0,25) » when negative, so the minus is not read as an operator. */
const term = (lang: Lang, x: number): string => (x < -0.0005 ? `(${signedNote(lang, x)})` : signedNote(lang, x));

/** « Après 6 coups, Rouge au trait » / « Au départ, Blanc au trait ». */
function whereText(lang: Lang, ply: number, mover: Colour): string {
  const when = ply === 0 ? t(lang, 'posAtStart') : `${t(lang, 'posAfter')} ${plies(lang, ply)}`;
  return `${when.charAt(0).toUpperCase()}${when.slice(1)}, ${colourName(lang, mover)} ${t(lang, 'toMove')}`;
}

/** « Partie : la dernière partie terminée du plateau, 23 coups, victoire des Rouges. » */
export function gameWords(lang: Lang, g: TdGame): string {
  const name = g.source === 'reader' ? t(lang, 'tdYourLast') : t(lang, 'lineOpeningWin');
  const won = g.result === null ? '' : `, ${t(lang, 'tdWon')} ${t(lang, g.result === 'W' ? 'tdWhites' : 'tdReds')}`;
  return `${t(lang, 'tdGame')}${colon(lang)} ${name}, ${plies(lang, g.states.length - 1)}${won}.`;
}

export interface StepWords {
  head: string;
  text: string;
  calc: string;
}

/** The words of step `k` (0…T + 1) of the walk. */
export function stepWords(lang: Lang, g: TdGame, w: TdWalk, k: number): StepWords {
  const T = w.returns.length;
  const f = tdFrame(w, k);
  if (f.current === null) return { head: '', text: t(lang, k === 0 ? 'tdStart' : 'tdDone'), calc: '' };
  const i = f.current;
  const head = whereText(lang, i, g.states[i]!.to_move);
  const target = signedNote(lang, w.white.targets[i]!);
  if (i === T - 1) {
    return { head, text: t(lang, 'tdLastStep'), calc: `${t(lang, 'tdTarget')} = ${t(lang, 'tdResult')} = ${target}` };
  }
  return {
    head,
    text: `${pct(lang, TD_LAMBDA)} ${t(lang, 'tdStep')} ${pct(lang, 1 - TD_LAMBDA)} ${t(lang, 'tdStepNote')}`,
    calc: `${t(lang, 'tdTarget')} = ${pct(lang, TD_LAMBDA)} × ${term(lang, w.white.targets[i + 1]!)} + ${pct(lang, 1 - TD_LAMBDA)} × ${term(lang, w.white.notes[i + 1]!)} = ${target}`,
  };
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

/** The chart, drawn once per game; `show` reveals the targets known at a step. */
function chart(w: TdWalk): { svg: SVGSVGElement; show(k: number): void } {
  const T = w.values.length - 1;
  const x = (i: number): number => PAD_X + (i * (W - 2 * PAD_X)) / T;
  const y = (v: number): number => PAD_Y + ((1 - v) / 2) * (H - 2 * PAD_Y);
  const r = Math.max(2, Math.min(5, (W - 2 * PAD_X) / T / 3));
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'td-chart', 'aria-hidden': 'true', focusable: 'false' });
  for (const v of [1, 0, -1]) svgEl('line', { class: v === 0 ? 'axis zero' : 'axis', x1: PAD_X, x2: W - PAD_X, y1: y(v), y2: y(v) }, svg);
  const cursor = svgEl('line', { class: 'cursor', x1: 0, x2: 0, y1: PAD_Y, y2: H - PAD_Y }, svg);
  const notes = w.white.notes;
  svgEl('polyline', { class: 'notes-line', points: notes.map((v, i) => `${x(i)},${y(v)}`).join(' ') }, svg);
  const targetsLine = svgEl('polyline', { class: 'targets-line', points: '' }, svg);
  notes.forEach((v, i) => {
    svgEl('circle', { class: i === T ? 'result' : 'note', cx: x(i), cy: y(v), r, 'data-t': i }, svg);
  });
  const squares = w.white.targets.map((v, i) =>
    svgEl('rect', { class: 'target', x: x(i) - r, y: y(v) - r, width: 2 * r, height: 2 * r, 'data-t': i, 'data-target': v }, svg),
  );
  return {
    svg,
    show(k) {
      const f = tdFrame(w, k);
      const known = new Set(f.known);
      squares.forEach((sq, i) => sq.classList.toggle('known', known.has(i)));
      // The targets line runs from the earliest known target to the result it climbed from.
      const from = f.known.length ? Math.min(...f.known) : T;
      const pts: string[] = [];
      for (let i = from; i < T; i++) pts.push(`${x(i)},${y(w.white.targets[i]!)}`);
      if (pts.length) pts.push(`${x(T)},${y(notes[T]!)}`);
      targetsLine.setAttribute('points', pts.join(' '));
      cursor.classList.toggle('off', f.current === null);
      if (f.current !== null) {
        cursor.setAttribute('x1', String(x(f.current)));
        cursor.setAttribute('x2', String(x(f.current)));
      }
    },
  };
}

export class PogoTdTargets extends PogoFigure {
  static override styles = netCss + tdCss;
  static override stageMinHeight = '642px';

  /** The game, the engine and the TD net; a test swaps them. */
  static deps: { store: Store; td: () => Promise<TdNet> } = { store, td: sharedTd };


  protected async render(signal: AbortSignal): Promise<void> {
    const deps = (this.constructor as typeof PogoTdTargets).deps;
    const [net] = await Promise.all([deps.td(), deps.store.ready()]);
    if (signal.aborted) return;
    const lang = this.lang;
    const root = el('div', 'td-targets');
    this.stage.append(root);

    let shown: GameRecord | null | undefined;
    let run: AbortController | undefined;
    signal.addEventListener('abort', () => run?.abort(), { once: true });

    const draw = (): void => {
      const last = deps.store.lastFinished();
      if (last === shown) return;
      shown = last;
      run?.abort();
      const current = new AbortController();
      run = current;
      const g = tdGame(deps.store);
      const w = tdWalk(g.states, (s) => net.value(s));
      root.replaceChildren(...this.content(lang, g, w, current.signal));
    };
    draw();
    const off = deps.store.on('game', draw);
    signal.addEventListener('abort', () => void off(), { once: true });
  }

  private content(lang: Lang, g: TdGame, w: TdWalk, signal: AbortSignal): HTMLElement[] {
    const T = w.values.length - 1;
    const words = el('div', 'position-words');
    const hint = el('p', 'hint', t(lang, 'tdHint'));
    hint.toggleAttribute('data-off', g.source !== 'default');
    words.append(el('p', 'where-from', gameWords(lang, g)), hint);

    // Every step's words share one grid cell: the area keeps the room of the longest.
    const status = el('div', 'status');
    status.setAttribute('aria-hidden', 'true');
    const steps = Array.from({ length: T + 2 }, (_, k) => stepWords(lang, g, w, k));
    const blocks = steps.map((s) => {
      const b = el('div', 'said');
      b.append(el('p', 'say step-head', s.head || ' '), el('p', 'step-text', s.text), el('p', 'calc num', s.calc || ' '));
      status.append(b);
      return b;
    });
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    const c = chart(w);
    const plot = el('div', 'plot');
    const ys = el('div', 'y-ends num');
    ys.setAttribute('aria-hidden', 'true');
    ys.append(el('span', '', '+1'), el('span', '', '0'), el('span', '', '−1'));
    const xs = el('div', 'x-ends num');
    xs.setAttribute('aria-hidden', 'true');
    xs.append(el('span', '', '0'), el('span', '', String(T)));
    plot.append(ys, c.svg, xs);

    const legend = el('ul', 'legend');
    for (const [cls, key] of [
      ['note', 'tdNote'],
      ['target', 'tdTarget'],
      ['result', 'tdResult'],
    ] as const) {
      const li = el('li');
      li.append(el('span', `swatch ${cls}`), t(lang, key));
      legend.append(li);
    }

    const show = (k: number): void => {
      blocks.forEach((b, i) => b.toggleAttribute('data-off', i !== k));
      c.show(k);
      const s = steps[k]!;
      live.textContent = [s.head, s.text, s.calc].filter(Boolean).join('. ');
    };
    const stepper = new Stepper(T + 2, show, { signal, interval: 1100 });
    const row = transport(stepper, { lang, counter: (i, n) => `${i} / ${n - 1}` });
    show(0);

    return [
      words,
      status,
      plot,
      row,
      legend,
      el('p', 'note axis-words', t(lang, 'tdAxis')),
      live,
      this.values(lang, g, w),
    ];
  }

  /** Every position's value and target, as a table behind a disclosure. */
  private values(lang: Lang, g: TdGame, w: TdWalk): HTMLElement {
    const T = w.values.length - 1;
    const details = el('details', 'values');
    details.append(el('summary', 'label', t(lang, 'tdValues')));
    const table = el('table', 'td-table num');
    const head = el('tr');
    for (const k of ['tdPosition', 'toMove', 'tdNote', 'tdTarget'] as const) {
      const th = el('th', 'label', k === 'toMove' ? t(lang, 'toMove') : t(lang, k));
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (let i = 0; i <= T; i++) {
      const tr = el('tr');
      tr.dataset.t = String(i);
      const th = el('th', '', String(i));
      th.scope = 'row';
      tr.append(
        th,
        el('td', '', colourName(lang, g.states[i]!.to_move)),
        el('td', 'note-cell', i === T ? `${signedNote(lang, w.white.notes[i]!)} (${t(lang, 'tdResult')})` : signedNote(lang, w.white.notes[i]!)),
        el('td', 'target-cell', i === T ? '—' : signedNote(lang, w.white.targets[i]!)),
      );
      body.append(tr);
    }
    table.append(thead, body);
    details.append(table);
    return details;
  }
}
