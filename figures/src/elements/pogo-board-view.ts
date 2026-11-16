// The DOM of <pogo-board>, built once per render: it holds no state and makes no
// decision. pogo-board.ts owns the state and fills these nodes in update().
import { SCREEN_ORDER, longestResult } from '../board-state';
import { initial, type Colour } from '../engine';
import { boardLabels } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { choiceGroup, controlButton, type ChoiceGroup } from '../kit/controls';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { LEVELS, type Level } from '../store';

export type CountValue = '1' | '2' | '3';
export const COLOURS: readonly Colour[] = ['White', 'Red'];
export const colourKey = (c: Colour): StringKey => (c === 'White' ? 'white' : 'red');

export interface Ui {
  root: HTMLElement;
  body: HTMLElement;
  barStatus?: HTMLElement;
  toggle?: HTMLButtonElement;
  caption: HTMLElement;
  /** The turn line, the retry and the result, in one reserved area. */
  status: HTMLElement;
  turn: HTMLElement;
  retry: HTMLButtonElement;
  result: HTMLElement;
  who: HTMLElement;
  how: HTMLElement;
  you: HTMLElement;
  play: HTMLElement;
  svg: SVGSVGElement;
  cells: HTMLButtonElement[];
  count: ChoiceGroup<CountValue>;
  side: ChoiceGroup<Colour>;
  level: ChoiceGroup<Level>;
  /** Side and level, shown when no game is under way. */
  setup: HTMLElement;
  /** « Blanc · Facile »: the game under way, in place of the setup. */
  summary: HTMLElement;
  /** The one « Nouvelle partie », below the board; asks once before abandoning a game. */
  newGame: HTMLButtonElement;
  /** The setup, the summary and « Nouvelle partie », below the board. */
  next: HTMLElement;
  movesSummary: HTMLElement;
  movesList: HTMLOListElement;
  live: HTMLElement;
}

/** What the view's controls call; the element decides what each does. */
export interface Handlers {
  cell(i: number): void;
  arrow(e: KeyboardEvent): void;
  key(e: KeyboardEvent): void;
  count(n: number): void;
  side(c: Colour): void;
  level(l: Level): void;
  /** « Nouvelle partie », or its confirmation when a game is under way. */
  newGame(): void;
  /** Focus left the confirmation: back to « Nouvelle partie ». */
  cancelAbandon(): void;
  retry(): void;
  toggle(): void;
}

export function buildView(lang: Lang, mode: 'inline' | 'follow', h: Handlers): Ui {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const root = el('div', 'pb');
  root.dataset.mode = mode;
  const body = el('div', 'body');
  body.id = 'board-body';

  let barStatus: HTMLElement | undefined;
  let toggle: HTMLButtonElement | undefined;
  if (mode === 'follow') {
    const bar = el('div', 'bar');
    barStatus = el('p', 'bar-status say');
    toggle = controlButton(t(lang, 'collapse'), h.toggle, true);
    toggle.setAttribute('aria-controls', body.id);
    bar.append(barStatus, toggle);
    root.append(bar);
  }

  const caption = el('p', 'caption');
  // The status area: the turn line, or the result, over an invisible copy of the
  // longest result, so it keeps one height and the board below never moves.
  const status = el('div', 'status');
  const turnBox = el('div', 'turn-box');
  const turn = el('p', 'turn');
  const retry = controlButton(t(lang, 'retry'), h.retry, true);
  retry.classList.add('retry');
  turnBox.append(turn, retry);
  const resultBlock = (): { box: HTMLElement; who: HTMLElement; how: HTMLElement; you: HTMLElement } => {
    const box = el('div', 'result');
    const who = el('p', 'shout who');
    const how = el('p', 'how');
    const you = el('p', 'you');
    box.append(who, how, you);
    return { box, who, how, you };
  };
  const { box: result, who, how, you } = resultBlock();
  const sizer = resultBlock();
  sizer.box.className = 'result sizer';
  sizer.box.setAttribute('aria-hidden', 'true');
  const widest = longestResult(lang);
  sizer.who.textContent = widest.who;
  sizer.how.textContent = widest.how;
  sizer.you.textContent = widest.you;
  status.append(sizer.box, turnBox, result);

  const play = el('div', 'play');
  const svg = drawBoard(initial(), { labelRoom: true });
  const grid = el('div', 'cells');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', t(lang, 'board'));
  const cells: HTMLButtonElement[] = [];
  for (const i of SCREEN_ORDER) {
    const b = el('button', 'cell-button');
    b.type = 'button';
    b.dataset.cell = String(i);
    b.addEventListener('click', () => h.cell(i));
    cells[i] = b;
    grid.append(b);
  }
  grid.addEventListener('keydown', h.arrow);
  play.append(svg, boardLabels(), grid);

  const count = choiceGroup<CountValue>({
    label: `${t(lang, 'pieces')}${colon(lang)}`,
    id: 'counts-label',
    choices: (['1', '2', '3'] as const).map((n) => ({ value: n, label: n })),
    onChoose: (n) => h.count(Number(n)),
  });
  count.element.classList.add('counts');

  // Side and level exist in the inline board only; the follow board shows the game.
  const side = choiceGroup<Colour>({
    label: t(lang, 'side'),
    id: 'side-label',
    choices: COLOURS.map((c) => ({ value: c, label: t(lang, colourKey(c)) })),
    onChoose: h.side,
  });
  const level = choiceGroup<Level>({
    label: t(lang, 'level'),
    id: 'level-label',
    choices: LEVELS.map((l) => ({ value: l, label: t(lang, l) })),
    onChoose: h.level,
  });
  // Below the board: the full setup when no game is under way, one summary line
  // during one, then the one « Nouvelle partie ».
  const setup = el('div', 'setup');
  setup.append(side.element, level.element);
  const summary = el('p', 'summary label');
  const newGame = controlButton(t(lang, 'newGame'), h.newGame);
  newGame.dataset.role = 'new-game';
  newGame.addEventListener('blur', h.cancelAbandon);
  const next = el('div', 'next');
  const row = el('div', 'controls');
  row.append(newGame);
  if (mode === 'inline') next.append(setup, summary);
  next.append(row);

  const moves = el('details', 'moves');
  const movesSummary = el('summary', 'label');
  const movesList = el('ol');
  moves.append(movesSummary, movesList);

  const live = el('p', 'sr');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  body.append(status, play, count.element, caption, next);
  // The follow board is the compact one: no move list. Who the opponent is, the inline board's « Précisions » say.
  if (mode === 'inline') body.append(moves);
  root.append(body, live);
  root.addEventListener('keydown', h.key);

  return {
    root,
    body,
    barStatus,
    toggle,
    caption,
    status,
    turn,
    retry,
    result,
    who,
    how,
    you,
    play,
    svg,
    cells,
    count,
    side,
    level,
    setup,
    summary,
    newGame,
    next,
    movesSummary,
    movesList,
    live,
  };
}
