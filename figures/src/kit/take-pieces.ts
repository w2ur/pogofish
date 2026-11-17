// The page's ONE way to take pieces on a board (round 5, convention 2): choose
// the stack, choose how many pieces, choose where they land. The playable
// board (<pogo-board>) and every figure that lets the reader act on a board
// use this, so a reader who has learnt one board has learnt them all:
//
//   - a tap (or Enter, Space) on a stack that may move lifts it, with the
//     smallest count that can leave it;
//   - the count chooser (« Pièces à soulever : 1 2 3 ») offers the counts that
//     can move, and 1, 2, 3 choose one by key;
//   - a tap on a marked square lands the pieces: the move is played;
//   - a tap on the lifted stack, or Escape, puts it down; a tap on another
//     stack that may move lifts that one instead;
//   - the arrow keys move the board's one tab stop from square to square.
//
// What may be played is the caller's list of moves, never the DOM's: legal()
// on a board that plays the game, or a figure's own list where the reader
// moves pieces freely (each entry: from which square, how many, onto which).
// The decisions are board-state.ts's (tap, chooseCount), which knows no DOM;
// the squares' buttons are board-input.ts's. This module holds the lifted
// stack and keeps the buttons, their names and the count chooser in step.
//
// It draws nothing. The figure draws its board with marks() (kit/board-svg.ts:
// the lifted stack ringed in ink, the squares that could be chosen cornered)
// and lays `grid` over it, in the same positioned box (`.play`), with
// `counts.element` under the board:
//
//   const take = takePieces({ lang, id, state, moves, onPlay, onChange: draw, keys: root });
//   box.append(labelledBoard(drawBoard(state(), { labelRoom: true, marks: take.marks() })), take.grid);
//   under.append(take.counts.element);
//   function draw() { /* redraw the SVG with take.marks() */ }
//   // and, whenever the position changes: draw(); take.sync();
import { boardInput } from '../board-input';
import { chooseCount, counts, describeCell, destinations, origins, tap, type CellMark, type Selection } from '../board-state';
import type { Move, State, Triple } from '../engine';
import type { BoardMark } from './board-svg';
import { choiceGroup, type ChoiceGroup } from './controls';
import { colon, t, type Lang } from './strings';

export type CountValue = '1' | '2' | '3';

export interface TakePiecesOptions {
  lang: Lang;
  /** Id of the count chooser's label, unique within the shadow root. */
  id: string;
  /** The position the reader acts on, for the squares' names. */
  state: () => State;
  /**
   * The moves the reader may play now, read at every tap: legal() where the game is played,
   * a figure's own list elsewhere. Empty while the reader may not act.
   */
  moves: () => readonly Move[];
  /** The reader played `move`. The stack is put down first; the figure redraws. */
  onPlay: (move: Triple) => void;
  /** The lifted stack changed (lifted, another count, put down by the reader): redraw. Never called for a move played. */
  onChange: () => void;
  /**
   * Where 1/2/3 and Escape are heard while a stack is lifted: the figure's root, so they work
   * from the count chooser too. Omit it when the figure hears its own keys (the playable board,
   * whose Escape does more) and calls count() and putDown().
   */
  keys?: HTMLElement;
  /**
   * Whether the stacks that may be lifted are marked while none is (default true, as on the
   * playable board). False on a board that shows the move just played at rest.
   */
  markLiftable?: boolean;
}

export interface TakePieces {
  /** The nine squares' buttons, to lay over the board (`.cells`). */
  grid: HTMLElement;
  /** The nine buttons, indexed by square (a1 = 0). */
  cells: HTMLButtonElement[];
  /** The count chooser (`.counts`): its line is kept, off, while nothing is lifted. */
  counts: ChoiceGroup<CountValue>;
  /** The stack lifted and how many of its pieces, or null. */
  selection(): Selection;
  /** What to draw on the board now: the lifted stack and its landings, or at rest the stacks that may be lifted. */
  marks(): BoardMark[];
  /**
   * Brings the squares' names, the tab stop and the count chooser in step with the position.
   * Done by itself when the lifted stack changes; call it when the position does.
   */
  sync(): void;
  /** Chooses how many pieces of the lifted stack; ignored when that many cannot move. */
  count(n: number): void;
  /** Puts the lifted stack down without calling onChange: the figure is the one asking. */
  putDown(): void;
  /** Focus on the board's tab stop. */
  focus(): void;
}

export function takePieces(o: TakePiecesOptions): TakePieces {
  const { lang } = o;
  let held: Selection = null;

  /** The lifted stack, put down if the position changed under it and it can no longer move. */
  const selection = (): Selection => {
    if (held && !origins(o.moves()).includes(held.from)) held = null;
    return held;
  };
  const set = (next: Selection): void => {
    if (next === held) return;
    held = next;
    sync();
    o.onChange();
  };
  const count = (n: number): void => set(chooseCount(selection(), o.moves(), n));

  const input = boardInput({
    label: t(lang, 'board'),
    onCell: (i) => {
      const r = tap(selection(), o.moves(), i);
      if ('play' in r) {
        held = null;
        o.onPlay(r.play);
        return;
      }
      set(r.selection);
    },
    ...(o.keys ? { keys: o.keys } : {}),
    lifted: () => selection() !== null,
    onCount: count,
    onDrop: () => set(null),
  });

  const chooser = choiceGroup<CountValue>({
    label: `${t(lang, 'pieces')}${colon(lang)}`,
    id: o.id,
    choices: (['1', '2', '3'] as const).map((n) => ({ value: n, label: n })),
    onChoose: (n) => count(Number(n)),
  });
  chooser.element.classList.add('counts');

  const marks = (): BoardMark[] => {
    const sel = selection();
    const moves = o.moves();
    if (sel) return [{ cell: sel.from, kind: 'picked' }, ...destinations(moves, sel.from, sel.count).map((cell) => ({ cell, kind: 'target' as const }))];
    return o.markLiftable === false ? [] : origins(moves).map((cell) => ({ cell, kind: 'target' as const }));
  };

  function sync(): void {
    const sel = selection();
    const moves = o.moves();
    const state = o.state();
    const lift = origins(moves);
    const land = sel ? destinations(moves, sel.from, sel.count) : [];
    input.cells.forEach((b, i) => {
      let mark: CellMark = null;
      if (sel?.from === i) mark = 'selected';
      else if (land.includes(i)) mark = 'target';
      else if (!sel && lift.includes(i)) mark = 'can-lift';
      // With a stack lifted, another stack that may move can still be tapped: it is lifted instead.
      const actionable = mark !== null || lift.includes(i);
      b.setAttribute('aria-label', describeCell(lang, state, i, mark));
      b.toggleAttribute('data-actionable', actionable);
      b.setAttribute('aria-disabled', String(!actionable));
    });
    input.syncFocus();
    const available = sel ? counts(moves, sel.from) : [];
    chooser.element.toggleAttribute('data-off', sel === null);
    chooser.buttons.forEach((b, k) => (b.hidden = !available.includes(k + 1)));
    chooser.set(sel ? (String(sel.count) as CountValue) : null);
  }

  return {
    grid: input.grid,
    cells: input.cells,
    counts: chooser,
    selection,
    marks,
    sync,
    count,
    putDown: () => {
      held = null;
    },
    focus: () => input.focus(),
  };
}
