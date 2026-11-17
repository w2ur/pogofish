// <pogo-greedy>: one short game of the greedy player against itself under
// lc1-2 (greedy-game.ts), with no position met twice and a real win at the
// end. Beside the board, a scoreboard counts the stacks each colour owns, and
// each move is told as a cause, in this order: whose turn it is; the move,
// its pieces travelling; the scoreboard changing; then the gap the move
// leaves, which is what greedy maximises, and how many moves were as good.
// A step forward plays these beats one after the other; any other change of
// step, and reduced motion, show the step settled. It ends on the result,
// and the transport then replays it.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import { ready, type Colour } from '../engine';
import { autoplay } from '../kit/autoplay';
import { labelledBoard } from '../kit/board-labels';
import { animateMove, drawBoard } from '../kit/board-svg';
import { progress, transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveText } from '../kit/move-tip';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang } from '../kit/strings';
import { gapText, greedyGame, type GreedyChoice, type GreedyFrame } from './greedy-game';
import greedyCss from './pogo-greedy.css?raw';
import { resultWords } from './replay-view';

/** How long a move is held, in ms, and when each of its beats falls. */
export const MOVE_MS = 3800;
export const BEATS = { move: 900, score: 1700, gap: 2500 } as const;

/** « Un des 6 coups à +1, sur 16 possibles. » */
export function whyText(lang: Lang, c: GreedyChoice): string {
  const said = (() => {
    if (c.weighed === 1) return t(lang, 'onlyMove');
    const of = `, ${t(lang, 'greedyOf')} ${c.weighed} ${t(lang, 'greedyPossible')}`;
    if (c.wins) {
      return c.tied === 1 ? `${t(lang, 'greedyOnlyWin')}${of}` : `${t(lang, 'greedyOneOf')} ${c.tied} ${t(lang, 'movesUnit')} ${t(lang, 'greedyThatWin')}${of}`;
    }
    const gap = gapText(c.gap);
    return c.tied === 1
      ? `${t(lang, 'greedyOnlyAt')} ${gap}${of}`
      : `${t(lang, 'greedyOneOf')} ${c.tied} ${t(lang, 'movesUnit')} ${t(lang, 'greedyAt')} ${gap}${of}`;
  })();
  return `${said[0]!.toUpperCase()}${said.slice(1)}.`;
}

const turnText = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'greedyTurnWhite' : 'greedyTurnRed');
const gapLabel = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'greedyGapWhite' : 'greedyGapRed');

/** What a screen reader hears for a step: the move, the count, the gap and why, then the end. */
export function spoken(lang: Lang, f: GreedyFrame): string {
  const count = `${t(lang, 'greedyStacksWhite')}${colon(lang)} ${f.stacks.white}, ${t(lang, 'greedyStacksRed').toLowerCase()}${colon(lang)} ${f.stacks.red}.`;
  const c = f.choice;
  if (!c) return `${t(lang, 'startPosition')}. ${count}`;
  const end = f.result ? resultWords(lang, f.result) : null;
  return [
    `${announceMove(lang, c.mover, c.move)}.`,
    count,
    `${gapLabel(lang, c.mover)}${colon(lang)} ${gapText(c.gap)}.`,
    whyText(lang, c),
    ...(end ? [`${end.who}.`, end.how] : []),
  ].join(' ');
}

export class PogoGreedy extends PogoFigure {
  static override styles = greedyCss;
  static override stageMinHeight = '700px';

  /** The engine; a test swaps it. */
  static deps: { engine: () => Promise<void> } = { engine: () => ready(assetUrl(WASM_FILE)) };

  protected async render(signal: AbortSignal): Promise<void> {
    await (this.constructor as typeof PogoGreedy).deps.engine();
    if (signal.aborted) return;
    const lang = this.lang;
    const { frames } = greedyGame();
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const root = el('div', 'greedy');
    const slot = el('div', 'board-slot');

    // Whose turn, then the move: two lines, each keeping its room.
    const turn = el('p', 'turn say');
    const move = el('p', 'move');

    // The scoreboard: a row per colour, its stacks counted as pieces and as a number.
    const row = (colour: Colour): { row: HTMLElement; set(n: number, changed: boolean): void } => {
      const line = el('div', 'count');
      line.dataset.colour = colour;
      const number = el('span', 'shout num number');
      const pieces = el('span', 'pieces');
      pieces.setAttribute('aria-hidden', 'true');
      line.append(el('span', 'label what', t(lang, colour === 'White' ? 'greedyStacksWhite' : 'greedyStacksRed')), number, pieces);
      return {
        row: line,
        set(n, changed) {
          number.textContent = String(n);
          pieces.replaceChildren(...Array.from({ length: n }, () => el('span', `piece ${colour === 'White' ? 'white' : 'red'}`)));
          line.toggleAttribute('data-changed', changed);
        },
      };
    };
    const white = row('White');
    const red = row('Red');
    const board = el('div', 'scoreboard');
    board.append(white.row, red.row);

    // What greedy maximises, from the mover's side, and how many moves did as well.
    const gap = el('div', 'lead');
    const gapWhat = el('span', 'label what');
    const gapValue = el('span', 'shout num value');
    gap.append(gapWhat, gapValue);
    const why = el('p', 'why');

    // The end: who wins, as the flyer's stamp, and how.
    const result = el('div', 'result');
    const who = el('p', 'shout who');
    const how = el('p', 'how');
    result.append(who, how);

    const panel = el('div', 'panel');
    panel.append(turn, move, board, gap, why, result);
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    let svg: SVGSVGElement | undefined;
    const draw = (i: number, travel: boolean): void => {
      const f = frames[i]!;
      const m = f.choice?.move;
      const next = drawBoard(f.state, { labelRoom: true, title: spoken(lang, f), ...(m ? { from: m[0], to: m[2], moving: m[1] } : {}) });
      const before = svg;
      slot.replaceChildren(labelledBoard(next));
      svg = next;
      if (travel && before && m) animateMove(before, next, m);
    };
    const count = (i: number, flash: boolean): void => {
      const [now, was] = [frames[i]!.stacks, frames[Math.max(0, i - 1)]!.stacks];
      white.set(now.white, flash && now.white !== was.white);
      red.set(now.red, flash && now.red !== was.red);
    };
    const said = (i: number): void => {
      const c = frames[i]!.choice;
      move.replaceChildren(...(c ? moveText(lang, announceMove(lang, c.mover, c.move)) : []));
      move.toggleAttribute('data-off', !c);
    };
    const reason = (i: number): void => {
      const f = frames[i]!;
      const c = f.choice;
      gap.toggleAttribute('data-off', !c);
      why.toggleAttribute('data-off', !c);
      if (c) {
        gapWhat.textContent = gapLabel(lang, c.mover);
        gapValue.textContent = gapText(c.gap);
        why.textContent = whyText(lang, c);
      }
      const end = f.result ? resultWords(lang, f.result) : null;
      result.toggleAttribute('data-off', !end);
      // Once the game is over nobody is to play: the turn line goes, keeping its room.
      turn.toggleAttribute('data-off', !!end);
      who.textContent = end?.who ?? '';
      how.textContent = end?.how ?? '';
    };
    /** Step `i` once everything has happened. */
    const settle = (i: number): void => {
      const f = frames[i]!;
      turn.textContent = f.choice ? turnText(lang, f.choice.mover) : t(lang, 'startPosition');
      said(i);
      draw(i, false);
      count(i, false);
      reason(i);
    };

    // The beats of the move under way: dropped when another step is shown, or with the figure.
    let timers: ReturnType<typeof setTimeout>[] = [];
    const drop = (): void => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    signal.addEventListener('abort', drop, { once: true });
    let shown = -1;
    const show = (i: number): void => {
      drop();
      const forward = i === shown + 1 && i > 0;
      shown = i;
      live.textContent = spoken(lang, frames[i]!);
      if (!forward || this.reducedMotion()) {
        settle(i);
        return;
      }
      // The position before the move, and whose turn it is; then the move; then the count; then the gap.
      settle(i - 1);
      turn.textContent = turnText(lang, frames[i]!.choice!.mover);
      for (const node of [move, gap, why, result]) node.toggleAttribute('data-off', true);
      timers = [
        setTimeout(() => {
          said(i);
          draw(i, true);
        }, BEATS.move),
        setTimeout(() => count(i, true), BEATS.score),
        setTimeout(() => reason(i), BEATS.gap),
      ];
    };

    const stepper = new Stepper(frames.length, show, { signal, interval: MOVE_MS });
    show(0);
    const body = el('div', 'game');
    body.append(slot, panel);
    root.append(body, transport(stepper, { lang, counter: progress(lang, 'move', true) }), live);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
    this.stage.append(root);
  }
}
