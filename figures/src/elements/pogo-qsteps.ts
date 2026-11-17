// <pogo-qsteps>: tabular Q-learning on a real ending (q-steps.ts), shown as
// cause and effect. The position the program is in, its possible moves and
// their values, the essay's formula with these very numbers, and the notebook:
// one row per position, one column per game. The first update that changes a
// note of each kind of position is played slowly, in the essay's five
// sub-steps: a note read in the notebook travels to its move and changes sign
// on the way, the best value is kept, the formula is written, and the result
// travels into the notebook. Game after game the non-zero note reaches one
// position further back: the notebook's columns keep every game, so the wave
// is seen at rest too.
import { WASM_FILE, assetUrl } from '../assets';
import type { Colour } from '../engine';
import { ready } from '../engine';
import { autoplay } from '../kit/autoplay';
import { labelledBoard } from '../kit/board-labels';
import { animateMove, drawBoard } from '../kit/board-svg';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { MOVE_TEMPO_MS } from '../kit/tempo';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { fly } from './motion';
import qstepsCss from './pogo-qsteps.css?raw';
import {
  ALPHA,
  QSTEPS_GAMES,
  moveGroups,
  notebookColumns,
  notesAt,
  noteText,
  qScript,
  qSteps,
  signedNote,
  type MoveGroup,
  type QPhase,
  type QStep,
  type QWalk,
} from './q-steps';
import replayCss from './replay.css?raw';
import { colourKey, resultWords } from './replay-view';

/** How long a step read for the first time is held; a step of a game the reader already knows is a move, at the kit's one tempo. */
export const SLOW_MS = 2800;

const colourName = (lang: Lang, c: Colour): string => t(lang, colourKey(c));
const pct = (lang: Lang, x: number): string => `${Math.round(x * 100)}${lang === 'fr' ? '\u202f' : ''}%`;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const PHASE_AT: Record<QPhase, number> = { look: 0, value: 1, best: 2, formula: 3, write: 4 };

export interface QWords {
  /** « Partie 3 sur 5 », or « Avant la première partie ». */
  game: string;
  /** The line so far, its last item the position shown. */
  path: string[];
  text: string;
  /** « partie 3 sur 5 · étape 2 sur 8 » */
  counter: string;
}

/** The words of one step of the script, in `lang`. */
export function qWords(lang: Lang, walk: QWalk, step: QStep, last: boolean): QWords {
  const f = walk.frames[step.frame]!;
  const of = t(lang, 'outOf');
  const gameOf = `${t(lang, 'qGame')} ${f.game} ${of} ${QSTEPS_GAMES}`;
  const game = f.game === 0 ? capital(t(lang, 'qBefore')) : capital(gameOf);
  const counter = f.game === 0 ? t(lang, 'qBefore') : `${gameOf}\u00a0· ${t(lang, 'progressStep')} ${step.at} ${of} ${step.of}`;
  const path = f.path.map((p) => (p === 'end' ? t(lang, 'qEnd') : p));
  const say = (text: string): QWords => ({ game, path, text, counter });
  if (f.kind === 'blank') return say(t(lang, 'qBlank'));
  if (f.kind === 'end') {
    const { who } = resultWords(lang, { winner: f.winner === 'White' ? 'W' : 'R', byRepetition: false });
    return say(`${who}. ${t(lang, last ? 'qSpread' : 'qNextGame')}`);
  }
  const u = f.update!;
  const me = colourName(lang, u.mover);
  const c = colon(lang);
  const moved = `${u.name} ${t(lang, 'qGoesFrom')} ${noteText(lang, u.before)} ${t(lang, 'qGoesTo')} ${noteText(lang, u.after)}`;
  switch (step.phase) {
    case 'look':
      return say(`${t(lang, 'qIsAt')} ${u.name}, ${me} ${t(lang, 'toMove')}. ${t(lang, 'qLooks')}`);
    case 'value':
      return say(t(lang, moveGroups(u).some((g) => g.kind === 'to') ? 'qValueRead' : 'qValueWin'));
    case 'best':
      return say(`${t(lang, 'qKeep')}${c} ${signedNote(lang, u.best)}.`);
    case 'formula':
      return say(`${t(lang, 'qCompute')} ${u.name}.`);
    case 'write':
      return say(`${t(lang, 'qWrite')}${c} ${moved}. ${t(lang, 'qThenPlays')}`);
    default: {
      const note = u.after === u.before ? `${u.name} ${t(lang, 'qStays')} ${noteText(lang, u.before)}` : moved;
      return say(`${t(lang, 'qAt')} ${u.name}, ${me} ${t(lang, 'toMove')}${c} ${t(lang, 'qBestIs')} ${signedNote(lang, u.best)}, ${t(lang, 'qNoteOf')} ${note}.`);
    }
  }
}

/** « vers C1 », « 2 coups qui gagnent la partie », « 21 autres coups, vers des positions notées 0 ». */
export function groupWords(lang: Lang, g: MoveGroup): string {
  if (g.kind === 'to') return `${t(lang, 'qTowards')} ${g.to}`;
  const keys: Record<'win' | 'lose' | 'unseen', [StringKey, StringKey]> = {
    win: ['qWinMove', 'qWinMoves'],
    lose: ['qLoseMove', 'qLoseMoves'],
    unseen: ['qOtherMove', 'qOtherMoves'],
  };
  return `${g.count} ${t(lang, keys[g.kind][g.count > 1 ? 1 : 0])}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** The most rows a list of moves takes, so the figure keeps their room. */
const MOVE_ROWS = 3;

export class PogoQsteps extends PogoFigure {
  static override styles = replayCss + qstepsCss;
  static override stageMinHeight = '0px';

  /** The engine; a test swaps it. */
  static deps: { engine: () => Promise<void> } = { engine: () => ready(assetUrl(WASM_FILE)) };

  protected async render(signal: AbortSignal): Promise<void> {
    await (this.constructor as typeof PogoQsteps).deps.engine();
    if (signal.aborted) return;
    const lang = this.lang;
    const walk = qSteps();
    const { frames, rows } = walk;
    const script = qScript(walk);
    const columns = notebookColumns(walk);
    const words = script.map((s, i) => qWords(lang, walk, s, i === script.length - 1));

    const root = el('div', 'qsteps');

    // The words of every step in one grid cell: the figure below never moves.
    const status = el('div', 'status');
    status.setAttribute('aria-hidden', 'true');
    const blocks = words.map((w) => {
      const block = el('div', 'said');
      const head = el('p', 'where');
      head.append(el('span', 'say', w.game), ' · ');
      w.path.forEach((p, i) => {
        if (i > 0) head.append(' → ');
        head.append(i === w.path.length - 1 ? el('span', 'here', p) : p);
      });
      block.append(head, el('p', 'move', w.text));
      status.append(block);
      return block;
    });
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    const slot = el('div', 'board-slot');

    // The possible moves and their values.
    const moves = el('div', 'moves');
    moves.setAttribute('aria-hidden', 'true');
    const list = el('ul', 'move-list');
    const moveRows = Array.from({ length: MOVE_ROWS }, () => {
      const li = el('li', 'move-row');
      const what = el('span', 'what');
      const value = el('span', 'val num');
      li.append(what, value);
      list.append(li);
      return { li, what, value };
    });
    moves.append(el('p', 'say', t(lang, 'qMovesTitle')), list);

    // The essay's formula, its numbers under its words.
    const formula = el('div', 'formula');
    formula.setAttribute('aria-hidden', 'true');
    // A term and the sign after it stay together when the formula wraps.
    const term = (key: StringKey, sign: string): HTMLElement => {
      const group = el('span', 'group');
      const box = el('span', 'term');
      const n = el('span', 'n num');
      box.append(n, el('span', 'name', t(lang, key)));
      group.append(box, el('span', 'op num', sign));
      formula.append(group);
      return n;
    };
    const after = term('qNew', '=');
    const before = term('qOld', `+ ${pct(lang, ALPHA)} × (`);
    const best = term('qBest', '−');
    const again = term('qOld', ')');
    const slots = { after, before, best, again };

    // The notebook: a row per position, a column per game.
    const table = el('table', 'notebook num');
    table.append(el('caption', '', t(lang, 'qNotebook')));
    // Two head rows: « départ », then « après la partie » over the games' numbers.
    const headRow = el('tr');
    const numbers = el('tr');
    const corner = el('th', 'col corner');
    corner.append(el('span', 'word', t(lang, 'qRow')));
    corner.scope = 'col';
    corner.rowSpan = 2;
    // The name column keeps its width; the games share the rest equally.
    const colgroup = el('colgroup');
    colgroup.append(el('col', 'name-col'), ...columns.map(() => el('col')));
    table.append(colgroup);
    const over = el('th', 'col over', t(lang, 'qAfterGame'));
    over.scope = 'colgroup';
    over.colSpan = columns.length - 1;
    headRow.append(corner);
    const heads = columns.map((_, g) => {
      const th = el('th', 'col game', g === 0 ? t(lang, 'qColStart') : String(g));
      th.scope = 'col';
      if (g === 0) th.rowSpan = 2;
      (g === 0 ? headRow : numbers).append(th);
      return th;
    });
    headRow.append(over);
    const thead = el('thead');
    thead.append(headRow, numbers);
    const tbody = el('tbody');
    const cells = new Map<string, { name: HTMLTableCellElement; values: HTMLTableCellElement[] }>();
    for (const r of rows) {
      const tr = el('tr');
      const name = el('th', 'name', r);
      name.scope = 'row';
      const values = columns.map(() => el('td', 'value'));
      tr.append(name, ...values);
      tbody.append(tr);
      cells.set(r, { name, values });
    }
    table.append(thead, tbody);
    const book = el('div', 'book');
    book.append(table);

    const body = el('div', 'body');
    body.append(slot, moves, book, formula);

    let landings: (() => void)[] = [];
    let svg: SVGSVGElement | undefined;
    let shown = -1;

    const show = (i: number): void => {
      for (const land of landings) land();
      landings = [];
      const step = script[i]!;
      const f = frames[step.frame]!;
      const w = words[i]!;
      // The end of a game keeps the update that won it in view: only the board and the words change.
      const u = f.update ?? (f.kind === 'end' ? frames[step.frame - 1]!.update : undefined);
      const at = step.phase === null ? 4 : PHASE_AT[step.phase];
      const forward = i === shown + 1 && !this.reducedMotion();
      const said = `${w.game}, ${w.path.at(-1)}. ${w.text}`;
      blocks.forEach((b, k) => b.toggleAttribute('data-off', k !== i));
      live.textContent = said;

      // The board: the position the program is in, with the move that led to it.
      const previous = step.frame > 0 ? frames[step.frame - 1]! : undefined;
      const arrived = previous && previous.game === f.game ? previous.move : undefined;
      const changed = shown < 0 || script[shown]!.frame !== step.frame;
      if (changed) {
        const next = drawBoard(f.state, { labelRoom: true, title: said, ...(arrived ? { from: arrived[0], to: arrived[2], moving: arrived[1] } : {}) });
        const before = svg;
        slot.replaceChildren(labelledBoard(next));
        svg = next;
        if (before && arrived && forward) animateMove(before, next, arrived);
      }

      // The notebook as it stands: past games, the game under way, nothing after it.
      const now = notesAt(walk, step);
      heads.forEach((h, g) => h.classList.toggle('live', g === f.game));
      for (const r of rows) {
        const c = cells.get(r)!;
        c.name.classList.toggle('here', u?.name === r);
        c.values.forEach((td, g) => {
          const v = g < f.game ? columns[g]![r]! : g === f.game ? now[r]! : null;
          td.textContent = v === null ? '' : noteText(lang, v);
          td.className = `value${v === null ? ' later' : v === 0 ? ' zero' : ' set'}${g === f.game ? ' live' : ''}`;
        });
      }
      const liveCell = (r: string): HTMLTableCellElement => cells.get(r)!.values[f.game]!;

      // The moves, their values once given, the best once kept.
      const groups = u ? moveGroups(u) : [];
      moveRows.forEach(({ li, what, value }, k) => {
        const g = groups[k];
        li.toggleAttribute('data-off', !g);
        li.className = 'move-row';
        value.style.visibility = '';
        if (!g) return;
        what.textContent = groupWords(lang, g);
        value.textContent = at >= 1 ? signedNote(lang, g.q) : '';
        value.classList.toggle('empty', at < 1);
        if (at >= 2) li.classList.add(g.q === u!.best + 0 ? 'best' : 'dim');
        if (step.phase === 'value' && g.kind === 'to') {
          const read = liveCell(g.to!);
          read.classList.add('read');
          if (forward) {
            value.style.visibility = 'hidden';
            landings.push(
              fly({
                layer: root,
                from: read,
                to: value,
                text: noteText(lang, now[g.to!]!),
                flip: signedNote(lang, g.q),
                delay: 500 + 900 * k,
                onLand: () => (value.style.visibility = ''),
              }),
            );
          }
        }
      });

      // The formula: its numbers once it is written.
      const written = u !== undefined && at >= 3;
      formula.classList.toggle('blank', !written);
      slots.after.textContent = written ? noteText(lang, u.after) : '';
      slots.before.textContent = written ? noteText(lang, u.before) : '';
      slots.best.textContent = written ? noteText(lang, u.best) : '';
      slots.again.textContent = written ? (u.before < -0.0005 ? `(${noteText(lang, u.before)})` : noteText(lang, u.before)) : '';
      slots.after.classList.toggle('result', written);

      // The result written in the notebook: the row changes, and on a slow step the number travels there.
      if (u && at >= 4 && u.after !== u.before) {
        const cell = liveCell(u.name);
        cell.classList.add('wrote');
        if (step.phase === 'write' && forward) {
          cell.textContent = noteText(lang, u.before);
          cell.classList.remove('wrote');
          landings.push(
            fly({
              layer: root,
              from: slots.after,
              to: cell,
              text: noteText(lang, u.after),
              delay: 500,
              onLand: () => {
                cell.textContent = noteText(lang, u.after);
                cell.classList.add('wrote');
                cell.classList.replace('zero', 'set');
              },
            }),
          );
        }
      }
      shown = i;
    };

    const stepper = new Stepper(script.length, show, { signal, interval: (i) => (script[i]!.slow ? SLOW_MS : MOVE_TEMPO_MS) });
    signal.addEventListener('abort', () => landings.forEach((land) => land()), { once: true });
    const row = transport(stepper, { lang, counter: (i) => words[i]!.counter });
    show(0);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
    root.append(status, body, row, live);
    this.stage.append(root);
  }
}
