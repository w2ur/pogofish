// <pogo-encoding>: a position as the nets read it (fig. 17), live. A toy
// (kit/toy.ts): the reader plays on the figure's own board (own-board.ts,
// shared with <pogo-net>: pieces are taken as on every board of the page),
// both colours in turn, legal moves only, and the 127 inputs of features()
// (mover-relative-repetition, crates/infer/src/features.rs) follow at once:
// per cell a row of 14, the 12 slots of the stack bottom to top, the top's
// owner and the height ÷ 12, then the 127th input, the position's earlier
// occurrences ÷ 2.
//
// The encoding is relative to the player to move, and that is its surprise:
// when the turn passes, every piece left in place goes from +1 to −1 or back.
// The figure shows the two effects of a move apart (encoding-diff.ts): an
// input that says something new about the board is marked, and an input that
// is the same piece seen from the other side turns over; the line above the
// grid says whose turn it is and what +1 means now, in the essay's words (« +1
// pour le joueur dont c'est le tour ») and who that player is. A slot that holds a piece
// is drawn in that piece's colour, so a stack on the board and its row read
// alike whoever is to move.
//
// The board and the rows are tied where they are used: a row carries the name
// its square carries on the board, and that name is stamped on the rows of the
// move just played (where it left, where it landed), on the row of a stack
// lifted, and on the row of the square under the pointer or the focus. An
// arrow runs from the board to the grid, and one along the stack's columns
// (bottom to top).
//
// It opens on the essay's own position, the one <pogo-net> shows first
// (net-position.ts). Once, when it first comes on screen, it plays the next
// moves of that game (encoding-demo.ts), the grid following; then it is back
// on the essay's position and the reader's for good: no transport, no replay.
// The game played here is the figure's alone: it never touches the page's
// game, though the reader may bring that game's position in.
import { announceMove } from '../board-state';
import { LC1_2, features, key, play, terminal, winner, type State, type Triple } from '../engine';
import { controlButton } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { colon, t, type Lang } from '../kit/strings';
import { readingMark, toy, type Toy } from '../kit/toy';
import { store, type Store } from '../store';
import { encodingDemo } from './encoding-demo';
import { encodingDiff, pieceColour, type Encoded } from './encoding-diff';
import { CELLS, HEIGHT_DIVISOR, INPUTS, PER_CELL, REPETITION_DIVISOR, SLOTS, encodingRows } from './encoding-rows';
import { inputText } from './input-text';
import { ownBoard } from './own-board';
import encodingCss from './pogo-encoding.css?raw';

export { inputText };

/** The introduction: the essay's position is held this long, in ms. */
export const INTRO_REST = 1400;
/** Then each move it plays: time to see the grid turn over, and what the move changed. */
export const INTRO_MOVE = 2400;

/** « Aux Rouges de jouer : +1 pour le joueur dont c’est le tour, ici les Rouges ; … », in its two parts. */
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
  static override stageMinHeight = '519px';

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
    /** What the grid last drew, to mark what the next position changes. */
    let drawn: Encoded | null = null;
    let tick = 0;
    /** The square under the pointer or the focus, whose row answers. */
    let pointed: number | null = null;
    let play_: Toy | undefined;
    /** The reader acts before the introduction is over (a key, a script): the toy is theirs first. */
    const own = (): void => play_?.skip();

    const root = el('div', 'encoding');
    const now = (): State => plies.at(-1)!.state;

    // The board, the reader's: any move played on it is a new position for the grid.
    const board = ownBoard({
      lang,
      keys: root,
      id: 'encoding-counts-label',
      position: () => plies.at(-1)!,
      // A move is played from a lifted stack, and lifting one has already made the toy the reader's (onTouch).
      onPlay: (m) => {
        show([...plies, { state: play(now(), m), move: m }]);
      },
      onTouch: () => {
        own();
        tie();
      },
    });

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
    // The stack's twelve columns read left to right, bottom to top: the arrow says the way, its words what it runs along.
    const stackHead = cellOf('c-slots', 'columnheader');
    stackHead.append(readingMark('right', t(lang, 'encStack')));
    head.append(cellOf('c-name sr', 'columnheader', t(lang, 'encCell')), stackHead, cellOf('c-top', 'columnheader', t(lang, 'encTop')), cellOf('c-height', 'columnheader', t(lang, 'encHeight')));
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

    /**
     * Ties the rows to the board: the name of a row is stamped when its square is the one
     * lifted, the one under the pointer or the focus, or, at rest, where the move just played
     * left from and where it landed.
     */
    function tie(): void {
      const lifted = board.lifted();
      const move = plies.at(-1)!.move;
      const on = new Set<number>();
      if (lifted !== null) on.add(lifted);
      else if (move) on.add(move[0]).add(move[2]);
      if (pointed !== null) on.add(pointed);
      rows.forEach((r, i) => r.row.classList.toggle('on', on.has(i)));
    }
    const point = (target: EventTarget | null): void => {
      const cell = target instanceof Element ? target.closest<HTMLElement>('.cell-button')?.dataset.cell : undefined;
      const next = cell === undefined ? null : Number(cell);
      if (next === pointed) return;
      pointed = next;
      tie();
    };
    board.board.addEventListener('pointerover', (e) => point(e.target), { signal });
    board.board.addEventListener('pointerleave', () => point(null), { signal });
    board.board.addEventListener('focusin', (e) => point(e.target), { signal });
    board.board.addEventListener('focusout', () => point(null), { signal });

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
      own();
      if (plies.length < 2) return;
      show(plies.slice(0, -1));
    }, true);
    undo.dataset.role = 'undo';
    const reset = controlButton(t(lang, 'encReset'), () => {
      own();
      show([{ state: opening }]);
    }, true);
    reset.dataset.role = 'reset';
    const take = controlButton(t(lang, 'encTake'), () => {
      const mine = deps.store.current()?.states.at(-1);
      if (!mine) return;
      own();
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
      board.drop();
      drawGrid();
      board.draw();
      tie();
      syncActions();
      if (!say) return;
      const last = plies.at(-1)!;
      const before = plies.at(-2)?.state;
      const said = last.move && before ? `${announceMove(lang, before.to_move, last.move)}. ` : '';
      live.textContent = `${said}${turn.textContent}${meaning.textContent}`;
    };

    const actions = el('div', 'controls actions');
    actions.append(undo, reset, take);
    const side = el('div', 'enc-side');
    // From the board to what it becomes: rightwards beside it, downwards under it (pogo-encoding.css turns it).
    const reads = el('div', 'enc-reads');
    reads.append(readingMark('right'));
    const main = el('div', 'enc-main');
    main.append(keyLine, table, repetition);
    const body = el('div', 'enc-body');
    body.append(side, reads, main, actions);
    root.append(body, live);

    show(plies, false);
    const off = deps.store.on('game', syncActions);
    signal.addEventListener('abort', () => void off(), { once: true });
    this.stage.append(root);
    // Under reduced motion nothing plays: the toy rests on the essay's position from the start.
    play_ = toy(this, {
      root,
      invite: t(lang, 'encInvite'),
      intro: {
        steps: demo.states.length,
        interval: (i) => (i === 0 ? INTRO_REST : INTRO_MOVE),
        show: (i) => show(demo.states.slice(0, i + 1).map((state, k) => (k === 0 ? { state } : { state, move: demo.moves[k - 1]! })), false),
      },
      onReady: () => {
        // The reader's board starts where the essay does, with nothing marked as just changed.
        if (plies.length === 1 && key(now()) === key(opening)) return;
        drawn = null;
        show([{ state: opening }], false);
      },
      signal,
    });
    // The invitation stands directly above the board the reader plays on.
    side.append(play_.invite, board.board, board.counts);
  }
}
