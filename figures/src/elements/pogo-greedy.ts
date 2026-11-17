// <pogo-greedy>: one short game of the greedy player against itself under
// lc1-2 (greedy-game.ts), with no position met twice and a real win at the
// end. Beside the board, each move is told as greedy makes it, in this order:
// whose turn it is; every legal move with the value greedy gives it, the gap
// it would leave between the mover's stacks and the opponent's, one row per
// value, the greatest first; the greatest marked, and the move drawn among its
// ties; the move played, its pieces travelling; then the scoreboard, which
// counts the stacks each colour owns, changing. A step forward plays these
// beats one after the other; any other change of step, and reduced motion,
// show the step settled. It ends on the result, and the transport then
// replays it.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import { ready, type Colour, type Triple } from '../engine';
import { autoplay } from '../kit/autoplay';
import { labelledBoard } from '../kit/board-labels';
import { animateMove, drawBoard } from '../kit/board-svg';
import { progress, transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveText, moveTip } from '../kit/move-tip';
import { Stepper } from '../kit/stepper';
import { MOVE_TEMPO_MS } from '../kit/tempo';
import { colon, t, type Lang } from '../kit/strings';
import { endOf, gapText, greedyGame, valueRows, type GreedyChoice, type GreedyFrame } from './greedy-game';
import { plies } from './net-position';
import greedyCss from './pogo-greedy.css?raw';
import { resultWords } from './replay-view';

/**
 * When each beat of a step falls, in ms: whose turn is read; then every move weighed, held to
 * be read; then the greatest marked; then the move is played and held the kit's one tempo
 * before the scoreboard changes; and how long the whole step is held.
 */
export const BEATS = { weigh: 900, best: 900 + 2800, move: 900 + 2800 + 1400, score: 900 + 2800 + 1400 + MOVE_TEMPO_MS } as const;
export const STEP_MS = BEATS.score + 1500;

/** A value as the figure writes it: a signed gap, or the end the move brings. */
export function valueText(lang: Lang, score: number): string {
  const end = endOf(score);
  if (end) return t(lang, end === 'win' ? 'greedyWinsWord' : 'greedyLosesWord');
  return gapText(score);
}

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

/** « Les coups possibles et leur écart : +1 (6 coups), 0 (8 coups), −1 (2 coups). » */
export function weighedText(lang: Lang, c: GreedyChoice): string {
  const rows = valueRows(c).map((r) => `${valueText(lang, r.score)} (${plies(lang, r.moves.length)})`);
  return `${t(lang, 'greedyWeighedSaid')}${colon(lang)} ${rows.join(', ')}.`;
}

const turnText = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'greedyTurnWhite' : 'greedyTurnRed');
const gapLabel = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'greedyGapWhite' : 'greedyGapRed');
const same = (a: Triple, b: Triple): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** What a screen reader hears for a step: the move, what was weighed, the count, the gap and why, then the end. */
export function spoken(lang: Lang, f: GreedyFrame): string {
  const count = `${t(lang, 'greedyStacksWhite')}${colon(lang)} ${f.stacks.white}, ${t(lang, 'greedyStacksRed').toLowerCase()}${colon(lang)} ${f.stacks.red}.`;
  const c = f.choice;
  if (!c) return `${t(lang, 'startPosition')}. ${count}`;
  const end = f.result ? resultWords(lang, f.result) : null;
  return [
    `${announceMove(lang, c.mover, c.move)}.`,
    weighedText(lang, c),
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

    // What greedy weighs: every legal move and the gap it would leave, one row per value.
    // Every step's rows share one grid cell, so the panel keeps the room of the longest.
    const weigh = el('div', 'weigh');
    weigh.append(el('p', 'say weigh-title', t(lang, 'greedyWeighTitle')), el('p', 'what weigh-unit', t(lang, 'greedyWeighUnit')));
    const lists = el('div', 'lists');
    weigh.append(lists);
    const blocks = frames.map((f, i) => {
      const block = el('div', 'values');
      block.toggleAttribute('data-off', true);
      const c = f.choice;
      if (!c) return block;
      for (const r of valueRows(c)) {
        const line = el('div', 'vrow');
        line.toggleAttribute('data-best', r.best);
        line.dataset.score = String(r.score);
        const chips = el('span', 'chips');
        for (const m of r.moves) {
          const chip = moveTip(lang, m, { show: () => mark(i, m), hide: () => redraw() });
          chip.classList.add('chip', 'num');
          chip.tabIndex = -1;
          chip.toggleAttribute('data-chosen', same(m, c.move));
          chips.append(chip);
        }
        line.append(el('span', 'vval num', valueText(lang, r.score)), chips);
        block.append(line);
      }
      lists.append(block);
      return block;
    });
    const why = el('p', 'why');

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

    // The end: who wins, as the flyer's stamp, and how.
    const result = el('div', 'result');
    const who = el('p', 'shout who');
    const how = el('p', 'how');
    result.append(who, how);

    const panel = el('div', 'panel');
    panel.append(turn, weigh, why, move, board, result);
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    let svg: SVGSVGElement | undefined;
    /** The board of the step on screen, as `draw` last left it; a move explained draws over it until it is left. */
    let redraw: () => void = () => undefined;
    const draw = (i: number, travel: boolean): void => {
      const f = frames[i]!;
      const m = f.choice?.move;
      const next = drawBoard(f.state, { labelRoom: true, title: spoken(lang, f), ...(m ? { from: m[0], to: m[2], moving: m[1] } : {}) });
      const before = svg;
      slot.replaceChildren(labelledBoard(next));
      svg = next;
      if (travel && before && m) animateMove(before, next, m);
      redraw = () => {
        slot.replaceChildren(labelledBoard(next));
        svg = next;
      };
    };
    /** A move weighed at step `i`, marked on the position it is weighed from. */
    const mark = (i: number, m: Triple): void => {
      const from = frames[i - 1]!.state;
      slot.replaceChildren(labelledBoard(drawBoard(from, { labelRoom: true, marks: [{ cell: m[0], kind: 'picked' }, { cell: m[2], kind: 'target' }] })));
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
    /** The moves of step `i` weighed: `chosen` marks the greatest value and the move drawn among its ties. */
    const weighed = (i: number, chosen: boolean): void => {
      blocks.forEach((b, k) => {
        b.toggleAttribute('data-off', k !== i || !frames[i]!.choice);
        b.toggleAttribute('data-chosen', k === i && chosen);
      });
      for (const chip of blocks[i]!.querySelectorAll<HTMLElement>('.chip')) chip.tabIndex = frames[i]!.choice ? 0 : -1;
      for (const [k, b] of blocks.entries()) if (k !== i) for (const chip of b.querySelectorAll<HTMLElement>('.chip')) chip.tabIndex = -1;
      const c = frames[i]!.choice;
      why.toggleAttribute('data-off', !c || !chosen);
      if (c) why.textContent = whyText(lang, c);
    };
    const ending = (i: number): void => {
      const end = frames[i]!.result ? resultWords(lang, frames[i]!.result!) : null;
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
      weighed(i, true);
      ending(i);
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
      // The position before the move, and whose turn it is; then every move weighed; then the
      // greatest; then the move; then the count.
      settle(i - 1);
      turn.toggleAttribute('data-off', false);
      turn.textContent = turnText(lang, frames[i]!.choice!.mover);
      for (const node of [move, why, result]) node.toggleAttribute('data-off', true);
      for (const b of blocks) b.toggleAttribute('data-off', true);
      timers = [
        setTimeout(() => weighed(i, false), BEATS.weigh),
        setTimeout(() => weighed(i, true), BEATS.best),
        setTimeout(() => {
          said(i);
          draw(i, true);
        }, BEATS.move),
        setTimeout(() => {
          count(i, true);
          ending(i);
        }, BEATS.score),
      ];
    };

    const stepper = new Stepper(frames.length, show, { signal, interval: STEP_MS });
    show(0);
    const body = el('div', 'game');
    body.append(slot, panel);
    root.append(body, transport(stepper, { lang, unit: 'move', counter: progress(lang, 'move', true) }), live);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
    this.stage.append(root);
  }
}
