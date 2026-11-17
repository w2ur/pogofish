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
// pieces (1, 2 or 3, also by key), tap where they land (board-input.ts,
// board-state.ts). The figure plays nothing by itself: the reader is the one
// who plays. « Jouer cette position » hands the position on the board over.
import { boardInput } from '../board-input';
import { chooseCount, counts, describeCell, destinations, origins, tap, type Selection } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import type { TableData } from '../data';
import { initial, legal, moveName, play, ready, type Colour, type Move, type State, type Triple } from '../engine';
import { boardLabels } from '../kit/board-labels';
import { animateMove, drawBoard } from '../kit/board-svg';
import { choiceGroup, controlButton, playFromButton } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveTip } from '../kit/move-tip';
import { colon, t } from '../kit/strings';
import { sharedTable } from '../table';
import { openingChoices, outcomeText, replyChoices, verdictOf } from './openings-verdicts';
import openingsCss from './pogo-openings.css?raw';

type CountValue = '1' | '2' | '3';

/** The table holds the verdicts of the first two moves: White's first, Red's reply. */
const JUDGED = 2;

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
    let selection: Selection = null;
    const now = (): State => played.reduce((s, m) => play(s, m), initial());
    const moves = (): Move[] => (played.length < JUDGED ? legal(now()) : []);

    const root = el('div', 'openings');
    const askLine = el('p', 'ask say');
    askLine.setAttribute('aria-live', 'polite');

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
      id: 'openings-counts-label',
      choices: (['1', '2', '3'] as const).map((n) => ({ value: n, label: n })),
      onChoose: (n) => {
        selection = chooseCount(selection, moves(), Number(n));
        drawBoardPart();
      },
    });
    count.element.classList.add('counts');

    const list = el('ol', 'played');
    list.setAttribute('aria-label', t(lang, 'openingsPlayedList'));
    list.setAttribute('aria-live', 'polite');

    const restart = controlButton(
      t(lang, 'restart'),
      () => {
        played = [];
        selection = null;
        update(null);
      },
      true,
    );
    restart.dataset.role = 'restart';
    // « les premiers coups, c1-1-b1 a3-1-b3 »: what the playable board says it was handed.
    const offer = playFromButton(lang, () => this.playFrom(now(), [t(lang, 'openingsName'), ...(played.length ? [played.map(moveName).join(' ')] : [])].join(', ')));
    const actions = el('div', 'controls actions');
    actions.append(restart, offer);

    const drawBoardPart = (before?: SVGSVGElement, moved?: Triple): void => {
      const s = now();
      const legalMoves = moves();
      const lift = origins(legalMoves);
      const land = selection ? destinations(legalMoves, selection.from, selection.count) : [];
      const last = played.at(-1);
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
      if (before && moved && !this.reducedMotion()) animateMove(before, svg, moved);
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
    };

    /** Redraws all: the board (the pieces of `moved` travelling from `before`), the verdicts, the line that asks. */
    const update = (before: SVGSVGElement | null, moved?: Triple): void => {
      drawBoardPart(before ?? undefined, moved);
      list.replaceChildren(
        ...played.map((m, k) => {
          const mover: Colour = k === 0 ? 'White' : 'Red';
          const li = el('li', 'verdict-row');
          li.dataset.side = mover;
          const move = el('p', 'move');
          move.append(`${t(lang, mover === 'White' ? 'white' : 'red')} `, moveTip(lang, m));
          li.append(move, el('p', 'verdict', outcomeText(lang, mover, verdictOf(table, played.slice(0, k + 1)))));
          return li;
        }),
      );
      askLine.textContent = t(lang, played.length === 0 ? 'openingsAskWhite' : played.length === 1 ? 'openingsAskRed' : 'openingsDone');
      restart.disabled = played.length === 0;
    };

    function onCell(i: number): void {
      const r = tap(selection, moves(), i);
      if ('play' in r) {
        const before = playBox.querySelector<SVGSVGElement>(':scope > svg');
        played = [...played, r.play];
        selection = null;
        update(before, r.play);
        return;
      }
      selection = r.selection;
      drawBoardPart();
    }

    const boardCol = el('div', 'board-col');
    boardCol.append(playBox, count.element);
    const side = el('div', 'side');
    side.append(list, actions);
    const body = el('div', 'tester');
    body.append(boardCol, side);
    // What to do next, above the board: read before the board is played.
    root.append(askLine, body);
    update(null);
    this.stage.append(root);
  }
}
