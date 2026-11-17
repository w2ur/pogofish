// The board a figure lends the reader when it maps a position to something
// (pogo-encoding, pogo-net): the reader takes pieces as on every board of the
// page (kit/take-pieces.ts: the stack, how many, where they land), legal moves
// only, and the figure is told the move. The board draws the position the
// figure shows and the move that led to it: its origin ring, the pieces it
// lifted, where it landed. What a move does is the figure's.
import { LC1_2, legal, terminal, type Move, type State, type Triple } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { drawBoard, type BoardMark } from '../kit/board-svg';
import { takePieces } from '../kit/take-pieces';
import type { Lang } from '../kit/strings';

export type { BoardMark };

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
  const moves = (): Move[] => {
    const s = o.position().state;
    return terminal(s, LC1_2) ? [] : legal(s);
  };

  const box = document.createElement('div');
  box.className = 'play';
  const take = takePieces({
    lang: o.lang,
    id: o.id,
    keys: o.keys,
    state: () => o.position().state,
    moves,
    onPlay: o.onPlay,
    onChange: () => {
      o.onTouch?.(take.selection()?.from ?? null);
      draw();
    },
    // At rest the board shows the move just played, and nothing else: the invitation under it says what to do.
    markLiftable: false,
  });
  box.append(take.grid);

  function draw(): void {
    const { state, move } = o.position();
    const lifted = take.selection() !== null;
    const theirs = lifted ? null : (o.marks?.() ?? null);
    const svg = drawBoard(state, {
      labelRoom: true,
      marks: theirs ?? take.marks(),
      ...(o.title ? { title: o.title() } : {}),
      // The move just played keeps its rings until a stack is lifted or a move is pointed at.
      ...(move && !lifted && !theirs ? { from: move[0], to: move[2], moving: move[1] } : {}),
    });
    box.querySelector(':scope > .board-frame')?.remove();
    box.prepend(labelledBoard(svg));
    take.sync();
  }

  return {
    board: box,
    counts: take.counts.element,
    draw,
    drop: () => take.putDown(),
    lifted: () => take.selection()?.from ?? null,
  };
}
