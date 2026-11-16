// <pogo-encoding>: a position as the nets read it (fig. 17), live. The reader
// plays on the figure's own board, both colours in turn, legal moves only
// (board-state.ts decides, as on every board of the page), and the 127 inputs
// of features() (mover-relative-repetition, crates/infer/src/features.rs)
// follow at once: per cell a row of 14, the 12 slots of the stack bottom to
// top, the top's owner and the height ÷ 12, then the 127th input, the
// position's earlier occurrences ÷ 2.
//
// The encoding is relative to the player to move, and that is its surprise:
// when the turn passes, every piece left in place goes from +1 to −1 or back.
// The figure shows the two effects of a move apart (encoding-diff.ts): an
// input that says something new about the board is marked, and an input that
// is the same piece seen from the other side turns over; the line above the
// grid says whose turn it is and what +1 means now. A slot that holds a piece
// is drawn in that piece's colour, so a stack on the board and its row read
// alike whoever is to move.
//
// It opens on the essay's own position, the one <pogo-net> shows first
// (net-position.ts), and plays a short demonstration by itself on first view
// (encoding-demo.ts): the next moves of that game, the grid following. The
// reader's first touch stops the demonstration for good; its own controls
// replay it on request. The game played here is the figure's alone: it never
// touches the page's game, though the reader may bring that game's position in.
import { boardInput } from '../board-input';
import { announceMove, chooseCount, counts, describeCell, destinations, origins, tap, type Selection } from '../board-state';
import { LC1_2, features, key, legal, play, terminal, winner, type Move, type State, type Triple } from '../engine';
import { autoplay } from '../kit/autoplay';
import { boardLabels } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { choiceGroup, controlButton, progress, transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang } from '../kit/strings';
import { store, type Store } from '../store';
import { encodingDemo } from './encoding-demo';
import { encodingDiff, pieceColour, type Encoded } from './encoding-diff';
import { CELLS, HEIGHT_DIVISOR, INPUTS, PER_CELL, REPETITION_DIVISOR, SLOTS, encodingRows } from './encoding-rows';
import { inputText } from './input-text';
import encodingCss from './pogo-encoding.css?raw';

export { inputText };

/** Milliseconds a position of the demonstration is held: time to see the grid turn over and read it. */
export const DEMO_INTERVAL = 2800;

type CountValue = '1' | '2' | '3';

/** « Aux Rouges de jouer : +1 = pièce rouge, −1 = pièce blanche, 0 = pas de pièce. », in its two parts. */
export function keyWords(lang: Lang, s: State): { turn: string; meaning: string } {
  const red = s.to_move === 'Red';
  return { turn: t(lang, red ? 'encTurnRed' : 'encTurnWhite'), meaning: `${t(lang, red ? 'encKeyRed' : 'encKeyWhite')}.` };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** One position of the figure's own game, and the move that led to it. */
interface Ply {
  state: State;
  move?: Triple;
}

export class PogoEncoding extends PogoFigure {
  static override styles = encodingCss;
  /** A floor only: pogo-encoding.css keeps the measured room, by width. */
  static override stageMinHeight = '543px';

  /** The page's game and the engine; a test swaps it. */
  static deps: { store: Store } = { store };

  protected async render(signal: AbortSignal): Promise<void> {
    const deps = (this.constructor as typeof PogoEncoding).deps;
    await deps.store.ready();
    if (signal.aborted) return;
    const lang = this.lang;
    const demo = encodingDemo();
    const opening = demo.states[0]!;

    /** The figure's own game: the position shown is its last. */
    let plies: Ply[] = [{ state: opening }];
    let selection: Selection = null;
    /** What the grid last drew, to mark what the next position changes. */
    let drawn: Encoded | null = null;
    /** The reader has left the demonstration: the board is theirs. */
    let offDemo = false;
    let tick = 0;

    const root = el('div', 'encoding');
    const now = (): State => plies.at(-1)!.state;
    const moves = (): Move[] => (terminal(now(), LC1_2) ? [] : legal(now()));

    // The board, the reader's.
    const playBox = el('div', 'play');
    const input = boardInput({
      label: t(lang, 'board'),
      onCell: (i) => onCell(i),
      keys: root,
      lifted: () => selection !== null,
      onCount: (n) => {
        selection = chooseCount(selection, moves(), n);
        drawBoardPart();
      },
      onDrop: () => {
        selection = null;
        drawBoardPart();
      },
    });
    playBox.append(boardLabels(), input.grid);
    const count = choiceGroup<CountValue>({
      label: `${t(lang, 'pieces')}${colon(lang)}`,
      id: 'encoding-counts-label',
      choices: (['1', '2', '3'] as const).map((n) => ({ value: n, label: n })),
      onChoose: (n) => {
        selection = chooseCount(selection, moves(), Number(n));
        drawBoardPart();
      },
    });
    count.element.classList.add('counts');

    // The grid: a row per cell, built once and filled on each position.
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
      cellOf('c-name sr', 'columnheader', t(lang, 'encCell')),
      cellOf('c-slots', 'columnheader', t(lang, 'encStack')),
      cellOf('c-top', 'columnheader', t(lang, 'encTop')),
      cellOf('c-height', 'columnheader', t(lang, 'encHeight')),
    );
    table.append(head);
    /** The 127 cells of the grid, by input. */
    const inputs: HTMLElement[] = [];
    const rows = Array.from({ length: CELLS }, (_, i) => {
      const row = el('div', 'enc-row');
      row.setAttribute('role', 'row');
      row.dataset.row = String(i);
      const name = cellOf('c-name num', 'rowheader');
      row.append(name);
      for (let k = 0; k < PER_CELL; k++) {
        const c = cellOf(k < SLOTS ? 'v slot num' : k === SLOTS ? 'v top num' : 'v height num', 'cell');
        c.dataset.input = String(i * PER_CELL + k);
        // The turn-over runs across the row, slot after slot.
        c.style.setProperty('--k', String(k));
        inputs.push(c);
        row.append(c);
      }
      table.append(row);
      return { row, name };
    });
    const wrap = el('div', 'enc-wrap');
    wrap.append(table);

    const repetition = el('p', 'enc-rep');
    const repValue = el('span', 'v rep-value num');
    repValue.dataset.input = String(INPUTS - 1);
    inputs.push(repValue);
    repetition.append(el('span', 'rep-name num', `${INPUTS}${t(lang, 'encNth')}`), repValue, el('span', 'rep-what', t(lang, 'encRepetitionWhat')));

    const keyLine = el('p', 'key');
    const turn = el('strong', 'turn');
    const meaning = el('span', 'meaning');
    keyLine.append(turn, meaning);

    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    const drawBoardPart = (): void => {
      const s = now();
      const legalMoves = moves();
      const lift = origins(legalMoves);
      const land = selection ? destinations(legalMoves, selection.from, selection.count) : [];
      const last = plies.at(-1)!.move;
      const marks = selection
        ? [{ cell: selection.from, kind: 'picked' as const }, ...land.map((cell) => ({ cell, kind: 'target' as const }))]
        : lift.map((cell) => ({ cell, kind: 'target' as const }));
      const svg = drawBoard(s, {
        labelRoom: true,
        marks,
        // The move just played keeps its frame until a stack is lifted.
        ...(last && !selection ? { to: last[2], moving: last[1] } : {}),
      });
      playBox.querySelector(':scope > svg')?.remove();
      playBox.prepend(svg);
      input.cells.forEach((b, i) => {
        const mark = selection?.from === i ? 'selected' : land.includes(i) ? 'target' : !selection && lift.includes(i) ? 'can-lift' : null;
        const actionable = mark !== null || lift.includes(i);
        b.setAttribute('aria-label', describeCell(lang, s, i, mark));
        b.toggleAttribute('data-actionable', actionable);
        b.setAttribute('aria-disabled', String(!actionable));
      });
      input.syncFocus();
      const available = selection ? counts(legalMoves, selection.from) : [];
      count.element.toggleAttribute('data-off', selection === null);
      count.buttons.forEach((b, k) => (b.hidden = !available.includes(k + 1)));
      count.set(selection ? (String(selection.count) as CountValue) : null);
      // The lifted stack's row answers on the grid.
      rows.forEach((r, i) => r.row.classList.toggle('on', selection?.from === i));
    };

    /** Fills the grid for the position shown, and marks what it changes from the one drawn before. */
    const drawGrid = (): void => {
      const s = now();
      const x = features(s);
      const next: Encoded = { x, toMove: s.to_move };
      const changes = drawn ? encodingDiff(drawn, next) : null;
      const turned = drawn !== null && drawn.toMove !== s.to_move;
      const encoding = encodingRows(x);
      encoding.cells.forEach((c, i) => {
        rows[i]!.name.textContent = c.name;
        [...c.slots, c.top, c.height].forEach((v, k) => {
          const cell = inputs[i * PER_CELL + k]!;
          cell.textContent = inputText(lang, v);
          if (k <= SLOTS) cell.dataset.piece = pieceColour(v, s.to_move)?.toLowerCase() ?? 'none';
          else cell.title = `${Math.round(v * HEIGHT_DIVISOR)} ÷ ${HEIGHT_DIVISOR}`;
        });
      });
      repValue.textContent = inputText(lang, encoding.repetition);
      repValue.title = `${Math.round(encoding.repetition * REPETITION_DIVISOR)} ÷ ${REPETITION_DIVISOR}`;
      inputs.forEach((cell, i) => {
        const change = changes?.[i] ?? 'same';
        if (change === 'same') delete cell.dataset.change;
        else cell.dataset.change = change;
      });
      // A new tick restarts the marks' animations without a layout read (two keyframes of one drawing).
      if (changes) tick = 1 - tick;
      root.dataset.tick = String(tick);
      root.dataset.position = key(s);
      const over = terminal(s, LC1_2);
      const words = keyWords(lang, s);
      const won = winner(s, LC1_2);
      turn.textContent = over && won ? `${t(lang, 'encOver')}${colon(lang)} ${t(lang, won === 'W' ? 'white' : 'red')} ${t(lang, 'wins')}` : words.turn;
      meaning.textContent = over && won ? '.' : `${colon(lang)} ${words.meaning}`;
      keyLine.toggleAttribute('data-turned', turned && !over);
      drawn = next;
    };

    const undo = controlButton(t(lang, 'encUndo'), () => {
      touch();
      if (plies.length < 2) return;
      show(plies.slice(0, -1));
    }, true);
    undo.dataset.role = 'undo';
    const reset = controlButton(t(lang, 'encReset'), () => {
      touch();
      show([{ state: opening }]);
    }, true);
    reset.dataset.role = 'reset';
    const take = controlButton(t(lang, 'encTake'), () => {
      const mine = deps.store.current()?.states.at(-1);
      if (!mine) return;
      touch();
      show([{ state: mine }]);
    }, true);
    take.dataset.role = 'take';
    const syncActions = (): void => {
      undo.disabled = plies.length < 2;
      reset.disabled = plies.length === 1 && key(now()) === key(opening);
      take.hidden = !deps.store.current()?.states.length;
    };

    /** Shows a new game line: its last position on the board and in the grid. */
    const show = (next: Ply[], say = true): void => {
      plies = next;
      selection = null;
      drawGrid();
      drawBoardPart();
      syncActions();
      if (!say) return;
      const last = plies.at(-1)!;
      const before = plies.at(-2)?.state;
      const said = last.move && before ? `${announceMove(lang, before.to_move, last.move)}. ` : '';
      live.textContent = `${said}${turn.textContent}${meaning.textContent}`;
    };

    // The demonstration: the essay's position, then the next moves of its game.
    const stepper = new Stepper(
      demo.states.length,
      (i) => {
        offDemo = false;
        show(demo.states.slice(0, i + 1).map((state, k) => (k === 0 ? { state } : { state, move: demo.moves[k - 1]! })));
      },
      { signal, interval: DEMO_INTERVAL },
    );
    const count_ = progress(lang, 'move', true);
    const demoRow = transport(stepper, { lang, counter: (i, n) => (offDemo ? t(lang, 'yourTurn') : count_(i, n)) });
    demoRow.classList.add('demo');
    /** The reader took the board: the demonstration stops, and never starts again by itself. */
    function touch(): void {
      offDemo = true;
      stepper.pauseByReader();
    }

    function onCell(i: number): void {
      const r = tap(selection, moves(), i);
      if ('play' in r) {
        touch();
        show([...plies, { state: play(now(), r.play), move: r.play }]);
        return;
      }
      if (r.selection !== selection) touch();
      selection = r.selection;
      drawBoardPart();
    }

    const actions = el('div', 'controls actions');
    actions.append(undo, reset, take);
    const side = el('div', 'enc-side');
    side.append(playBox, count.element, demoRow, actions);
    const main = el('div', 'enc-main');
    main.append(keyLine, wrap, repetition);
    const body = el('div', 'enc-body');
    body.append(side, main);
    root.append(body, live);

    show(plies, false);
    const off = deps.store.on('game', syncActions);
    signal.addEventListener('abort', () => void off(), { once: true });
    this.stage.append(root);
    // Under reduced motion the figure rests on the essay's position: nothing to do.
    autoplay(this, stepper, { signal });
  }
}
