// <pogo-encoding>: a position as the nets read it (fig. 17), the 127 inputs
// of features() (mover-relative-repetition, crates/infer/src/features.rs): per
// cell a row of 14, 12 slots of the stack bottom to top, the top's owner and
// the height ÷ 12, then the 127th input, the position's earlier occurrences ÷ 2.
// The position is the one <pogo-net kind="td"> shows (net-position.ts), and
// the figure follows the store as the reader plays. A slot that holds a piece
// is drawn in that piece's colour, so the stack on the board and its row read
// alike; a tap on a cell or on a row's name marks both.
import { boardInput } from '../board-input';
import { features, key, type State } from '../engine';
import { boardLabels } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { PogoFigure } from '../kit/figure';
import { t, type Lang } from '../kit/strings';
import { store, type Store } from '../store';
import { CELLS, HEIGHT_DIVISOR, INPUTS, PER_CELL, REPETITION_DIVISOR, SLOTS, encodingRows } from './encoding-rows';
import encodingCss from './pogo-encoding.css?raw';
import { netPosition, positionWords } from './net-position';
import { el, positionLine } from './net-view';
import netCss from './net.css?raw';

/** An input as the table writes it: « +1 », « −1 », « 0 », « 0,25 ». */
export function inputText(lang: Lang, x: number): string {
  if (x === 0) return '0';
  if (Number.isInteger(x)) return x > 0 ? `+${x}` : `−${-x}`;
  const text = x.toFixed(2).replace(/0$/, '');
  return lang === 'fr' ? text.replace('.', ',') : text;
}

/** The colour of the piece a slot stands for: +1 is the mover's, −1 the opponent's. */
function slotClass(v: number, s: State): string {
  if (v === 0) return 'slot none';
  const mine = v > 0;
  const colour = mine === (s.to_move === 'Red') ? 'red' : 'white';
  return `slot ${colour}`;
}

export class PogoEncoding extends PogoFigure {
  static override styles = netCss + encodingCss;
  static override stageMinHeight = '760px';

  /** The game and the engine; a test swaps it. */
  static deps: { store: Store } = { store };

  protected async render(signal: AbortSignal): Promise<void> {
    const deps = (this.constructor as typeof PogoEncoding).deps;
    await deps.store.ready();
    if (signal.aborted) return;
    const lang = this.lang;

    const root = el('div', 'encoding');
    const where = positionLine(lang);
    const keyLine = el('p', 'note key');
    let selected: number | null = null;
    let state: State | null = null;

    const play = el('div', 'play');
    const input = boardInput({
      label: t(lang, 'board'),
      onCell: (i) => select(i),
      keys: root,
      lifted: () => false,
      onCount: () => {},
      onDrop: () => {},
    });
    // The board's drawing goes first, under the coordinates and the cell buttons (drawSelection).
    play.append(boardLabels(), input.grid);
    const boardBox = el('div', 'board-box');
    boardBox.append(play);

    // The table: a row per cell, written once and filled on each update.
    const wrap = el('div', 'enc-wrap');
    const table = el('div', 'enc-table');
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', t(lang, 'encTable'));
    const cellOf = (className: string, role: string, text = ''): HTMLElement => {
      const c = el('span', className, text);
      c.setAttribute('role', role);
      return c;
    };
    const head = el('div', 'enc-row enc-head');
    head.setAttribute('role', 'row');
    head.append(
      cellOf('label c-name', 'columnheader', t(lang, 'encCell')),
      cellOf('label c-slots', 'columnheader', t(lang, 'encStack')),
      cellOf('label c-top', 'columnheader', t(lang, 'encTop')),
      cellOf('label c-height', 'columnheader', t(lang, 'encHeight')),
    );
    table.append(head);
    const rows = Array.from({ length: CELLS }, (_, i) => {
      const row = el('div', 'enc-row');
      row.setAttribute('role', 'row');
      row.dataset.row = String(i);
      const name = cellOf('c-name', 'rowheader');
      const button = el('button', 'cell-name');
      button.type = 'button';
      button.addEventListener('click', () => select(i));
      name.append(button);
      const slots = el('span', 'c-slots slots');
      const slotCells = Array.from({ length: SLOTS }, () => cellOf('slot num', 'cell'));
      slots.append(...slotCells);
      const top = cellOf('c-top num', 'cell');
      const height = cellOf('c-height num', 'cell');
      row.append(name, slots, top, height);
      table.append(row);
      return { row, button, slotCells, top, height };
    });
    wrap.append(table);

    const repetition = el('p', 'enc-rep');
    repetition.dataset.row = String(CELLS);
    const repValue = el('span', 'rep-value num');
    repetition.append(el('span', 'label rep-name', t(lang, 'encRepetition')), repValue, el('span', 'rep-what', t(lang, 'encRepetitionWhat')));
    const total = el('p', 'note total num', `${CELLS} ${t(lang, 'encCells')} × ${PER_CELL} + 1 = ${INPUTS} ${t(lang, 'encNumbers')}`);

    const body = el('div', 'enc-body');
    const side = el('div', 'enc-table-side');
    side.append(wrap, repetition);
    body.append(boardBox, side);
    root.append(where.element, keyLine, body, total, el('p', 'note pick', t(lang, 'encPick')));

    const drawSelection = (): void => {
      if (!state) return;
      const s = state;
      const svg = drawBoard(s, {
        labelRoom: true,
        marks: selected === null ? [] : [{ cell: selected, kind: 'picked' }],
        title: positionWords(lang, netPosition(deps.store)),
      });
      play.querySelector(':scope > svg')?.remove();
      play.prepend(svg);
      rows.forEach((r, i) => {
        const on = i === selected;
        r.row.classList.toggle('on', on);
        r.button.setAttribute('aria-pressed', String(on));
        input.cells[i]!.setAttribute('aria-pressed', String(on));
      });
    };
    const select = (i: number): void => {
      selected = selected === i ? null : i;
      drawSelection();
    };

    const update = (): void => {
      const p = netPosition(deps.store);
      state = p.state;
      where.update(p);
      root.dataset.position = key(p.state);
      const encoding = encodingRows(features(p.state));
      keyLine.textContent = t(lang, p.state.to_move === 'Red' ? 'encKeyRed' : 'encKeyWhite');
      encoding.cells.forEach((c, i) => {
        const r = rows[i]!;
        r.button.textContent = c.name;
        input.cells[i]!.setAttribute('aria-label', `${t(lang, 'encCell')} ${c.name}`);
        c.slots.forEach((v, k) => {
          const slot = r.slotCells[k]!;
          slot.className = `${slotClass(v, p.state)} num`;
          slot.textContent = inputText(lang, v);
        });
        r.top.textContent = inputText(lang, c.top);
        r.height.textContent = inputText(lang, c.height);
        r.height.title = `${Math.round(c.height * HEIGHT_DIVISOR)} ÷ ${HEIGHT_DIVISOR}`;
      });
      repValue.textContent = inputText(lang, encoding.repetition);
      repValue.title = `${Math.round(encoding.repetition * REPETITION_DIVISOR)} ÷ ${REPETITION_DIVISOR}`;
      drawSelection();
    };
    update();
    const off = deps.store.on('game', update);
    signal.addEventListener('abort', () => void off(), { once: true });
    this.stage.append(root);
  }
}
