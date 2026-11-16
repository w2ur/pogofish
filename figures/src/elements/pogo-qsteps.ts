// <pogo-qsteps>: tabular Q-learning, one update per step (q-steps.ts, the walk
// of tools/article-visuals/qsteps.mjs). Each step names the position updated
// and its place on the line A → B → C → the win, lists the values of its
// moves, writes the essay's formula with the numbers in it, and shows the
// notebook with the row it changed. The board shows the position updated with
// the move then played from it (its origin ringed, its destination framed).
import { WASM_FILE, assetUrl } from '../assets';
import type { Colour } from '../engine';
import { ready } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang } from '../kit/strings';
import qstepsCss from './pogo-qsteps.css?raw';
import { ALPHA, QSTEPS_GAMES, noteText, qSteps, signedNote, type QFrame, type QWalk } from './q-steps';
import replayCss from './replay.css?raw';
import { colourKey, resultWords } from './replay-view';

const colourName = (lang: Lang, c: Colour): string => t(lang, colourKey(c));
const semi = (lang: Lang): string => (lang === 'fr' ? ' ;' : ';');
const pct = (lang: Lang, x: number): string => `${Math.round(x * 100)}${lang === 'fr' ? ' ' : ''}%`;

export interface QWords {
  /** « Partie 4 » and the path so far, its last item the position shown. */
  game: string;
  path: string[];
  text: string;
  calc: string;
}

/** The words of one step, in `lang`. */
export function qWords(lang: Lang, f: QFrame, last: boolean): QWords {
  const game = f.game === 0 ? t(lang, 'qBefore') : `${t(lang, 'qGame')} ${f.game}`;
  const path = f.path.map((p) => (p === 'end' ? t(lang, 'qEnd') : p));
  if (f.kind === 'blank') return { game, path, text: t(lang, 'qBlank'), calc: '' };
  if (f.kind === 'end') {
    const { who } = resultWords(lang, { winner: f.winner === 'White' ? 'W' : 'R', byRepetition: false });
    return { game, path, text: `${who}. ${t(lang, last ? 'qLastGame' : 'qNextGame')}`, calc: '' };
  }
  const u = f.update!;
  const me = colourName(lang, u.mover);
  const c = colon(lang);
  let how: string;
  if (u.candidates.some((x) => x.ends && x.q === 1)) {
    how = t(lang, 'qWinNow');
  } else {
    const known = u.candidates.filter((x) => x.to !== null);
    const unknown = u.candidates.length - known.length;
    const parts = known.map((x) => `${t(lang, 'qTowards')} ${x.to}, ${signedNote(lang, x.q)}`);
    if (unknown) parts.push(`${unknown} ${t(lang, unknown > 1 ? 'qOthers' : 'qOther')}, ${t(lang, 'qUnseen')}, 0`);
    how = `${t(lang, 'qMoves')}${c} ${parts.join(`${semi(lang)} `)}.`;
  }
  const text = `${t(lang, 'qAt')} ${u.name}, ${me} ${t(lang, 'toMove')}. ${how} ${t(lang, 'qBestFor')} ${me}${c} ${signedNote(lang, u.best)}.`;
  const before = u.before < -0.0005 ? `(${noteText(lang, u.before)})` : noteText(lang, u.before);
  const calc = `${t(lang, 'qNoteOf')} ${u.name}${c} ${noteText(lang, u.before)} + ${pct(lang, ALPHA)} × (${noteText(lang, u.best)} − ${before}) = ${noteText(lang, u.after)}`;
  return { game, path, text, calc };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** One step's words as a block: the game and path, the text, the formula. */
function wordsBlock(w: QWords): HTMLElement {
  const block = el('div', 'said');
  const head = el('p', 'where');
  head.append(`${w.game} · `);
  w.path.forEach((p, i) => {
    if (i > 0) head.append(' → ');
    head.append(i === w.path.length - 1 ? el('span', 'here', p) : p);
  });
  block.append(head, el('p', 'move', w.text), el('p', 'calc num', w.calc || ' '));
  return block;
}

export class PogoQsteps extends PogoFigure {
  static override fidelity = 'live' as const;
  static override game = 'gameLc12' as const;
  static override styles = replayCss + qstepsCss;
  static override stageMinHeight = '520px';

  /** The engine; a test swaps it. */
  static deps: { engine: () => Promise<void> } = { engine: () => ready(assetUrl(WASM_FILE)) };

  /** What the walk is: an endgame replayed for the illustration, not the program's training. */
  protected override precisions(): string[] {
    const lang = this.lang;
    return [`${t(lang, 'qstepsReplay')} ${QSTEPS_GAMES} ${t(lang, 'qstepsReplayAfter')}`, t(lang, 'qstepsFrom')];
  }

  protected async render(signal: AbortSignal): Promise<void> {
    await (this.constructor as typeof PogoQsteps).deps.engine();
    if (signal.aborted) return;
    const lang = this.lang;
    const walk: QWalk = qSteps();
    const { frames, rows } = walk;
    const lastEnd = frames.length - 1;
    const words = frames.map((f, i) => qWords(lang, f, i === lastEnd));

    const root = el('div', 'qsteps');
    const status = el('div', 'status');
    status.setAttribute('aria-hidden', 'true');
    const blocks = words.map(wordsBlock);
    status.append(...blocks);
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    const slot = el('div', 'board-slot');
    const table = el('table', 'notebook num');
    table.append(el('caption', 'say', t(lang, 'qNotebook')));
    const headRow = el('tr', '');
    headRow.append(el('th', 'label col', t(lang, 'qRow')), el('th', 'label col value', t(lang, 'qValue')));
    const thead = el('thead', '');
    thead.append(headRow);
    const tbody = el('tbody', '');
    const cells = new Map<string, { row: HTMLTableRowElement; value: HTMLTableCellElement }>();
    for (const r of rows) {
      const row = el('tr', '');
      const name = el('th', 'name', r);
      name.setAttribute('scope', 'row');
      const value = el('td', 'value');
      row.append(name, value);
      tbody.append(row);
      cells.set(r, { row, value });
    }
    table.append(thead, tbody);
    // The transport sits right under the board it steps; the notebook beside them, or under them.
    const boardCol = el('div', 'board-col');
    const body = el('div', 'body');

    const show = (i: number): void => {
      const f = frames[i]!;
      const w = words[i]!;
      blocks.forEach((b, k) => b.toggleAttribute('data-off', k !== i));
      for (const r of rows) {
        const c = cells.get(r)!;
        c.value.textContent = noteText(lang, f.notes[r]!);
        c.row.classList.toggle('on', r === f.changed);
      }
      const said = [`${w.game}, ${w.path.at(-1)}.`, w.text, w.calc].filter(Boolean).join(' ');
      live.textContent = said;
      slot.replaceChildren(
        labelledBoard(
          drawBoard(f.state, {
            labelRoom: true,
            title: said,
            ...(f.move ? { from: f.move[0], to: f.move[2] } : {}),
          }),
        ),
      );
    };

    const stepper = new Stepper(frames.length, show, { signal, interval: 1600 });
    const row = transport(stepper, { lang, counter: (i, n) => `${i} / ${n - 1}` });
    show(0);
    boardCol.append(slot, row);
    body.append(boardCol, table);
    root.append(status, body, live);
    this.stage.append(root);
  }
}
