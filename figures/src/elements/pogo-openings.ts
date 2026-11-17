// <pogo-openings>: a tester of the first two moves. The reader plays a first
// move for White on the start position, and the figure says what it leads to,
// from the solved table, in the essay's words: it avoids defeat (the game can
// go on without end), or it loses (Red forces the win in so many moves). Then
// the reader plays a reply for Red, and gets the same kind of verdict. Then the
// board is done, until « Recommencer ». Only the first two moves are judged:
// the table holds those (openings-verdicts.ts, every list checked against
// legal() before anything is drawn). The essay's claim, the six first moves on
// one's own row are exactly those that avoid defeat, is held by a test there.
// The board is played as every board of the page: tap a stack, choose how many
// pieces (1, 2 or 3, also by key), tap where they land (kit/take-pieces.ts).
// It is a toy (kit/toy.ts): the first time it comes on screen it plays its
// introduction once, White's losing first move to the centre then Red's
// quickest win, each verdict held to be read (introMoves()); then, or at the
// reader's first press, it is back on the start position and the reader's.
// The verdicts sit beside the board when there is room (under it when narrow),
// White's row and Red's named from the start, an ink arrow from the board to
// them. « Jouer cette position » hands the position on the board over, once
// the toy is the reader's.
import { WASM_FILE, assetUrl } from '../assets';
import type { TableData } from '../data';
import { initial, legal, moveName, play, ready, type Colour, type Move, type State, type Triple } from '../engine';
import { boardLabels } from '../kit/board-labels';
import { animateMove, drawBoard } from '../kit/board-svg';
import { controlButton, playFromButton, setAway } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveTip } from '../kit/move-tip';
import { t } from '../kit/strings';
import { takePieces } from '../kit/take-pieces';
import { MOVE_TEMPO_MS } from '../kit/tempo';
import { readingMark, toy } from '../kit/toy';
import { sharedTable } from '../table';
import { introMoves, openingChoices, outcomeText, replyChoices, verdictOf } from './openings-verdicts';
import openingsCss from './pogo-openings.css?raw';

/** The table holds the verdicts of the first two moves: White's first, Red's reply. */
const JUDGED = 2;

/** How long the introduction holds each verdict: one sentence to read. */
export const INTRO_READ_MS = 3000;

export class PogoOpenings extends PogoFigure {
  static override styles = openingsCss;
  static override stageMinHeight = '640px';

  /** The engine and the table; a test swaps them. */
  static deps: { engine: () => Promise<void>; table: () => Promise<TableData> } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    table: sharedTable,
  };

  protected async render(signal: AbortSignal): Promise<void> {
    const deps = (this.constructor as typeof PogoOpenings).deps;
    const [table] = await Promise.all([deps.table(), deps.engine()]);
    if (signal.aborted) return;
    const lang = this.lang;
    // Fails here, before anything is drawn, if any list of the table disagrees with legal().
    for (const o of openingChoices(table).moves) replyChoices(table, o.move);

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    let played: Triple[] = [];
    const now = (): State => played.reduce((s, m) => play(s, m), initial());
    const moves = (): Move[] => (played.length < JUDGED ? legal(now()) : []);

    const root = el('div', 'openings');

    const playBox = el('div', 'play');
    const take = takePieces({
      lang,
      id: 'openings-counts-label',
      keys: root,
      state: now,
      moves,
      onPlay: (move) => {
        const before = playBox.querySelector<SVGSVGElement>(':scope > svg');
        played = [...played, move];
        update(before, move);
      },
      onChange: () => drawBoardPart(),
    });
    playBox.append(boardLabels(), take.grid);

    const list = el('ol', 'played');
    list.setAttribute('aria-label', t(lang, 'openingsPlayedList'));
    list.setAttribute('aria-live', 'polite');

    const restart = controlButton(
      t(lang, 'restart'),
      () => {
        played = [];
        take.putDown();
        update(null);
      },
      true,
    );
    restart.dataset.role = 'restart';
    // « les premiers coups, c1-1-b1 a3-1-b3 »: what the playable board says it was handed.
    const offer = playFromButton(lang, () => this.playFrom(now(), [t(lang, 'openingsName'), ...(played.length ? [played.map(moveName).join(' ')] : [])].join(', ')));
    const actions = el('div', 'controls actions');
    actions.append(restart, offer);

    const SIDES: Colour[] = ['White', 'Red'];
    /** The toy is the reader's (kit/toy.ts calls onReady once, maybe before toy() returns). */
    let isReady = false;
    /** The invitation, the toy's: set once toy() has returned. */
    let askLine: HTMLParagraphElement | null = null;
    const drawBoardPart = (before?: SVGSVGElement, moved?: Triple): void => {
      const last = played.at(-1);
      const svg = drawBoard(now(), {
        labelRoom: true,
        marks: take.marks(),
        // The move just played keeps its frame until a stack is lifted.
        ...(last && !take.selection() ? { to: last[2], moving: last[1] } : {}),
      });
      playBox.querySelector(':scope > svg')?.remove();
      playBox.prepend(svg);
      if (before && moved && !this.reducedMotion()) animateMove(before, svg, moved);
      take.sync();
    };

    /** Redraws all: the board (the pieces of `moved` travelling from `before`), the verdicts, the line that asks. */
    const update = (before: SVGSVGElement | null, moved?: Triple): void => {
      drawBoardPart(before ?? undefined, moved);
      list.replaceChildren(
        ...SIDES.map((mover, k) => {
          const m = played[k];
          const li = el('li', 'verdict-row');
          li.dataset.side = mover;
          const side = t(lang, mover === 'White' ? 'white' : 'red');
          // A row not played yet: the side named, its verdict to come.
          if (!m) {
            li.dataset.pending = '';
            li.append(el('p', 'move', side), el('p', 'verdict', '…'));
            return li;
          }
          const move = el('p', 'move');
          move.append(`${side} `, moveTip(lang, m));
          li.append(move, el('p', 'verdict', outcomeText(lang, mover, verdictOf(table, played.slice(0, k + 1)))));
          return li;
        }),
      );
      // Hidden by the theme until the toy is the reader's; its text then follows the moves played.
      if (askLine) askLine.textContent = t(lang, played.length === 0 ? 'openingsAskWhite' : played.length === 1 ? 'openingsAskRed' : 'openingsDone');
      restart.disabled = played.length === 0 || !isReady;
      setAway(offer, !isReady);
    };

    const boardCol = el('div', 'board-col');
    boardCol.append(playBox, take.counts.element);
    const side = el('div', 'side');
    side.append(list, actions);
    const body = el('div', 'tester');
    // From the board to its verdicts: right when they stand beside it, down when under it (pogo-openings.css).
    const reads = readingMark('right');
    body.append(boardCol, reads, side);

    const [introWhite, introRed] = introMoves(table);
    const intro = [[], [introWhite], [introWhite, introRed]] as Triple[][];
    const toyState = toy(this, {
      root,
      invite: t(lang, 'openingsAskWhite'),
      intro: {
        steps: intro.length,
        show: (i) => {
          const before = playBox.querySelector<SVGSVGElement>(':scope > svg');
          played = intro[i]!;
          update(before, played.at(-1));
        },
        interval: (i) => (i === 0 ? MOVE_TEMPO_MS : INTRO_READ_MS),
      },
      onReady: () => {
        isReady = true;
        played = [];
        take.putDown();
        update(null);
      },
      signal,
    });
    askLine = toyState.invite;
    askLine.classList.add('ask');
    askLine.setAttribute('aria-live', 'polite');
    // What to do next, above the board: read before the board is played.
    root.append(askLine, body);
    update(null);
    this.stage.append(root);
  }
}
