// <pogo-race>: the race (fig. 23). Every learning program's measured score
// against the greedy player under lc1-2, at each stage of its training, placed
// by games trained on a log axis, with the exact-table player, greedy and the
// random player as horizontal references (public/data/v5.json, seed 1;
// race-chart.ts places every point). Stage 0 sits in its own column, detached
// from the axis. Ink only: the programs differ by line style and marker shape,
// each named at its line's end. Under the chart, for each program, the first
// measured stage above greedy, in words; then every value as a table. The
// chart is drawn once: nothing moves, nothing counts up.
//
// The lines and intervals are an SVG stretched to its box; every word and every
// marker is HTML placed over it by percentage (as kit/board-labels.ts places a
// board's coordinates), so type and markers keep their size from 280px to 640px
// and no layout is read.
import type { V5Data } from '../data';
import { formatDate } from '../kit/date';
import { keepCase } from '../kit/keep-case';
import { PogoFigure } from '../kit/figure';
import { formatScore } from '../kit/score';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { V5_FILE, sharedV5 } from '../v5';
import { countNodes, formatCount } from './count-steps';
import raceCss from './pogo-race.css?raw';
import { raceChart, raceSource, type RaceChart, type RaceProgram, type RaceSeries, type ReferenceKey } from './race-chart';
import { pctText } from './stage-view';

const NS = 'http://www.w3.org/2000/svg';
/** The SVG's user space: 0–1000 both ways, stretched to the box (preserveAspectRatio none). */
const U = 1000;

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

export class PogoRace extends PogoFigure {
  static override fidelity = 'measured' as const;
  static override game = 'gameLc12' as const;
  static override styles = raceCss;
  static override stageMinHeight = '640px';

  /** The data; a test swaps it. */
  static deps: { v5: () => Promise<V5Data> } = { v5: sharedV5 };

  private source: string | undefined;

  /** The file the figure asks for until its data is loaded (and for good if that fails), then the data's own source. */
  protected override sourceFile(): string {
    return this.source ?? V5_FILE;
  }

  protected async render(signal: AbortSignal): Promise<void> {
    const data = await (this.constructor as typeof PogoRace).deps.v5();
    if (signal.aborted) return;
    const chart = raceChart(data);
    const date = formatDate(this.lang, data.asOf);
    this.source = raceSource(data);
    this.refreshLabel();
    const lang = this.lang;

    const root = el('div', 'race');
    const head = el('div', 'head');
    head.append(el('p', 'label title', t(lang, 'raceTitle')), el('p', 'unit', t(lang, 'raceUnit')));
    root.append(head, this.plot(lang, chart), el('p', 'axis-note', t(lang, 'raceAxis')), el('p', 'axis-note', t(lang, 'raceCompute')));
    root.append(this.passes(lang, chart, data), this.values(lang, chart, data));
    root.append(el('p', 'label as-of num', `${t(lang, 'asOf')} ${date}`));
    this.stage.append(root);
  }

  /** The drawing: y labels, the zero column, the log axis, every name inside its box. Hidden from assistive tech: the table says it all. */
  private plot(lang: Lang, chart: RaceChart): HTMLElement {
    const plot = el('div', 'plot');
    plot.setAttribute('aria-hidden', 'true');

    const yAxis = el('div', 'y-axis');
    for (const v of [0, 25, 50, 75, 100]) {
      const tick = el('span', 'tick num', String(v));
      tick.style.top = pc(1 - v / 100);
      yAxis.append(tick);
    }

    // Stage 0: one slot per program, its own gridlines, nothing joining it to the axis.
    const zero = el('div', 'box zero');
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
    const zeroTick = el('div', 'x-axis zero-axis');
    const z = el('span', 'tick num', '0');
    z.style.left = '50%';
    zeroTick.append(z);

    const log = el('div', 'box log');
    const svg = stretched();
    grid(svg);
    for (const tk of chart.axis.ticks) svg.append(svgEl('line', { class: 'grid', x1: tk.x * U, x2: tk.x * U, y1: 0, y2: U }));
    for (const r of chart.references) svg.append(svgEl('line', { class: `ref ref-${r.key}`, x1: 0, x2: U, y1: Y(r.y), y2: Y(r.y) }));
    const marks = el('div', 'marks');
    const names = el('div', 'names');
    // Drawn last to first, so the first program's line is on top.
    for (const s of [...chart.series].reverse()) {
      const on = s.points.filter((p) => p.column === 'log');
      for (const p of on) svg.append(svgEl('line', { class: 'ci', x1: p.x * U, x2: p.x * U, y1: Y(p.lo), y2: Y(p.hi) }));
      if (on.length > 1) {
        svg.append(svgEl('polyline', { class: `run run-${s.program}`, points: on.map((p) => `${p.x * U},${Y(p.y)}`).join(' ') }));
      }
      for (const p of on) marks.append(marker(s.program, p.x, p.y));
      const end = on.at(-1);
      if (end) {
        // Where each name sits against its line's end (pogo-race.css, .name-*): set once, checked on screenshots at 280 and 640px.
        const name = el('span', `name name-${s.program}`, t(lang, SHORT[s.program]));
        name.style.left = pc(end.x);
        name.style.top = pc(1 - end.y);
        names.append(name);
      }
    }
    log.append(svg, marks, names);

    const xAxis = el('div', 'x-axis log-axis');
    for (const tk of chart.axis.ticks) {
      const tick = el('span', `tick num${Math.round(Math.log10(tk.games)) % 2 === 1 ? ' minor' : ''}`, formatCount(lang, tk.games));
      tick.style.left = pc(tk.x);
      xAxis.append(tick);
    }

    // The references are named at the axis's left end, just above their lines, where no program runs.
    for (const r of chart.references) {
      const n = el('span', `name ref-name ref-name-${r.key}`, t(lang, REF_NAME[r.key]));
      n.style.top = pc(1 - r.y);
      names.append(n);
    }

    plot.append(yAxis, zero, log, zeroTick, xAxis);
    return plot;
  }

  /** Where each program first passes greedy, in words, and the rule that decides it. */
  private passes(lang: Lang, chart: RaceChart, data: V5Data): HTMLElement {
    const box = el('div', 'passes');
    box.append(el('p', 'label passes-title', t(lang, 'racePasses')));
    const list = el('ul', 'pass-list');
    for (const s of chart.series) {
      const w = passWords(lang, s);
      const li = el('li', `pass pass-${s.program}`);
      const key = el('span', `mark mark-${s.program} key`);
      key.setAttribute('aria-hidden', 'true');
      const strong = el('strong', '', w.name);
      li.append(key, strong, w.rest, ...countNodes(lang, w.games), ` ${t(lang, 'stagesGames')}`);
      if (!s.firstAbove) li.append(` (${formatScore(lang, s.points.at(-1)!)} ${t(lang, 'raceAtEnd')})`);
      li.append('.');
      list.append(li);
    }
    box.append(list, el('p', 'rule', `${t(lang, 'raceRule')} ${formatScore(lang, data.references.greedy)}.`));
    return box;
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
