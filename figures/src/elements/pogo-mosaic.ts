// <pogo-mosaic>: the mosaics (fig. 24). Each stage of training is the first
// 100 games of a program's bench against greedy under lc1-2 (the first 50
// pairs, public/data/v5.json, seed 1; mosaic-grid.ts), one square per game in
// the order they were played. Ink only: a won game is a filled square, a lost
// one an outlined square; a slash inside marks a game in which at least one of
// the program's moves was a mistake, a short bar one in which none of its moves
// could be judged (it played none, or all from a position already lost).
//
// The main view shows the three programs at once, at one stage, driven by one
// stepper. A step sweeps the three grids together: square k changes at
// k × SWEEP_STEP_MS (mosaic-sweep.ts), crisply, through a zero-length CSS
// transition delayed by a per-square custom property; the totals under each
// grid change in one go once the sweep is over. Each stage is a hundred new
// games, and the figure says so. Under reduced motion nothing moves by itself
// and a step changes every square at once. The view rests at stage 0 until the
// reader presses play.
//
// The second view, behind « Toutes les étapes », is one program at a time with
// its eight stages stacked, each one SVG of four paths: no node per game.
import type { V5Data } from '../data';
import { choiceGroup, transport } from '../kit/controls';
import { autoplay } from '../kit/autoplay';
import { keepCase } from '../kit/keep-case';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { formatShare } from '../kit/score';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { sharedV5 } from '../v5';
import { MOSAIC_COLUMNS, MOSAIC_PROGRAMS, mosaicStages, type GameMark, type MosaicProgram, type MosaicSquare, type MosaicStage } from './mosaic-grid';
import { sweepPlan, type SquareState } from './mosaic-sweep';
import mosaicCss from './pogo-mosaic.css?raw';
import { pctText, whenNodes, whenText } from './stage-view';

const NS = 'http://www.w3.org/2000/svg';
const NAME: Record<MosaicProgram, StringKey> = { az100: 'progAz100', td: 'progTd', qtab: 'progQtab' };
/** One cell of the grid in the SVG's units, and the square drawn inside it. */
const CELL = 10;
const INSET = 1;
const SIDE = CELL - 2 * INSET;
/** A sweep takes up to 495 ms; the stage then holds until the next step. */
const SWEEP_INTERVAL = 1100;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function path(className: string, d: string): SVGPathElement {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('class', className);
  p.setAttribute('d', d);
  return p;
}

const squareD = (x: number, y: number): string => `M${x + INSET} ${y + INSET}h${SIDE}v${SIDE}h${-SIDE}z`;

/** The mark inside a square: a slash for a mistake, a short level bar when nothing was judged. */
function markD(mark: GameMark, x: number, y: number): string {
  if (mark === 'mistake') return `M${x + INSET + 1.5} ${y + CELL - INSET - 1.5}L${x + CELL - INSET - 1.5} ${y + INSET + 1.5}`;
  if (mark === 'none-judged') return `M${x + INSET + 2} ${y + CELL / 2}h${SIDE - 4}`;
  return '';
}

/** Squares as four paths: won, lost, the marks on won squares, the marks on lost ones. */
export function mosaicSvg(squares: readonly Pick<MosaicSquare, 'result' | 'mark' | 'col' | 'row'>[], columns = MOSAIC_COLUMNS): SVGSVGElement {
  const rows = Math.max(1, Math.ceil(squares.length / columns));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${columns * CELL} ${rows * CELL}`);
  svg.setAttribute('class', 'mosaic');
  svg.setAttribute('focusable', 'false');
  const d = { won: '', lost: '', wonMarks: '', lostMarks: '' };
  for (const q of squares) {
    const x = q.col * CELL;
    const y = q.row * CELL;
    if (q.result === 'win') {
      d.won += squareD(x, y);
      d.wonMarks += markD(q.mark, x, y);
    } else {
      d.lost += squareD(x, y);
      d.lostMarks += markD(q.mark, x, y);
    }
  }
  svg.append(path('won', d.won), path('lost', d.lost), path('mark on-won', d.wonMarks), path('mark on-lost', d.lostMarks));
  return svg;
}

/**
 * A grid the main view sweeps: one group per square (its square, its slash, its
 * bar), whose class is its state and whose `--d` is its delay. CSS draws the
 * state and times the change; nothing here runs per square on a timer.
 */
export function sweptSvg(squares = 100, columns = MOSAIC_COLUMNS): SVGSVGElement {
  const rows = Math.ceil(squares / columns);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${columns * CELL} ${rows * CELL}`);
  svg.setAttribute('class', 'mosaic swept');
  svg.setAttribute('focusable', 'false');
  for (let k = 0; k < squares; k++) {
    const x = (k % columns) * CELL;
    const y = Math.floor(k / columns) * CELL;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'sq');
    g.append(path('box', squareD(x, y)), path('slash', markD('mistake', x, y)), path('bar', markD('none-judged', x, y)));
    svg.append(g);
  }
  return svg;
}

/** Moves a swept grid to `to`: each changed square gets its delay, then its new state, in one style change. */
export function paintSwept(svg: SVGSVGElement, from: readonly SquareState[] | null, to: readonly SquareState[], reduced: boolean): number {
  const plan = sweepPlan(from, to, reduced);
  const squares = svg.children;
  for (const c of plan.changes) {
    const g = squares[c.index] as SVGGElement;
    g.style.setProperty('--d', `${c.delay}ms`);
    g.setAttribute('class', `sq ${c.to.result} m-${c.to.mark}`);
  }
  return plan.duration;
}

/** The state of each square of a stage. */
const stateOf = (s: MosaicStage): SquareState[] => s.squares.map(({ result, mark }) => ({ result, mark }));

/**
 * The stage's totals in words: « 90 gagnées sur 100 », « erreurs : 1,5 % des coups jugés (7 sur 465) »,
 * « 7 parties avec au moins une erreur · 10 sans coup jugé ».
 */
export function totalsWords(lang: Lang, s: MosaicStage): { wins: string; mistakes: string; games: string; bench: string } {
  const n = (x: number): string => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB').format(x);
  return {
    wins: `${n(s.wins)} ${t(lang, 'mosaicWonOf')} ${n(s.games)}`,
    mistakes: `${t(lang, 'mosaicMistakes')}${colon(lang)} ${formatShare(lang, s.share)} ${t(lang, 'mosaicOfJudged')} (${n(s.mistakes)} ${t(lang, 'outOf')} ${n(s.judged)})`,
    games: `${n(s.mistakenGames)} ${t(lang, 'mosaicGamesMistaken')} · ${n(s.noneJudgedGames)} ${t(lang, 'mosaicGamesNoneJudged')}`,
    bench: `${t(lang, 'mosaicBench')}${colon(lang)} ${formatShare(lang, s.score)}`,
  };
}

export class PogoMosaic extends PogoFigure {
  static override styles = mosaicCss;
  /** The main view and its notes at 640px, closed disclosures: about 800px (measured). */
  static override stageMinHeight = '800px';

  /** The data; a test swaps it. */
  static deps: { v5: () => Promise<V5Data> } = { v5: sharedV5 };


  protected async render(signal: AbortSignal): Promise<void> {
    const data = await (this.constructor as typeof PogoMosaic).deps.v5();
    if (signal.aborted) return;
    // Every program is read before anything is drawn: data that does not add up fails the figure.
    const all = Object.fromEntries(MOSAIC_PROGRAMS.map((p) => [p, mosaicStages(data, p)])) as Record<MosaicProgram, MosaicStage[]>;
    const lang = this.lang;

    const root = el('div', 'mosaics');
    // The table follows the program the second view shows, so it is built first.
    const values = this.valuesBox(lang, all);
    root.append(el('p', 'say title', t(lang, 'mosaicTitle')), this.legend(lang), this.sweep(lang, data, all, signal), this.allStages(lang, all), values);
    this.stage.append(root);
  }

  /**
   * The main view: one stepper over the eight stages, three grids swept together, each with its
   * program, how far it has trained, and its totals, which change once its sweep is over.
   */
  private sweep(lang: Lang, data: V5Data, all: Record<MosaicProgram, MosaicStage[]>, signal: AbortSignal): HTMLElement {
    const box = el('div', 'sweep');
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    // Every stage's heading and totals are written once, stacked in one grid cell, only the
    // current one seen: each cell keeps the room of its longest, so a step never moves the page.
    const stacked = (nodes: HTMLElement[]): HTMLElement => {
      const cell = el('div', 'cell');
      cell.append(...nodes);
      return cell;
    };
    const grids = MOSAIC_PROGRAMS.map((program) => {
      const item = el('div', 'sweep-item');
      const heads = all[program].map((s) => {
        const head = el('p', 'say where num');
        head.append(...keepCase(`${t(lang, NAME[program])} · `), ...whenNodes(lang, s.gamesTrained));
        return head;
      });
      const totals = all[program].map((s) => {
        const w = totalsWords(lang, s);
        const p = el('p', 'totals num');
        p.append(el('strong', '', w.wins), ` · ${w.mistakes}`);
        return p;
      });
      const svg = sweptSvg();
      svg.setAttribute('role', 'img');
      item.append(stacked(heads), svg, stacked(totals));
      return { program, item, heads, svg, totals, shown: null as SquareState[] | null };
    });
    const only = (nodes: HTMLElement[], k: number): void => nodes.forEach((n, i) => n.toggleAttribute('data-off', i !== k));

    let pending: AbortController | undefined;
    signal.addEventListener('abort', () => pending?.abort(), { once: true });

    /** `first`: the view's first drawing, at once and unannounced; it never plays by itself. */
    const show = (k: number, first: boolean): void => {
      // A step mid-sweep cancels the last one's totals; the squares re-target by themselves.
      pending?.abort();
      const current = new AbortController();
      pending = current;
      const reduced = first || this.reducedMotion();
      let longest = 0;
      const said: string[] = [];
      for (const g of grids) {
        const stage = all[g.program][k]!;
        const w = totalsWords(lang, stage);
        const to = stateOf(stage);
        longest = Math.max(longest, paintSwept(g.svg, g.shown, to, reduced));
        g.shown = to;
        only(g.heads, k);
        g.svg.setAttribute('aria-label', `${t(lang, NAME[g.program])}, ${whenText(lang, stage.gamesTrained)}. ${w.wins}. ${w.mistakes}. ${w.games}.`);
        said.push(`${t(lang, NAME[g.program])}${colon(lang)} ${w.wins}`);
      }
      const writeTotals = (): void => {
        for (const g of grids) {
          only(g.totals, k);
          // The sweep is over: a square that kept its delay would re-run a staggered recolour on a theme change.
          for (const sq of g.svg.children) (sq as SVGGElement).style.removeProperty('--d');
        }
      };
      if (longest === 0) writeTotals();
      else {
        const timer = setTimeout(writeTotals, longest);
        current.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
      }
      if (!first) live.textContent = `${pctText(lang, data.stagesPct[k]!)}${colon(lang)} ${said.join(lang === 'fr' ? '\u202f; ' : '; ')}.`;
    };

    const stepper = new Stepper(data.stagesPct.length, (k) => show(k, false), { signal, interval: SWEEP_INTERVAL });
    const row = transport(stepper, { lang, counter: (i) => pctText(lang, data.stagesPct[i]!) });
    show(0, true);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
    box.append(...grids.map((g) => g.item), row, live);
    return box;
  }

  /** The second view, as it was built first: one program at a time, its eight stages stacked. */
  private allStages(lang: Lang, all: Record<MosaicProgram, MosaicStage[]>): HTMLElement {
    const details = el('details', 'values all-stages');
    details.append(el('summary', 'label', t(lang, 'mosaicAllStages')));
    const picker = choiceGroup<MosaicProgram>({
      label: t(lang, 'mosaicPick'),
      id: 'mosaic-pick',
      choices: MOSAIC_PROGRAMS.map((p) => ({ value: p, label: t(lang, NAME[p]) })),
      onChoose: (p) => choose(p),
    });
    const list = el('ol', 'stage-list');
    const choose = (program: MosaicProgram): void => {
      picker.set(program);
      list.replaceChildren(...all[program].map((s) => this.stageItem(lang, s)));
      this.valuesFor?.(program);
    };
    const body = el('div', 'all-body');
    body.append(picker.element, list);
    details.append(body);
    choose('az100');
    return details;
  }

  /** Re-draws the table for the program the second view shows. */
  private valuesFor: ((program: MosaicProgram) => void) | undefined;

  private valuesBox(lang: Lang, all: Record<MosaicProgram, MosaicStage[]>): HTMLElement {
    const values = el('details', 'values');
    const slot = el('div');
    values.append(el('summary', 'label', t(lang, 'raceValues')), slot);
    this.valuesFor = (program) => slot.replaceChildren(this.table(lang, program, all[program]));
    this.valuesFor('az100');
    return values;
  }

  /** What each state of a square is, in words, beside a square drawn like the mosaic's. */
  private legend(lang: Lang): HTMLElement {
    const ul = el('ul', 'legend');
    const key = (squares: Pick<MosaicSquare, 'result' | 'mark' | 'col' | 'row'>[], text: string): HTMLLIElement => {
      const li = el('li');
      const svg = mosaicSvg(squares, squares.length);
      svg.setAttribute('aria-hidden', 'true');
      li.append(svg, text);
      return li;
    };
    const both = (mark: GameMark) => [
      { result: 'win' as const, mark, col: 0, row: 0 },
      { result: 'loss' as const, mark, col: 1, row: 0 },
    ];
    ul.append(
      key([{ result: 'win', mark: 'clean', col: 0, row: 0 }], t(lang, 'mosaicWon')),
      key([{ result: 'loss', mark: 'clean', col: 0, row: 0 }], t(lang, 'mosaicLost')),
      key(both('mistake'), t(lang, 'mosaicMistake')),
      // Only a lost game has had nothing judged in round 5, but the mark means the same on either.
      key([{ result: 'loss', mark: 'none-judged', col: 0, row: 0 }], t(lang, 'mosaicNoneJudged')),
    );
    const box = el('div', 'key');
    box.append(el('p', 'note', t(lang, 'mosaicLegend')), ul);
    return box;
  }

  private stageItem(lang: Lang, s: MosaicStage): HTMLLIElement {
    const w = totalsWords(lang, s);
    const li = el('li', 'stage-item');
    const head = el('p', 'say where num');
    head.append(`${pctText(lang, s.pct)} · `, ...whenNodes(lang, s.gamesTrained));
    const svg = mosaicSvg(s.squares);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${w.wins}. ${w.mistakes}. ${w.games}.`);
    const totals = el('p', 'totals num');
    totals.append(el('strong', '', w.wins), ` · ${w.mistakes}`);
    li.append(head, svg, totals, el('p', 'games-count num', w.games), el('p', 'bench num', w.bench));
    return li;
  }

  private table(lang: Lang, program: MosaicProgram, stages: MosaicStage[]): HTMLTableElement {
    const n = (x: number): string => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB').format(x);
    const th = (text: string, scope: 'col' | 'row', className = ''): HTMLTableCellElement => {
      const cell = el('th', className, text);
      cell.scope = scope;
      return cell;
    };
    const table = el('table', 'table');
    const caption = el('caption', 'label');
    caption.append(...keepCase(t(lang, NAME[program])));
    table.append(caption);
    const head = el('tr');
    head.append(
      th(t(lang, 'raceStage'), 'col'),
      th(t(lang, 'raceGames'), 'col'),
      th(`${t(lang, 'mosaicWins')} / ${n(stages[0]!.games)}`, 'col'),
      th(t(lang, 'mosaicMistakeShare'), 'col'),
    );
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const s of stages) {
      const row = el('tr');
      row.append(
        th(pctText(lang, s.pct), 'row', 'num'),
        el('td', 'num', n(s.gamesTrained)),
        el('td', 'num', n(s.wins)),
        el('td', 'num', `${formatShare(lang, s.share)} (${n(s.mistakes)} / ${n(s.judged)})`),
      );
      body.append(row);
    }
    table.append(thead, body);
    return table;
  }
}
