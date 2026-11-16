// <pogo-mosaic>: the mosaics (fig. 24). For the program the reader picks, each
// of the eight stages of its training as 100 squares, one per game of its
// bench against greedy under lc1-2 (the first 50 pairs, public/data/v5.json,
// seed 1; mosaic-grid.ts), in the order they were played. Ink only: a won game
// is a filled square, a lost one an outlined square; a slash inside marks a
// game in which at least one of the program's moves was a mistake, a short
// bar one in which none of its moves could be judged (all played from a
// position already lost). Beside each mosaic, its totals in words, the stage's
// bench score, and under them all the same totals as a table.
//
// Each stage is one SVG of four paths (won squares, lost squares, and the marks
// on each), scaled as a whole: no text inside it, and no node per game.
import type { V5Data } from '../data';
import { choiceGroup } from '../kit/controls';
import { formatDate } from '../kit/date';
import { PogoFigure } from '../kit/figure';
import { formatScore, formatShare } from '../kit/score';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { V5_FILE, sharedV5 } from '../v5';
import { countNodes } from './count-steps';
import { MOSAIC_COLUMNS, MOSAIC_PROGRAMS, mosaicSource, mosaicStages, type GameMark, type MosaicProgram, type MosaicSquare, type MosaicStage } from './mosaic-grid';
import mosaicCss from './pogo-mosaic.css?raw';
import { pctText } from './stage-view';

const NS = 'http://www.w3.org/2000/svg';
const NAME: Record<MosaicProgram, StringKey> = { az100: 'progAz100', td: 'progTd', qtab: 'progQtab' };
/** One cell of the grid in the SVG's units, and the square drawn inside it. */
const CELL = 10;
const INSET = 1;
const SIDE = CELL - 2 * INSET;

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

/** The stage's totals in words: « 90 gagnées sur 100 », « erreurs : 1,5 % des coups jugés (7 sur 465) ». */
export function totalsWords(lang: Lang, s: MosaicStage): { wins: string; mistakes: string; bench: string } {
  const n = (x: number): string => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB').format(x);
  return {
    wins: `${n(s.wins)} ${t(lang, 'mosaicWonOf')} ${n(s.games)}`,
    mistakes: `${t(lang, 'mosaicMistakes')}${colon(lang)} ${formatShare(lang, s.share)} ${t(lang, 'mosaicOfJudged')} (${n(s.mistakes)} ${t(lang, 'outOf')} ${n(s.judged)})`,
    bench: `${t(lang, 'mosaicBench')}${colon(lang)} ${formatScore(lang, s)}`,
  };
}

export class PogoMosaic extends PogoFigure {
  static override fidelity = 'measured' as const;
  static override game = 'gameLc12' as const;
  static override styles = mosaicCss;
  static override stageMinHeight = '1200px';

  /** The data; a test swaps it. */
  static deps: { v5: () => Promise<V5Data> } = { v5: sharedV5 };

  private source: string | undefined;

  /** The file the figure asks for until its data is loaded (and for good if that fails), then the data's source and the mosaics' directory. */
  protected override sourceFile(): string {
    return this.source ?? V5_FILE;
  }

  protected async render(signal: AbortSignal): Promise<void> {
    const data = await (this.constructor as typeof PogoMosaic).deps.v5();
    if (signal.aborted) return;
    // Every program is read before anything is drawn: data that does not add up fails the figure.
    const all = Object.fromEntries(MOSAIC_PROGRAMS.map((p) => [p, mosaicStages(data, p)])) as Record<MosaicProgram, MosaicStage[]>;
    const date = formatDate(this.lang, data.asOf);
    this.source = mosaicSource(data);
    this.refreshLabel();
    const lang = this.lang;

    const root = el('div', 'mosaics');
    const picker = choiceGroup<MosaicProgram>({
      label: t(lang, 'mosaicPick'),
      id: 'mosaic-pick',
      choices: MOSAIC_PROGRAMS.map((p) => ({ value: p, label: t(lang, NAME[p]) })),
      onChoose: (p) => choose(p),
    });
    const announce = el('p', 'sr');
    announce.setAttribute('role', 'status');
    announce.setAttribute('aria-live', 'polite');
    const list = el('ol', 'stage-list');
    const values = el('details', 'values');
    const summary = el('summary', 'label', t(lang, 'raceValues'));
    const tableSlot = el('div');
    values.append(summary, tableSlot);

    const choose = (program: MosaicProgram): void => {
      picker.set(program);
      const stages = all[program];
      list.replaceChildren(...stages.map((s) => this.stageItem(lang, s)));
      tableSlot.replaceChildren(this.table(lang, program, stages));
      const first = totalsWords(lang, stages[0]!);
      const last = totalsWords(lang, stages.at(-1)!);
      announce.textContent = `${t(lang, NAME[program])}. ${pctText(lang, stages[0]!.pct)}${colon(lang)} ${first.wins}, ${first.mistakes}. ${pctText(lang, stages.at(-1)!.pct)}${colon(lang)} ${last.wins}, ${last.mistakes}.`;
    };

    root.append(
      el('p', 'label title', t(lang, 'mosaicTitle')),
      picker.element,
      this.legend(lang),
      announce,
      list,
      el('p', 'note', t(lang, 'mosaicSample')),
      el('p', 'note', t(lang, 'mosaicMistakeRule')),
      values,
      el('p', 'label as-of num', `${t(lang, 'asOf')} ${date}`),
    );
    choose('az100');
    // The announcement is for a reader's choice, not the first drawing.
    announce.textContent = '';
    this.stage.append(root);
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
    const head = el('p', 'label where num');
    head.append(`${pctText(lang, s.pct)} · ${t(lang, 'mosaicAfter')} `, ...countNodes(lang, s.gamesTrained), ` ${t(lang, 'stagesGames')}`);
    const svg = mosaicSvg(s.squares);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${w.wins}. ${w.mistakes}.`);
    const totals = el('p', 'totals num');
    totals.append(el('strong', '', w.wins), ` · ${w.mistakes}`);
    li.append(head, svg, totals, el('p', 'bench num', w.bench));
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
    table.append(el('caption', 'label', t(lang, NAME[program])));
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
