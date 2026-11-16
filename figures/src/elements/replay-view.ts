// One replay of a list of positions, shared by the figures that step through a
// game (<pogo-line>, <pogo-greedy>, <pogo-stages>): the words of every step
// stacked in one grid cell with only the current one seen, so the area keeps
// the height of its longest words and the board below never moves; the board
// redrawn at each step with the move that led there, its moved pieces
// travelling on a step forward; and a polite live region that reads the step.
// What a step says is the figure's; this module only lays it out. Its CSS is
// replay.css, which each figure adopts before its own.
import type { Colour, State, Triple } from '../engine';
import { labelledBoard } from '../kit/board-labels';
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
  lines: Line[];
  /** The board's text alternative. */
  title: string;
  /** What the live region says when the step is shown. */
  live: string;
}

export interface ReplayOptions {
  steps: readonly ReplayStep[];
  /** One per step. */
  spoken: readonly Spoken[];
  /**
   * Invisible blocks laid in the same cell, to hold room for words this replay
   * may not say but another one will (a figure that swaps games keeps its board still).
   */
  sizers?: readonly Line[][];
  /** Whether showing `to` after `from` is a step forward, whose pieces travel (default: `to === from + 1`). */
  forward?: (from: number, to: number) => boolean;
  reducedMotion: () => boolean;
}

export interface ReplayView {
  /** The stacked words; hidden from assistive tech, which hears `live`. */
  status: HTMLElement;
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

function block(lines: readonly Line[], extra = ''): HTMLElement {
  const b = el('div', extra ? `said ${extra}` : 'said');
  for (const l of lines) b.append(el('p', l.className, l.text));
  return b;
}

export function replayView(o: ReplayOptions): ReplayView {
  const status = el('div', 'status');
  status.setAttribute('aria-hidden', 'true');
  const blocks = o.spoken.map((s) => block(s.lines));
  status.append(...(o.sizers ?? []).map((lines) => block(lines, 'sizer')), ...blocks);
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

  return { status, slot, live, show };
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
