// <pogo-td-targets>: what TD(λ) does with one finished game, in two acts
// (fig. 18). The game is the reader's last finished one, else DEFAULT_GAME
// (td-walk.ts); the figure says which and follows the store.
//
// Act 1: the real TD net values every position, the last gets its exact
// result, and the targets climb back up the game one position at a time,
// each written as the essay's sum, λ × the next target + (1 − λ) × the next
// value, with its numbers and the two points it comes from marked.
//
// Act 2: the adjustment. The trainer's own step (td-tune.ts) is applied to a
// copy of the net on this game: the values' line moves towards the targets'
// line. Then again, several times: the adjusted net values the game anew, the
// targets are computed anew, and the line moves again. Each earlier line is
// left as a trace, so the settling is seen at rest too, and the mean gap
// between value and target is written at each step.
//
// Everything is drawn from White's view on one −1…+1 chart, the game's
// positions in order along it, under a strip of their boards when they fit.
import type { Colour } from '../engine';
import { autoplay } from '../kit/autoplay';
import { drawBoard } from '../kit/board-svg';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang } from '../kit/strings';
import type { TdNet } from '../nets';
import { sharedTd } from '../nets-shared';
import { store, type GameRecord, type Store } from '../store';
import { tween } from './motion';
import { plies } from './net-position';
import { colourName, el } from './net-view';
import netCss from './net.css?raw';
import tdCss from './pogo-td-targets.css?raw';
import { noteText, signedNote } from './q-steps';
import { TD_LAMBDA, TD_ROUNDS, tdGame, tdRounds, tdScript, type TdGame, type TdStep } from './td-walk';

const NS = 'http://www.w3.org/2000/svg';
/** The SVG's user space, stretched to the chart's box. */
const U = 1000;
/** A game of at most this many positions shows the strip of its boards and its numbers. */
export const STRIP_MAX = 12;

/** How long a step is held: the first, an adjustment, new targets; and the whole climb of the targets. */
export const START_MS = 2600;
export const ADJUST_MS = 3400;
export const RETARGET_MS = 2800;
const CLIMB_TOTAL_MS = 20000;
export const climbMs = (positions: number): number => Math.max(900, Math.min(2200, Math.round(CLIMB_TOTAL_MS / positions)));

/** « 70 % » from λ, never typed. */
const pct = (lang: Lang, x: number): string => `${Math.round(x * 100)}${lang === 'fr' ? ' ' : ''}%`;
/** A signed value in a sum: « (−0,25) » when negative, so the minus is not read as an operator. */
const term = (lang: Lang, x: number): string => (x < -0.0005 ? `(${signedNote(lang, x)})` : signedNote(lang, x));
const pc = (f: number): string => `${(f * 100).toFixed(3)}%`;
/** A value's place down the chart's box: +1 near the top, −1 near the bottom. */
const down = (v: number): number => 0.06 + ((1 - v) / 2) * 0.88;

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

/** The words of step `k` of the script. */
export function stepWords(lang: Lang, g: TdGame, script: readonly TdStep[], k: number): StepWords {
  const s = script[k]!;
  const c = colon(lang);
  const T = g.states.length - 1;
  if (s.kind === 'start') return { head: '', text: t(lang, 'tdStart'), calc: '' };
  if (s.kind === 'climb') {
    const i = s.current!;
    const head = whereText(lang, i, g.states[i]!.to_move);
    const target = signedNote(lang, s.targets[i]!);
    if (i === T - 1) return { head, text: t(lang, 'tdLastStep'), calc: `${t(lang, 'tdTarget')} = ${t(lang, 'tdResult')} = ${target}` };
    return {
      head,
      text: `${pct(lang, TD_LAMBDA)} ${t(lang, 'tdStep')} ${pct(lang, 1 - TD_LAMBDA)} ${t(lang, 'tdStepNote')}`,
      calc: `${t(lang, 'tdTarget')} = ${pct(lang, TD_LAMBDA)} × ${term(lang, s.targets[i + 1]!)} + ${pct(lang, 1 - TD_LAMBDA)} × ${term(lang, s.notes[i + 1]!)} = ${target}`,
    };
  }
  const rounds = script.at(-1)!.round;
  const head = `${t(lang, 'tdRound')} ${s.round} ${t(lang, 'outOf')} ${rounds}`;
  const gap = noteText(lang, s.gap!);
  if (s.kind === 'adjust') {
    return {
      head,
      text: t(lang, s.round === 1 ? 'tdAdjust' : 'tdAdjustAgain'),
      calc: `${t(lang, 'tdGap')}${c} ${noteText(lang, script[k - 1]!.gap!)} → ${gap}`,
    };
  }
  const first = script.find((x) => x.gap !== null)!.gap!;
  const text =
    k === script.length - 1
      ? `${t(lang, 'tdAfter')} ${rounds} ${t(lang, 'tdAfterRounds')} ${noteText(lang, first)} ${t(lang, 'tdAfterTo')} ${gap}.`
      : t(lang, 'tdRetarget');
  return { head, text, calc: `${t(lang, 'tdGap')}${c} ${gap}` };
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

interface Chart {
  box: HTMLElement;
  /** Shows step `k`; when `move`, the lines travel there from where they stand. */
  show(k: number, move: boolean): void;
  /** Ends a travel under way, on its last state. */
  settle(): void;
}

/** The chart: lines in an SVG stretched to its box, marks as HTML over it, placed by percentage. */
function chart(script: readonly TdStep[], positions: number): Chart {
  const T = positions - 1;
  const x = (i: number): number => (i + 0.5) / positions;
  const box = el('div', 'box');
  box.setAttribute('aria-hidden', 'true');
  const svg = svgEl('svg', { viewBox: `0 0 ${U} ${U}`, preserveAspectRatio: 'none', class: 'td-chart', focusable: 'false' }, box);
  for (const v of [1, 0, -1]) svgEl('line', { class: v === 0 ? 'axis zero' : 'axis', x1: 0, x2: U, y1: down(v) * U, y2: down(v) * U }, svg);
  const cursor = svgEl('line', { class: 'cursor', x1: 0, x2: 0, y1: 0, y2: U }, svg);
  const rounds = script.at(-1)!.traces.length;
  const traces = Array.from({ length: rounds }, () => svgEl('polyline', { class: 'trace', points: '' }, svg));
  const gaps = Array.from({ length: T }, (_, i) => svgEl('line', { class: 'gap', x1: x(i) * U, x2: x(i) * U, y1: 0, y2: 0 }, svg));
  const notesLine = svgEl('polyline', { class: 'notes-line', points: '' }, svg);
  const targetsLine = svgEl('polyline', { class: 'targets-line', points: '' }, svg);
  const mark = (cls: string, i: number): HTMLElement => {
    const m = el('span', `mk ${cls}`);
    m.dataset.t = String(i);
    m.style.left = pc(x(i));
    box.append(m);
    return m;
  };
  const notes = Array.from({ length: positions }, (_, i) => mark(i === T ? 'result' : 'note', i));
  const targets = Array.from({ length: T }, (_, i) => mark('target', i));
  const line = (values: readonly number[], from = 0): string => values.slice(from).map((v, k) => `${x(from + k) * U},${down(v) * U}`).join(' ');

  let stop: (() => void) | undefined;
  let stand: { notes: number[]; targets: number[] } | undefined;

  const place = (s: TdStep, n: readonly number[], g: readonly number[]): void => {
    notesLine.setAttribute('points', line(n));
    notes.forEach((m, i) => (m.style.top = pc(down(n[i]!))));
    targets.forEach((m, i) => (m.style.top = pc(down(g[i]!))));
    // The targets' line runs from the earliest known target to the result it climbed from.
    const from = s.known.length ? Math.min(...s.known) : T;
    targetsLine.setAttribute('points', from < T ? `${line(g, from)} ${x(T) * U},${down(n[T]!) * U}` : '');
    gaps.forEach((l, i) => {
      l.setAttribute('y1', String(down(n[i]!) * U));
      l.setAttribute('y2', String(down(g[i]!) * U));
    });
  };

  return {
    box,
    settle: () => stop?.(),
    show(k, move) {
      stop?.();
      stop = undefined;
      const s = script[k]!;
      const known = new Set(s.known);
      targets.forEach((m, i) => {
        m.classList.toggle('known', known.has(i));
        m.dataset.target = String(s.targets[i]);
        m.classList.toggle('new', i === s.current);
        m.classList.toggle('src', s.current !== null && i === s.current + 1);
      });
      notes.forEach((m, i) => {
        m.dataset.note = String(s.notes[i]);
        m.classList.toggle('src', s.current !== null && i === s.current + 1);
      });
      traces.forEach((p, r) => p.setAttribute('points', s.traces[r] ? line(s.traces[r]) : ''));
      gaps.forEach((l) => l.classList.toggle('on', s.gap !== null));
      cursor.classList.toggle('off', s.current === null);
      if (s.current !== null) {
        cursor.setAttribute('x1', String(x(s.current) * U));
        cursor.setAttribute('x2', String(x(s.current) * U));
      }
      const from = stand;
      const to = { notes: s.notes, targets: s.targets };
      stand = to;
      if (move && from && (s.kind === 'adjust' || s.kind === 'retarget')) {
        const mix = (a: readonly number[], b: readonly number[], p: number): number[] => b.map((v, i) => (a[i] ?? v) + (v - (a[i] ?? v)) * p);
        stop = tween(s.kind === 'adjust' ? 1500 : 900, (p) => place(s, mix(from.notes, to.notes, p), mix(from.targets, to.targets, p)));
      } else {
        place(s, to.notes, to.targets);
      }
    },
  };
}

export class PogoTdTargets extends PogoFigure {
  static override styles = netCss + tdCss;

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
      const script = tdScript(tdRounds(g.states, net, TD_ROUNDS));
      root.replaceChildren(...this.content(lang, g, script, current.signal));
    };
    draw();
    const off = deps.store.on('game', draw);
    signal.addEventListener('abort', () => void off(), { once: true });
  }

  private content(lang: Lang, g: TdGame, script: TdStep[], signal: AbortSignal): HTMLElement[] {
    const positions = g.states.length;
    const T = positions - 1;
    const strip = positions <= STRIP_MAX;
    const words = el('div', 'position-words');
    const hint = el('p', 'hint', t(lang, 'tdHint'));
    hint.toggleAttribute('data-off', g.source !== 'default');
    words.append(el('p', 'where-from', gameWords(lang, g)), hint);

    // Every step's words share one grid cell: the area keeps the room of the longest.
    const status = el('div', 'status');
    status.setAttribute('aria-hidden', 'true');
    const steps = script.map((_, k) => stepWords(lang, g, script, k));
    const blocks = steps.map((s) => {
      const b = el('div', 'said');
      b.append(el('p', 'say step-head', s.head || ' '), el('p', 'step-text', s.text), el('p', 'calc num', s.calc || ' '));
      status.append(b);
      return b;
    });
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    // The strip, the chart and the numbers share their columns: one per position.
    const c = chart(script, positions);
    const film = el('div', strip ? 'film strip' : 'film');
    film.style.setProperty('--n', String(positions));
    const row = (cls: string, label = ''): { cells: HTMLElement[] } => {
      const name = el('span', `row-name ${cls}`, label);
      const cells = g.states.map(() => el('span', `cell ${cls} num`));
      const line = el('div', `row ${cls}`);
      line.append(...cells);
      line.setAttribute('aria-hidden', 'true');
      film.append(name, line);
      return { cells };
    };
    let boards: HTMLElement[] = [];
    if (strip) {
      boards = row('boards').cells;
      boards.forEach((cell, i) => cell.append(drawBoard(g.states[i]!, { size: 60 })));
    }
    const ys = el('div', 'y-ends num');
    ys.setAttribute('aria-hidden', 'true');
    ys.append(el('span', '', '+1'), el('span', '', '0'), el('span', '', '−1'));
    // What each end of the scale means, said at that end.
    const side = (key: 'tdTop' | 'tdBottom', value: string): HTMLElement => {
      const p = el('p', 'side', `${value}${colon(lang)} ${t(lang, key)}`);
      p.setAttribute('aria-hidden', 'true');
      return p;
    };
    film.append(el('span', 'row-name'), side('tdTop', '+1'), ys, c.box, el('span', 'row-name'), side('tdBottom', '−1'));
    const ticks = row('ticks').cells;
    ticks.forEach((cell, i) => {
      if (strip || i === 0 || i === T) cell.textContent = String(i);
    });
    const noteCells = strip ? row('notes', t(lang, 'tdNote')).cells : [];
    const targetCells = strip ? row('targets', t(lang, 'tdTarget')).cells : [];
    film.append(el('span', 'row-name'), el('p', 'axis-x', t(lang, 'tdAxisX')));

    const legend = el('ul', 'legend');
    for (const [cls, key] of [
      ['note', 'tdNote'],
      ['target', 'tdTarget'],
      ['result', 'tdResult'],
      ['trace', 'tdTrace'],
    ] as const) {
      const li = el('li');
      li.append(el('span', `swatch ${cls}`), t(lang, key));
      legend.append(li);
    }

    let at = -1;
    const show = (k: number): void => {
      const s = script[k]!;
      blocks.forEach((b, i) => b.toggleAttribute('data-off', i !== k));
      c.show(k, k === at + 1 && !this.reducedMotion());
      boards.forEach((cell, i) => {
        cell.classList.toggle('now', i === s.current);
        cell.classList.toggle('next', s.current !== null && i === s.current + 1);
      });
      const known = new Set(s.known);
      noteCells.forEach((cell, i) => (cell.textContent = signedNote(lang, s.notes[i]!)));
      targetCells.forEach((cell, i) => (cell.textContent = i < T && known.has(i) ? signedNote(lang, s.targets[i]!) : ''));
      const w = steps[k]!;
      live.textContent = [w.head, w.text, w.calc].filter(Boolean).join('. ');
      at = k;
    };
    const climb = climbMs(positions);
    const held = (k: number): number => ({ start: START_MS, climb, adjust: ADJUST_MS, retarget: RETARGET_MS })[script[k]!.kind];
    const stepper = new Stepper(script.length, show, { signal, interval: held });
    signal.addEventListener('abort', () => c.settle(), { once: true });
    const controls = transport(stepper, { lang });
    show(0);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });

    return [words, status, film, controls, legend, live, this.values(lang, g, script[0]!)];
  }

  /** Every position's value and target as the net was trained, as a table behind a disclosure. */
  private values(lang: Lang, g: TdGame, first: TdStep): HTMLElement {
    const T = g.states.length - 1;
    const details = el('details', 'values');
    details.append(el('summary', 'label', t(lang, 'tdValues')));
    const table = el('table', 'td-table num');
    const head = el('tr');
    for (const k of ['tdPosition', 'toMove', 'tdNote', 'tdTarget'] as const) {
      const th = el('th', 'label', t(lang, k));
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
        el('td', 'note-cell', i === T ? `${signedNote(lang, first.notes[i]!)} (${t(lang, 'tdResult')})` : signedNote(lang, first.notes[i]!)),
        el('td', 'target-cell', i === T ? '—' : signedNote(lang, first.targets[i]!)),
      );
      body.append(tr);
    }
    table.append(thead, body);
    details.append(table);
    return details;
  }
}
