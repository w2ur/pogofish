// <pogo-race>: the race (fig. 23). Every learning program's measured score
// against the greedy player under lc1-2, at each stage of its training, placed
// by games trained on a log axis, with the exact-table player, greedy and the
// random player as horizontal references (public/data/v5.json, seed 1;
// race-chart.ts places every point). Stage 0 sits in its own column, detached
// from the axis. Ink only: the programs differ by line style and marker shape.
//
// It runs as a race when it comes on screen (kit/autoplay.ts): one clock sweeps
// the training-games axis from left to right at one speed, stopping at every
// measured number of games (race-chart.ts, raceEvents); each line is drawn up
// to the clock and its name rides its head, with the score of its last stage
// reached, never a value between two. When a line's whole 95 % interval first
// clears greedy's, that point is framed and its sentence lands in the list
// under the chart, in the order the crossings happen; Q-learning, which never
// crosses, lands last, when the clock reaches the end. The reader pauses,
// replays, steps from stop to stop, or drags the clock (arrow keys too). At
// rest and under reduced motion: the finished chart.
//
// The lines and intervals are an SVG stretched to its box; every word and every
// marker is HTML placed over it by percentage (as kit/board-labels.ts places a
// board's coordinates), so type and markers keep their size from 280px to 1100px.
import type { V5Data } from '../data';
import { autoplay } from '../kit/autoplay';
import { transport } from '../kit/controls';
import { keepCase } from '../kit/keep-case';
import { PogoFigure } from '../kit/figure';
import { formatScore, formatShare } from '../kit/score';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { sharedV5 } from '../v5';
import { countNodes, formatCount } from './count-steps';
import raceCss from './pogo-race.css?raw';
import {
  crossingEvent,
  crossingOrder,
  headAt,
  lastReached,
  raceChart,
  raceEvents,
  type RaceChart,
  type RaceEvent,
  type RaceProgram,
  type RaceSeries,
  type ReferenceKey,
} from './race-chart';
import { pctText } from './stage-view';

const NS = 'http://www.w3.org/2000/svg';
/** The SVG's user space: 0–1000 both ways, stretched to the box (preserveAspectRatio none). */
const U = 1000;
/** How long the clock takes from the axis's left edge to its last stop, in automatic play. */
export const RACE_MS = 17_000;
/** How long the clock takes to a stop the reader chose, one stop away. */
const SEEK_MS = 300;

const NAME: Record<RaceProgram, StringKey> = { az100: 'progAz100', az0: 'progAz0', td: 'progTd', qtab: 'progQtab' };
const SHORT: Record<RaceProgram, StringKey> = { az100: 'raceShortAz100', az0: 'raceShortAz0', td: 'progTd', qtab: 'progQtab' };
const REF_NAME: Record<ReferenceKey, StringKey> = { table: 'refTable', greedy: 'refGreedy', random: 'refRandom' };
const REF_WHO: Record<ReferenceKey, StringKey> = { table: 'refTableWho', greedy: 'refGreedyWho', random: 'refRandomWho' };

const pc = (f: number): string => `${(f * 100).toFixed(3)}%`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** An SVG filling its box, stretched both ways; its strokes keep their width. */
function stretched(): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: `0 0 ${U} ${U}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
  svg.setAttribute('class', 'lines');
  return svg as SVGSVGElement;
}

const Y = (score: number): number => (1 - score) * U;

/** The horizontal gridlines at 0, 25, 50, 75 and 100 %. */
function grid(svg: SVGSVGElement): void {
  for (const v of [0, 0.25, 0.5, 0.75, 1]) svg.append(svgEl('line', { class: v === 0 ? 'base' : 'grid', x1: 0, x2: U, y1: Y(v), y2: Y(v) }));
}

/** A marker: an HTML square, diamond or triangle, centred on its point; the shape names the program. */
function marker(program: RaceProgram, x: number, y: number): HTMLElement {
  const m = el('span', `mark mark-${program}`);
  m.style.left = pc(x);
  m.style.top = pc(1 - y);
  return m;
}

/** « AlphaZero, 100 simulations : au-dessus du glouton dès 500 parties d’entraînement. » */
export function passWords(lang: Lang, s: RaceSeries): { name: string; rest: string; games: number } {
  const name = `${t(lang, NAME[s.program])}${colon(lang)} `;
  if (s.firstAbove) {
    return { name, rest: `${t(lang, 'raceAboveFrom')} `, games: s.firstAbove.gamesTrained };
  }
  return { name, rest: `${t(lang, 'raceNeverIn')} `, games: s.points.at(-1)!.gamesTrained };
}

/** The clock's place in words: « 1 000 parties », « avant l’entraînement » at the start. */
export function clockWords(lang: Lang, e: RaceEvent): string {
  return e.games === 0 ? t(lang, 'raceBefore') : `${formatCount(lang, e.games)} ${t(lang, 'stagesGames')}`;
}

/** The milliseconds the clock takes from stop `i` to the next, at one speed across the axis. */
export function raceHold(events: readonly RaceEvent[], i: number): number {
  const span = events.at(-1)!.x - events[0]!.x;
  const next = events[i + 1];
  return next ? Math.round((RACE_MS * (next.x - events[i]!.x)) / span) : 0;
}

interface Head {
  series: RaceSeries;
  node: HTMLElement;
  value: HTMLElement;
  shown: boolean;
}

interface Plot {
  element: HTMLElement;
  /** What the clock uncovers: the lines, their intervals, their markers. */
  ink: HTMLElement;
  heads: HTMLElement;
  clock: HTMLElement;
  scrub: HTMLElement;
  frames: Map<RaceProgram, HTMLElement>;
}

export class PogoRace extends PogoFigure {
  static override styles = raceCss;
  static override stageMinHeight = '640px';

  /** The data; a test swaps it. */
  static deps: { v5: () => Promise<V5Data> } = { v5: sharedV5 };

  protected async render(signal: AbortSignal): Promise<void> {
    const data = await (this.constructor as typeof PogoRace).deps.v5();
    if (signal.aborted) return;
    const chart = raceChart(data);
    const events = raceEvents(chart);
    const last = events.length - 1;
    const lang = this.lang;

    const root = el('div', 'race');
    const head = el('div', 'head');
    head.append(el('p', 'say title', t(lang, 'raceTitle')), el('p', 'unit', t(lang, 'raceUnit')));
    const plot = this.plot(lang, chart);
    const passes = this.passes(lang, chart);

    // Each program's name rides its line's head, with the score of its last stage reached.
    const heads: Head[] = chart.series.map((series) => {
      const node = el('span', `name head-name name-${series.program}`);
      const value = el('span', 'head-value num');
      node.append(t(lang, SHORT[series.program]), ' ', value);
      plot.heads.append(node);
      return { series, node, value, shown: false };
    });
    const crossings = crossingOrder(chart).map((s) => ({
      at: crossingEvent(events, s),
      item: passes.items.get(s.program)!,
      frame: plot.frames.get(s.program),
    }));

    let placed: { i: number; x: number; playing: boolean } | undefined;
    /** Puts the clock where it is, or where it is heading: the next stop while it plays, else its own. */
    const place = (stepper: Stepper): void => {
      const i = stepper.index;
      const playing = stepper.playing && i < last;
      const x = playing ? events[i + 1]!.x : events[i]!.x;
      if (placed && placed.x === x && placed.playing === playing) return;
      // Playing, the clock runs at one speed; a stop the reader chose one away, a short glide; a jump (a replay from the end, a drag), at once.
      const jump = !playing && placed !== undefined && Math.abs(placed.i - i) > 1;
      const ms = playing ? raceHold(events, i) : jump ? 0 : SEEK_MS;
      root.style.setProperty('--_t', `${ms}ms`);
      placed = { i, x, playing };
      plot.clock.style.left = pc(x);
      // A marker on the clock is uncovered whole: the clip runs half a marker past it.
      plot.ink.style.clipPath = `inset(-24px calc(${((1 - x) * 100).toFixed(3)}% - 7px) -24px -24px)`;
      for (const h of heads) {
        const at = headAt(h.series, x);
        if (!at || !h.shown) continue;
        h.node.style.left = pc(at.x);
        h.node.style.top = pc(1 - at.y);
      }
    };

    /** What has landed at stop `i`: the values of the last stages reached, the crossings, the heads that have started. */
    const land = (i: number): void => {
      const e = events[i]!;
      for (const h of heads) {
        const at = headAt(h.series, e.x);
        h.value.textContent = formatShare(lang, lastReached(h.series, e.games).score);
        if (at && !h.shown) {
          // A head that appears is put at its place at once, never slid there from a stale one.
          h.node.style.transition = 'none';
          h.node.style.left = pc(at.x);
          h.node.style.top = pc(1 - at.y);
          void h.node.offsetWidth;
          h.node.style.transition = '';
        }
        h.shown = at !== null;
        h.node.toggleAttribute('data-off', at === null);
      }
      for (const c of crossings) {
        const on = i >= c.at;
        c.item.toggleAttribute('data-off', !on);
        c.frame?.toggleAttribute('data-off', !on);
      }
      root.dataset.stop = String(e.games);
      plot.scrub.setAttribute('aria-valuenow', String(i));
      plot.scrub.setAttribute('aria-valuetext', clockWords(lang, e));
    };

    const stepper = new Stepper(events.length, land, { signal, hold: (i) => raceHold(events, i) });
    stepper.onChange(() => place(stepper));
    plot.scrub.setAttribute('aria-valuemax', String(last));
    this.scrubbing(plot.scrub, events, stepper);

    // At rest: the finished chart.
    stepper.go(last);
    place(stepper);

    const controls = transport(stepper, { lang, counter: (i) => clockWords(lang, events[i]!) });
    // What the strokes are and why the 0 column stands apart: the chart cannot be read without them.
    root.append(
      head,
      plot.element,
      controls,
      passes.element,
      ...(['raceAxis', 'raceCi', 'raceZero'] as const).map((k) => el('p', 'axis-note', t(lang, k))),
      this.values(lang, chart, data),
    );
    this.stage.append(root);
    autoplay(this, stepper, { signal, still: () => stepper.go(last) });
  }

  /** The clock is a slider: dragged along the axis or moved by the keys, from stop to stop. */
  private scrubbing(scrub: HTMLElement, events: readonly RaceEvent[], stepper: Stepper): void {
    const nearest = (clientX: number): number => {
      const r = scrub.getBoundingClientRect();
      const f = r.width > 0 ? (clientX - r.left) / r.width : 0;
      let best = 0;
      events.forEach((e, i) => {
        if (Math.abs(e.x - f) < Math.abs(events[best]!.x - f)) best = i;
      });
      return best;
    };
    const hold = (): void => {
      if (stepper.playing) stepper.pauseByReader();
    };
    scrub.addEventListener('pointerdown', (e) => {
      hold();
      scrub.setPointerCapture?.(e.pointerId);
      stepper.go(nearest(e.clientX));
    });
    scrub.addEventListener('pointermove', (e) => {
      if (scrub.hasPointerCapture?.(e.pointerId)) stepper.go(nearest(e.clientX));
    });
    scrub.addEventListener('keydown', (e) => {
      const i = stepper.index;
      const to: Record<string, number> = {
        ArrowRight: i + 1,
        ArrowUp: i + 1,
        ArrowLeft: i - 1,
        ArrowDown: i - 1,
        PageUp: i + 3,
        PageDown: i - 3,
        Home: 0,
        End: events.length - 1,
      };
      const target = to[e.key];
      if (target === undefined) return;
      e.preventDefault();
      hold();
      stepper.go(target);
    });
  }

  /** The drawing: y labels, the zero column, the log axis, every name inside its box. */
  private plot(lang: Lang, chart: RaceChart): Plot {
    const plot = el('div', 'plot');
    const hidden = <T extends Element>(node: T): T => {
      node.setAttribute('aria-hidden', 'true');
      return node;
    };

    const yAxis = hidden(el('div', 'y-axis'));
    for (const v of [0, 25, 50, 75, 100]) {
      const tick = el('span', 'tick num', String(v));
      tick.style.top = pc(1 - v / 100);
      yAxis.append(tick);
    }

    // Stage 0: one slot per program, its own gridlines, nothing joining it to the axis.
    const zero = hidden(el('div', 'box zero'));
    const zSvg = stretched();
    grid(zSvg);
    const zMarks = el('div', 'marks');
    for (const s of chart.series) {
      const p = s.points.find((q) => q.column === 'zero');
      if (!p) continue;
      zSvg.append(svgEl('line', { class: 'ci', x1: p.x * U, x2: p.x * U, y1: Y(p.lo), y2: Y(p.hi) }));
      zMarks.append(marker(s.program, p.x, p.y));
    }
    zero.append(zSvg, zMarks);
    const zeroTick = hidden(el('div', 'x-axis zero-axis'));
    const z = el('span', 'tick num', '0');
    z.style.left = '50%';
    zeroTick.append(z);

    const log = hidden(el('div', 'box log'));
    const back = stretched();
    grid(back);
    for (const tk of chart.axis.ticks) back.append(svgEl('line', { class: 'grid', x1: tk.x * U, x2: tk.x * U, y1: 0, y2: U }));
    for (const r of chart.references) back.append(svgEl('line', { class: `ref ref-${r.key}`, x1: 0, x2: U, y1: Y(r.y), y2: Y(r.y) }));
    const ink = el('div', 'ink');
    const svg = stretched();
    const marks = el('div', 'marks');
    // Drawn last to first, so the first program's line is on top.
    for (const s of [...chart.series].reverse()) {
      const on = s.points.filter((p) => p.column === 'log');
      for (const p of on) svg.append(svgEl('line', { class: 'ci', x1: p.x * U, x2: p.x * U, y1: Y(p.lo), y2: Y(p.hi) }));
      if (on.length > 1) {
        svg.append(svgEl('polyline', { class: `run run-${s.program}`, points: on.map((p) => `${p.x * U},${Y(p.y)}`).join(' ') }));
      }
      for (const p of on) marks.append(marker(s.program, p.x, p.y));
    }
    ink.append(svg, marks);
    // A frame round each first point above greedy, shown when the clock reaches it.
    const frames = new Map<RaceProgram, HTMLElement>();
    const framesLayer = el('div', 'marks frames');
    for (const s of chart.series) {
      if (!s.firstAbove) continue;
      const f = el('span', `cross cross-${s.program}`);
      f.style.left = pc(s.firstAbove.x);
      f.style.top = pc(1 - s.firstAbove.y);
      frames.set(s.program, f);
      framesLayer.append(f);
    }
    const clock = el('div', 'clock');
    const names = el('div', 'names');
    // The references are named at the axis's left end, just above their lines, where no program runs.
    for (const r of chart.references) {
      const n = el('span', `name ref-name ref-name-${r.key}`, t(lang, REF_NAME[r.key]));
      n.style.top = pc(1 - r.y);
      names.append(n);
    }
    const heads = el('div', 'names heads');
    log.append(back, ink, framesLayer, clock, names, heads);

    const xAxis = hidden(el('div', 'x-axis log-axis'));
    for (const tk of chart.axis.ticks) {
      const tick = el('span', `tick num${Math.round(Math.log10(tk.games)) % 2 === 1 ? ' minor' : ''}`, formatCount(lang, tk.games));
      tick.style.left = pc(tk.x);
      xAxis.append(tick);
    }

    // Over the log box: the clock's handle, for the pointer and the keyboard.
    const scrub = el('div', 'scrub');
    scrub.tabIndex = 0;
    scrub.setAttribute('role', 'slider');
    scrub.setAttribute('aria-label', t(lang, 'raceClock'));
    scrub.setAttribute('aria-valuemin', '0');

    plot.append(yAxis, zero, log, zeroTick, xAxis, scrub);
    return { element: plot, ink, heads, clock, scrub, frames };
  }

  /** Where each program first passes greedy, in words, in the order it happens. */
  private passes(lang: Lang, chart: RaceChart): { element: HTMLElement; items: Map<RaceProgram, HTMLElement> } {
    const box = el('div', 'passes');
    box.append(el('p', 'say passes-title', t(lang, 'racePasses')));
    const list = el('ul', 'pass-list');
    const items = new Map<RaceProgram, HTMLElement>();
    for (const s of crossingOrder(chart)) {
      const w = passWords(lang, s);
      const li = el('li', `pass pass-${s.program}`);
      const key = el('span', `mark mark-${s.program} key`);
      key.setAttribute('aria-hidden', 'true');
      const strong = el('strong', '', w.name);
      li.append(key, strong, w.rest, ...countNodes(lang, w.games), ` ${t(lang, 'stagesGames')}`);
      if (!s.firstAbove) li.append(` (${formatShare(lang, s.points.at(-1)!.score)} ${t(lang, 'raceAtEnd')})`);
      li.append('.');
      list.append(li);
      items.set(s.program, li);
    }
    box.append(list);
    return { element: box, items };
  }

  /** Every value of the chart, as a table per program, then the references. */
  private values(lang: Lang, chart: RaceChart, data: V5Data): HTMLElement {
    const details = el('details', 'values');
    details.append(el('summary', 'label', t(lang, 'raceValues')));
    const th = (text: string, scope: 'col' | 'row', className = ''): HTMLTableCellElement => {
      const cell = el('th', className, text);
      cell.scope = scope;
      return cell;
    };
    for (const s of chart.series) {
      const table = el('table', `table table-${s.program}`);
      const caption = el('caption', 'label');
      caption.append(...keepCase(t(lang, NAME[s.program])));
      table.append(caption);
      const head = el('tr');
      head.append(th(t(lang, 'raceStage'), 'col'), th(t(lang, 'raceGames'), 'col'), th(t(lang, 'raceScore'), 'col'));
      const body = el('tbody');
      for (const p of s.points) {
        const row = el('tr');
        const games = el('td', 'num');
        games.append(...countNodes(lang, p.gamesTrained));
        row.append(th(pctText(lang, p.pct), 'row', 'num'), games, el('td', 'num', formatScore(lang, p)));
        body.append(row);
      }
      const thead = el('thead');
      thead.append(head);
      table.append(thead, body);
      details.append(table);
    }
    const refs = el('table', 'table table-refs');
    refs.append(el('caption', 'label', t(lang, 'raceReferences')));
    const head = el('tr');
    head.append(th(t(lang, 'raceReference'), 'col'), th(t(lang, 'raceScore'), 'col'));
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const r of chart.references) {
      const row = el('tr');
      row.append(th(t(lang, REF_WHO[r.key]), 'row'), el('td', 'num', formatScore(lang, data.references[r.key])));
      body.append(row);
    }
    refs.append(thead, body);
    details.append(refs);
    return details;
  }
}
