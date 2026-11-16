// One replay of a list of positions, shared by the figures that step through a
// game (<pogo-line>, <pogo-greedy>, <pogo-stages>): the words of every step
// stacked in one grid cell with only the current one seen, so the area keeps
// the height of its longest words and the board below never moves. Over the
// board a step says two lines at most: what happens (a move), or at the end the
// result as the flyer's stamp, then one sentence (how it ended, or a note). What
// a step says beyond that goes under the board, after the transport (`after`),
// stacked the same way. The board
// redrawn at each step with the move that led there, its moved pieces
// travelling on a step forward; and a polite live region that reads the step.
// Every move name in the words carries its explanation (kit/move-tip.ts), so
// the words are not aria-hidden: only the current step is visible, and the
// hidden ones and the sizers are out of the reading and the tab order.
// What a step says is the figure's; this module only lays it out. Its CSS is
// replay.css, which each figure adopts before its own.
import type { Colour, State, Triple } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { moveText } from '../kit/move-tip';
import { animateMove, drawBoard } from '../kit/board-svg';
import { t, type Lang, type StringKey } from '../kit/strings';

export interface ReplayStep {
  state: State;
  /** The move that led here; absent on the first position. */
  move?: Triple;
}

/** One paragraph of a step's words, with its class (`move`, `note`, `shout who`, `how`, …). */
export interface Line {
  className: string;
  text: string;
}

export interface Spoken {
  /** Over the board: two lines at most. */
  lines: Line[];
  /** Under the board, after the transport: what a step says beyond its two lines. */
  after?: Line[];
  /** The board's text alternative. */
  title: string;
  /** What the live region says when the step is shown. */
  live: string;
}

export interface ReplayOptions {
  /** The language of the move names' explanations. */
  lang: Lang;
  steps: readonly ReplayStep[];
  /** One per step. */
  spoken: readonly Spoken[];
  /**
   * Invisible blocks laid in the same cell, to hold room for words this replay
   * may not say but another one will (a figure that swaps games keeps its board still).
   */
  sizers?: readonly Line[][];
  /** The same, for the words under the board. */
  afterSizers?: readonly Line[][];
  /** Whether showing `to` after `from` is a step forward, whose pieces travel (default: `to === from + 1`). */
  forward?: (from: number, to: number) => boolean;
  reducedMotion: () => boolean;
}

export interface ReplayView {
  /** The stacked words, the current step's alone visible; assistive tech also hears `live`. */
  status: HTMLElement;
  /** The words under the board, stacked as `status` is; the figure puts it after its transport. Empty when no step has any. */
  after: HTMLElement;
  /** Where the board is drawn. */
  slot: HTMLElement;
  live: HTMLElement;
  /** Shows step `i`: its words, its board, and the move travelling when it is a step forward. */
  show(i: number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function block(lang: Lang, lines: readonly Line[], extra = ''): HTMLElement {
  const b = el('div', extra ? `said ${extra}` : 'said');
  for (const l of lines) {
    const p = el('p', l.className);
    p.append(...moveText(lang, l.text));
    b.append(p);
  }
  return b;
}

export function replayView(o: ReplayOptions): ReplayView {
  const status = el('div', 'status');
  const blocks = o.spoken.map((s) => block(o.lang, s.lines));
  // A sizer only holds room: plain text, never a tab stop.
  const sizer = (lines: readonly Line[]): HTMLElement => {
    const b = el('div', 'said sizer');
    b.setAttribute('aria-hidden', 'true');
    for (const l of lines) b.append(el('p', l.className, l.text));
    return b;
  };
  status.append(...(o.sizers ?? []).map(sizer), ...blocks);
  const after = el('div', 'status after');
  const afterBlocks = o.spoken.map((s) => block(o.lang, s.after ?? []));
  if (o.spoken.some((s) => s.after?.length)) after.append(...(o.afterSizers ?? []).map(sizer), ...afterBlocks);
  const live = el('p', 'sr');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const slot = el('div', 'board-slot');
  const forward = o.forward ?? ((from: number, to: number) => to === from + 1);

  let svg: SVGSVGElement | undefined;
  let shown = -1;
  const show = (i: number): void => {
    const step = o.steps[i]!;
    const said = o.spoken[i]!;
    blocks.forEach((b, k) => b.toggleAttribute('data-off', k !== i));
    afterBlocks.forEach((b, k) => b.toggleAttribute('data-off', k !== i));
    live.textContent = said.live;
    const move = step.move;
    const next = drawBoard(step.state, {
      labelRoom: true,
      title: said.title,
      ...(move ? { from: move[0], to: move[2], moving: move[1] } : {}),
    });
    const before = svg;
    slot.replaceChildren(labelledBoard(next));
    svg = next;
    if (before && move && forward(shown, i) && !o.reducedMotion()) animateMove(before, next, move);
    shown = i;
  };

  return { status, after, slot, live, show };
}

export const colourKey = (c: Colour): StringKey => (c === 'White' ? 'white' : 'red');

/** The end of a game in words: who wins (« Blanc gagne »), and how. */
export function resultWords(lang: Lang, result: { winner: 'W' | 'R'; byRepetition: boolean }): { who: string; how: string } {
  const winner: Colour = result.winner === 'W' ? 'White' : 'Red';
  const loser: Colour = winner === 'White' ? 'Red' : 'White';
  return {
    who: `${t(lang, colourKey(winner))} ${t(lang, 'wins')}`,
    how: result.byRepetition
      ? `${t(lang, colourKey(loser))} ${t(lang, 'byRepetition')}`
      : t(lang, winner === 'White' ? 'byStacksWhite' : 'byStacksRed'),
  };
}
