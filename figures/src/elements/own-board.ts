// The board a figure lends the reader when it maps a position to something
// (pogo-encoding, pogo-net): the reader lifts a stack of the side to move,
// chooses the count, lands it, legal moves only (board-state.ts decides, as on
// every board of the page), and the figure is told the move. The board draws
// the position the figure shows and the move that led to it: its origin ring,
// the pieces it lifted, where it landed. What a move does is the figure's.
import { boardInput } from '../board-input';
import { chooseCount, counts, describeCell, destinations, origins, tap, type Selection } from '../board-state';
import { LC1_2, legal, terminal, type Move, type State, type Triple } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { choiceGroup } from '../kit/controls';
import { colon, t, type Lang } from '../kit/strings';

type CountValue = '1' | '2' | '3';

export interface BoardMark {
  cell: number;
  kind: 'picked' | 'target';
}

export interface OwnBoardOptions {
  lang: Lang;
  /** Where 1/2/3 and Escape are heard: the figure's root. */
  keys: HTMLElement;
  /** Id of the count chooser's label, unique within the shadow root. */
  id: string;
  /** The position shown, and the move that led to it. */
  position: () => { state: State; move?: Triple };
  /** The reader played `move` from the position shown. */
  onPlay: (move: Triple) => void;
  /** The reader lifted, changed or put down a stack (a move played is told by onPlay alone). */
  onTouch?: (from: number | null) => void;
  /** Marks the figure shows instead of the reader's (a move pointed at elsewhere), or null. */
  marks?: () => BoardMark[] | null;
  /** The board's accessible title. */
  title?: () => string;
}

export interface OwnBoard {
  /** The board and its cell buttons. */
  board: HTMLElement;
  /** The count chooser: its line is kept when no stack is lifted. */
  counts: HTMLElement;
  /** Draws the position shown, with the reader's lifted stack if any. */
  draw(): void;
  /** Puts a lifted stack down, without a word to the figure. */
  drop(): void;
  /** The stack lifted, or null. */
  lifted(): number | null;
}

export function ownBoard(o: OwnBoardOptions): OwnBoard {
  const { lang } = o;
  let selection: Selection = null;
  const moves = (): Move[] => {
    const s = o.position().state;
    return terminal(s, LC1_2) ? [] : legal(s);
  };
  const touch = (): void => o.onTouch?.(selection?.from ?? null);

  const box = document.createElement('div');
  box.className = 'play';
  const input = boardInput({
    label: t(lang, 'board'),
    onCell: (i) => {
      const r = tap(selection, moves(), i);
      if ('play' in r) {
        selection = null;
        o.onPlay(r.play);
        return;
      }
      const changed = r.selection !== selection;
      selection = r.selection;
      if (changed) touch();
      draw();
    },
    keys: o.keys,
    lifted: () => selection !== null,
    onCount: (n) => {
      selection = chooseCount(selection, moves(), n);
      touch();
      draw();
    },
    onDrop: () => {
      selection = null;
      touch();
      draw();
    },
  });
  box.append(input.grid);
  const count = choiceGroup<CountValue>({
    label: `${t(lang, 'pieces')}${colon(lang)}`,
    id: o.id,
    choices: (['1', '2', '3'] as const).map((n) => ({ value: n, label: n })),
    onChoose: (n) => {
      selection = chooseCount(selection, moves(), Number(n));
      touch();
      draw();
    },
  });
  count.element.classList.add('counts');

  function draw(): void {
    const { state, move } = o.position();
    const legalMoves = moves();
    const lift = origins(legalMoves);
    const land = selection ? destinations(legalMoves, selection.from, selection.count) : [];
    const theirs = selection ? null : (o.marks?.() ?? null);
    const marks: BoardMark[] =
      theirs ??
      (selection
        ? [{ cell: selection.from, kind: 'picked' }, ...land.map((cell) => ({ cell, kind: 'target' as const }))]
        : lift.map((cell) => ({ cell, kind: 'target' as const })));
    const svg = drawBoard(state, {
      labelRoom: true,
      marks,
      ...(o.title ? { title: o.title() } : {}),
      // The move just played keeps its rings until a stack is lifted or a move is pointed at.
      ...(move && !selection && !theirs ? { from: move[0], to: move[2], moving: move[1] } : {}),
    });
    box.querySelector(':scope > .board-frame')?.remove();
    box.prepend(labelledBoard(svg));
    input.cells.forEach((b, i) => {
      const mark = selection?.from === i ? 'selected' : land.includes(i) ? 'target' : !selection && lift.includes(i) ? 'can-lift' : null;
      const actionable = mark !== null || lift.includes(i);
      b.setAttribute('aria-label', describeCell(lang, state, i, mark));
      b.toggleAttribute('data-actionable', actionable);
      b.setAttribute('aria-disabled', String(!actionable));
    });
    input.syncFocus();
    const available = selection ? counts(legalMoves, selection.from) : [];
    count.element.toggleAttribute('data-off', selection === null);
    count.buttons.forEach((b, k) => (b.hidden = !available.includes(k + 1)));
    count.set(selection ? (String(selection.count) as CountValue) : null);
  }

  return {
    board: box,
    counts: count.element,
    draw,
    drop: () => {
      selection = null;
    },
    lifted: () => selection?.from ?? null,
  };
}
