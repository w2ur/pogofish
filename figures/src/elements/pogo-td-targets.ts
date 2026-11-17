// <pogo-td-targets>: what TD(λ) does with one finished game, in two acts
// (fig. 18). The game is the reader's last finished one, else DEFAULT_GAME
// (td-walk.ts); the figure says which and follows the store.
//
// Act 1: the real TD net values every position, the last gets its exact
// result, and the targets climb back up the game one position at a time.
// Two positions stand under a glass: the one whose target is computed and the
// next one, each with its board and its two numbers. The sum is the essay's,
// in its order, (1 − λ) × the next position's value + λ × the next target:
// each term is framed in the next position's column, where it is read, and
// written again in the sum with the mark it has on the chart; the result
// lands in this position's column. One step on, that column has slid to the
// right: the target just computed is the next one's term. A wedge runs from
// the glass to the two columns of the chart it enlarges.
//
// Act 2: the adjustment. The trainer's own step (td-tune.ts) is applied to a
// copy of the net on this game: the values' line moves towards the targets'
// line. Then again, several times: the adjusted net values the game anew, the
// targets are computed anew, and the line moves again. Each earlier line is
// left as a trace, so the settling is seen at rest too, and the mean gap
// between value and target is written large where the glass stood.
//
// Everything is read from White's side, which the figure says, on one −1…+1
// chart, the game's positions in order along it.
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
import { el } from './net-view';
import netCss from './net.css?raw';
import tdCss from './pogo-td-targets.css?raw';
import { noteText, signedNote } from './q-steps';
import { TD_LAMBDA, TD_ROUNDS, tdGame, tdRounds, tdScript, type TdGame, type TdStep } from './td-walk';

const NS = 'http://www.w3.org/2000/svg';
/** The SVG's user space, stretched to the chart's box. */
const U = 1000;
/** A game of at most this many positions names every position under the chart; a longer one, its two ends. */
export const TICKS_MAX = 12;

/** How long a step is held: the first, an adjustment, new targets. */
export const START_MS = 2600;
export const ADJUST_MS = 3400;
export const RETARGET_MS = 2800;
/** The first sums are held long enough to read three numbers and where each comes from; then the pattern is known. */
export const CLIMB_READ_MS = 3200;
export const CLIMB_READ_STEPS = 3;
/** How long the `n`-th target (1, 2…) is held, in a game of `positions` positions. */
export const climbHold = (n: number, positions: number): number =>
  n <= CLIMB_READ_STEPS ? CLIMB_READ_MS : Math.max(1100, Math.min(2000, Math.round(20000 / positions)));
/** How long the glass takes to slide one position. */
const SLIDE_MS = 450;

/** « 70 % » from λ, never typed. */
const pct = (lang: Lang, x: number): string => `${Math.round(x * 100)}${lang === 'fr' ? ' ' : ''}%`;
/** A signed value in a sum: « (−0,25) » when negative, so the minus is not read as an operator. */
const term = (lang: Lang, x: number): string => (x < -0.0005 ? `(${signedNote(lang, x)})` : signedNote(lang, x));
const pc = (f: number): string => `${(f * 100).toFixed(3)}%`;
/** A value's place down the chart's box: +1 near the top, −1 near the bottom. */
const down = (v: number): number => 0.06 + ((1 - v) / 2) * 0.88;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** « cible de la position 7 ». */
const targetOf = (lang: Lang, i: number): string => `${t(lang, 'tdTarget')} ${t(lang, 'tdOfPosition')} ${i}`;

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
    const head = cap(targetOf(lang, i));
    const target = signedNote(lang, s.targets[i]!);
    if (i === T - 1) return { head, text: t(lang, 'tdLastStep'), calc: `${t(lang, 'tdTarget')} = ${t(lang, 'tdResult')} = ${target}` };
    return {
      head,
      text: `${pct(lang, 1 - TD_LAMBDA)} ${t(lang, 'tdStepNote')} ${pct(lang, TD_LAMBDA)} ${t(lang, 'tdStep')}`,
      calc: `${t(lang, 'tdTarget')} = ${pct(lang, 1 - TD_LAMBDA)} × ${term(lang, s.notes[i + 1]!)} + ${pct(lang, TD_LAMBDA)} × ${term(lang, s.targets[i + 1]!)} = ${target}`,
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

type Kind = 'note' | 'target' | 'result';
const KIND_LABEL = { note: 'tdNote', target: 'tdTarget', result: 'tdResult' } as const;

/** A value with the mark it has on the chart; a negative one is marked as such (red). */
function valued(lang: Lang, kind: Kind, cls: string, v: number | null): HTMLElement[] {
  const value = el('span', `${cls} num`, v === null ? '?' : signedNote(lang, v));
  if (v !== null && v < -0.0005) value.dataset.sign = 'negative';
  return [el('span', `swatch ${kind}`), value];
}

/**
 * The two positions under the glass, `now` and the next: each its board and its numbers, those the sum
 * uses framed; in act 2, those the step has just `moved`.
 */
export function glassColumns(lang: Lang, g: TdGame, s: TdStep, now: number, moved?: Kind): HTMLElement[] {
  const T = g.states.length - 1;
  const known = new Set(s.known);
  const computing = s.current !== null;
  return [now, now + 1].map((i, k) => {
    const next = k === 1;
    const col = el('div', next ? 'zcol next' : 'zcol now');
    const m = g.moves[i - 1];
    const board = el('div', 'zboard');
    board.append(drawBoard(g.states[i]!, { size: 120, ...(next && m ? { from: m[0], moving: m[1], to: m[2] } : {}) }));
    const row = (kind: Kind, v: number | null, state: string): HTMLElement => {
      const r = el('div', `zrow ${state}`.trim());
      r.dataset.kind = kind;
      const [swatch, value] = valued(lang, kind, 'zval', v);
      r.append(swatch!, el('span', 'zlabel', t(lang, KIND_LABEL[kind])), value!);
      return r;
    };
    const used = next && computing ? 'used' : '';
    const state = (kind: Kind): string => (computing ? used : kind === moved ? 'new' : '');
    const rows =
      i === T
        ? [row('result', s.notes[i]!, state('result')), el('div', 'zrow')]
        : [row('note', s.notes[i]!, state('note')), row('target', known.has(i) ? s.targets[i]! : null, !next && computing ? 'new' : state('target'))];
    col.append(el('p', 'say ztitle', `${t(lang, 'position')} ${i}`), el('p', 'zsub', next ? t(lang, 'tdNextOne') : ''), board, ...rows);
    return col;
  });
}

/** The step's sum, one term per line: its share, its value with its mark, and the position it is read from. */
export function sumRows(lang: Lang, g: TdGame, s: TdStep): HTMLElement[] {
  if (s.current === null) return [];
  const i = s.current;
  const line = (op: string, share: string, kind: Kind, v: number, label: string, total = false): HTMLElement => {
    const r = el('div', total ? 'srow total' : 'srow');
    const value = el('span', 'sterm');
    value.append(...valued(lang, kind, 'sval', v));
    r.append(el('span', 'sop', op), el('span', 'sshare num', share), value, el('span', 'slabel', label));
    return r;
  };
  const total = line('=', '', 'target', s.targets[i]!, targetOf(lang, i), true);
  if (i === g.states.length - 2) return [line('', '', 'result', s.notes[i + 1]!, t(lang, 'tdGameResult')), total];
  return [
    line('', `${pct(lang, 1 - TD_LAMBDA)} ×`, 'note', s.notes[i + 1]!, `${t(lang, 'tdNoteFor')} ${i + 1}`),
    line('+', `${pct(lang, TD_LAMBDA)} ×`, 'target', s.targets[i + 1]!, targetOf(lang, i + 1)),
    total,
  ];
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
  // What the glass enlarges: the two columns between the film's --cl and --cr.
  box.append(el('span', 'band'));
  const svg = svgEl('svg', { viewBox: `0 0 ${U} ${U}`, preserveAspectRatio: 'none', class: 'td-chart', focusable: 'false' }, box);
  for (const v of [1, 0, -1]) svgEl('line', { class: v === 0 ? 'axis zero' : 'axis', x1: 0, x2: U, y1: down(v) * U, y2: down(v) * U }, svg);
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
      b.append(el('p', 'say step-head', s.head || ' '), el('p', 'step-text', s.text));
      status.append(b);
      return b;
    });
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    // The glass: two positions, and beside them the step's sum, then (act 2) the mean gap.
    const zcols = el('div', 'zcols');
    const zoom = el('div', 'zoom');
    zoom.append(zcols);
    const sum = el('div', 'sum');
    const glass = el('div', 'glass');
    glass.append(zoom, sum);
    glass.setAttribute('aria-hidden', 'true');
    const gapValues = el('p', 'gap-values num');
    const gapLabel = el('p', 'gap-label', t(lang, 'tdGap'));
    // Where the glass rests once every target is in: on the position farthest from its target.
    const end = script[T]!;
    const far = end.targets.map((x, i) => Math.abs(x - end.notes[i]!));
    const rest = far.indexOf(Math.max(...far));

    // The glass, the wedge, the chart and the ticks share the chart's width: one column per position.
    const c = chart(script, positions);
    const film = el('div', 'film');
    film.style.setProperty('--n', String(positions));
    const ys = el('div', 'y-ends num');
    ys.setAttribute('aria-hidden', 'true');
    ys.append(el('span', '', '+1'), el('span', '', '0'), el('span', '', '−1'));
    const tickRow = el('div', 'row ticks');
    tickRow.setAttribute('aria-hidden', 'true');
    const ticks = g.states.map((_, i) => el('span', 'cell ticks num', positions <= TICKS_MAX || i === 0 || i === T ? String(i) : ''));
    tickRow.append(...ticks);
    const wedge = el('div', 'wedge');
    wedge.setAttribute('aria-hidden', 'true');
    film.append(glass, wedge, ys, c.box, tickRow, el('p', 'axis-x', t(lang, 'tdAxisX')));

    const legend = el('ul', 'legend');
    for (const [cls, key] of [
      ['note', 'tdNote'],
      ['target', 'tdTarget'],
      ['result', 'tdResult'],
      ['trace', 'tdTrace'],
      ['gap', 'tdGapOne'],
    ] as const) {
      const li = el('li');
      li.append(el('span', `swatch ${cls}`), t(lang, key));
      legend.append(li);
    }

    let at = -1;
    let under = -1;
    const show = (k: number): void => {
      const s = script[k]!;
      const moving = k === at + 1 && !this.reducedMotion();
      blocks.forEach((b, i) => b.toggleAttribute('data-off', i !== k));
      c.show(k, moving);
      const act1 = s.kind === 'start' || s.kind === 'climb';
      // At the start nothing is computed yet: the glass waits on the last two positions.
      const now = act1 ? (s.current ?? T - 1) : rest;
      zcols.replaceChildren(...glassColumns(lang, g, s, now, s.kind === 'adjust' ? 'note' : s.kind === 'retarget' ? 'target' : undefined));
      film.style.setProperty('--cl', pc(now / positions));
      film.style.setProperty('--cr', pc((now + 2) / positions));
      ticks.forEach((cell, i) => cell.classList.toggle('on', i === now || i === now + 1));
      sum.classList.toggle('gap', !act1);
      if (act1) {
        sum.replaceChildren(...sumRows(lang, g, s));
        // One step up the game: what was computed slides into the next position's column, where it is now read.
        if (moving && now === under - 1 && typeof zcols.animate === 'function') {
          zcols.animate([{ transform: 'translateX(calc(-50% - var(--zgap) / 2))' }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-in-out' });
        }
      } else {
        gapValues.textContent = `${s.kind === 'adjust' ? `${noteText(lang, script[k - 1]!.gap!)} → ` : ''}${noteText(lang, s.gap!)}`;
        sum.replaceChildren(gapLabel, gapValues);
      }
      under = act1 ? now : -1;
      const w = steps[k]!;
      live.textContent = [w.head, w.text, w.calc]
        .filter(Boolean)
        .map((part) => (part.endsWith('.') ? part : `${part}.`))
        .join(' ');
      at = k;
    };
    const held = (k: number): number => ({ start: START_MS, climb: climbHold(k, positions), adjust: ADJUST_MS, retarget: RETARGET_MS })[script[k]!.kind];
    const stepper = new Stepper(script.length, show, { signal, interval: held });
    signal.addEventListener('abort', () => c.settle(), { once: true });
    const controls = transport(stepper, { lang });
    show(0);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });

    return [words, status, film, controls, legend, el('p', 'view', t(lang, 'tdWhiteView')), live];
  }
}

