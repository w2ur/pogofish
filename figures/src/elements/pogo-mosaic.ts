// <pogo-mosaic>: the mosaics (fig. 24), as the letter drew them. Three columns,
// one per program; eight rows, one per stage of training; in each cell the
// first 100 games of the program's bench against greedy at that stage
// (public/data/v5.json; mosaic-grid.ts), one square per game in the order they
// were played, 20 to a row. A game won is a full square in the kit's red, a
// game lost an empty square with a hairline: the picture reads from afar, red
// spreading down the columns of the programs that learn. Under each mosaic,
// how far the program has trained and its games won, and nothing else.
//
// The figure fills stage after stage, by itself once on screen: a stage's
// squares fill one by one in the order of the games (mosaic-sweep.ts), through
// a zero-length CSS transition delayed per square, the three programs in step;
// the counts come once the last square has. No timer runs per square. At rest,
// and under reduced motion from the start, the whole mosaic is shown.
import type { V5Data } from '../data';
import { autoplay } from '../kit/autoplay';
import { progress, transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { keepCase } from '../kit/keep-case';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { sharedV5 } from '../v5';
import { MOSAIC_COLUMNS, MOSAIC_PROGRAMS, mosaicStages, type MosaicProgram, type MosaicStage } from './mosaic-grid';
import { SWEEP_MS, shownStages, sweepDelay } from './mosaic-sweep';
import mosaicCss from './pogo-mosaic.css?raw';
import { pctText, whenNodes, whenText } from './stage-view';

const NS = 'http://www.w3.org/2000/svg';
const NAME: Record<MosaicProgram, StringKey> = { az100: 'progAz100', td: 'progTd', qtab: 'progQtab' };
/** One cell of the grid in the SVG's units, and the square drawn inside it. */
const CELL = 10;
const INSET = 1;
const SIDE = CELL - 2 * INSET;
/** A stage fills in under half a second, then holds long enough to be read before the next. */
export const SWEEP_INTERVAL = 1400;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** « 79 gagnées sur 100 ». */
export function winsWords(lang: Lang, s: Pick<MosaicStage, 'wins' | 'games'>): string {
  return `${s.wins} ${t(lang, 'mosaicWonOf')} ${s.games}`;
}

/**
 * One stage of one program: every game's hairline square in one path, and a filled
 * square over it for each game won, which carries its game's number and its delay.
 */
export function mosaicSvg(stage: Pick<MosaicStage, 'squares'>): SVGSVGElement {
  const rows = Math.max(1, Math.ceil(stage.squares.length / MOSAIC_COLUMNS));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${MOSAIC_COLUMNS * CELL} ${rows * CELL}`);
  svg.setAttribute('class', 'mosaic');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('role', 'img');
  const lost = document.createElementNS(NS, 'path');
  lost.setAttribute('class', 'lost');
  let d = '';
  const won: SVGRectElement[] = [];
  stage.squares.forEach((q, k) => {
    const x = q.col * CELL + INSET;
    const y = q.row * CELL + INSET;
    d += `M${x} ${y}h${SIDE}v${SIDE}h${-SIDE}z`;
    if (q.result !== 'win') return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('class', 'won');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(y));
    r.setAttribute('width', String(SIDE));
    r.setAttribute('height', String(SIDE));
    r.dataset.game = String(k);
    r.style.setProperty('--d', `${sweepDelay(k)}ms`);
    won.push(r);
  });
  lost.setAttribute('d', d);
  svg.append(lost, ...won);
  return svg;
}

export class PogoMosaic extends PogoFigure {
  static override styles = mosaicCss;
  /** A floor only: pogo-mosaic.css keeps the measured room, by width. */
  static override stageMinHeight = '895px';

  /** The data; a test swaps it. */
  static deps: { v5: () => Promise<V5Data> } = { v5: sharedV5 };

  protected async render(signal: AbortSignal): Promise<void> {
    const data = await (this.constructor as typeof PogoMosaic).deps.v5();
    if (signal.aborted) return;
    // Every program is read before anything is drawn: data that does not add up fails the figure.
    const all = Object.fromEntries(MOSAIC_PROGRAMS.map((p) => [p, mosaicStages(data, p)])) as Record<MosaicProgram, MosaicStage[]>;
    const lang = this.lang;
    const stages = data.stagesPct;

    const root = el('div', 'mosaics');
    const table = el('div', 'table');
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', t(lang, 'mosaicTitle'));
    table.style.setProperty('--sweep', `${SWEEP_MS}ms`);

    const head = el('div', 'head');
    head.setAttribute('role', 'row');
    const corner = el('span', 'label corner', t(lang, 'mosaicTraining'));
    corner.setAttribute('role', 'columnheader');
    head.append(corner);
    for (const p of MOSAIC_PROGRAMS) {
      const h = el('span', 'say program');
      h.setAttribute('role', 'columnheader');
      h.append(...keepCase(t(lang, NAME[p])));
      head.append(h);
    }
    table.append(head);

    const rows = stages.map((pct, k) => {
      const row = el('div', 'stage-row');
      row.setAttribute('role', 'row');
      row.dataset.stage = String(pct);
      const label = el('div', 'stage-label');
      label.setAttribute('role', 'rowheader');
      label.append(el('span', 'shout num pct', pctText(lang, pct)), ' ', el('span', 'of', t(lang, 'mosaicOfTraining')));
      row.append(label);
      for (const p of MOSAIC_PROGRAMS) {
        const stage = all[p][k]!;
        const cell = el('div', 'cell');
        cell.setAttribute('role', 'cell');
        cell.dataset.program = p;
        const svg = mosaicSvg(stage);
        svg.setAttribute('aria-label', `${t(lang, NAME[p])}, ${whenText(lang, stage.gamesTrained)}${colon(lang)} ${winsWords(lang, stage)}.`);
        const count = el('p', 'count num');
        const when = el('span', 'when');
        when.append(...whenNodes(lang, stage.gamesTrained));
        count.append(when, el('span', 'dot', ' · '), el('strong', '', winsWords(lang, stage)));
        cell.append(svg, count);
        row.append(cell);
      }
      table.append(row);
      return row;
    });

    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    /** Shows every stage up to `k`; `say` announces the one just reached. */
    const show = (k: number, say: boolean): void => {
      shownStages(rows.length, k).forEach((on, i) => rows[i]!.toggleAttribute('data-on', on));
      if (!say) return;
      const each = MOSAIC_PROGRAMS.map((p) => `${t(lang, NAME[p])}, ${winsWords(lang, all[p][k]!)}`);
      live.textContent = `${pctText(lang, stages[k]!)}${colon(lang)} ${each.join(lang === 'fr' ? ' ; ' : '; ')}.`;
    };

    const stepper = new Stepper(stages.length, (k) => show(k, true), { signal, interval: SWEEP_INTERVAL });
    const row = transport(stepper, { lang, counter: (i, n) => `${progress(lang, 'step')(i, n)} · ${pctText(lang, stages[i]!)}` });
    show(0, false);
    root.append(el('p', 'say title', t(lang, 'mosaicTitle')), el('p', 'key', t(lang, 'mosaicLegend')), table, row, live);
    this.stage.append(root);
    // Under reduced motion the figure is its last state: the whole mosaic.
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
  }
}
