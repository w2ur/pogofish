// The DOM of <pogo-board>, built once per render: it holds no state and makes no
// decision. pogo-board.ts owns the state and fills these nodes in update().
import { NET_NAME } from '../assets';
import { SCREEN_ORDER, formatStrength } from '../board-state';
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
  /** « Nouvelle partie » under the result. */
  after: HTMLButtonElement;
  /** « Nouvelle partie » in the setup, inline only. */
  start?: HTMLButtonElement;
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
  newGame(): void;
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
    barStatus = el('p', 'bar-status label');
    toggle = controlButton(t(lang, 'collapse'), h.toggle, true);
    toggle.setAttribute('aria-controls', body.id);
    bar.append(barStatus, toggle);
    root.append(bar);
  }

  const caption = el('p', 'caption');
  const turn = el('p', 'turn');
  const retry = controlButton(t(lang, 'retry'), h.retry, true);
  retry.classList.add('retry');
  const result = el('div', 'result');
  const who = el('p', 'shout who');
  const how = el('p', 'how');
  const you = el('p', 'you');
  result.append(who, how, you);

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
    choices: LEVELS.map((l) => ({ value: l, label: t(lang, l), ...(l === 'normal' ? { note: t(lang, 'measured') } : {}) })),
    onChoose: h.level,
  });
  let setup: HTMLElement | undefined;
  let start: HTMLButtonElement | undefined;
  if (mode === 'inline') {
    setup = el('div', 'setup');
    start = controlButton(t(lang, 'newGame'), h.newGame);
    start.dataset.role = 'new-game';
    const row = el('div', 'controls');
    row.append(start);
    setup.append(side.element, level.element, row);
  }
  // At the end of a game the result is followed by its own « Nouvelle partie »;
  // the setup's one gives way, so only one is ever shown.
  const after = controlButton(t(lang, 'newGame'), h.newGame);
  after.classList.add('after');
  after.dataset.role = 'new-game';
  const afterRow = el('div', 'controls');
  afterRow.append(after);
  result.append(afterRow);

  const moves = el('details', 'moves');
  const movesSummary = el('summary', 'label');
  const movesList = el('ol');
  moves.append(movesSummary, movesList);

  const live = el('p', 'sr');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  const status = el('div', 'status');
  status.append(turn, retry);
  body.append(caption, status, result, play, count.element);
  if (setup) body.append(setup);
  body.append(moves);
  if (mode === 'inline') {
    body.append(
      el('p', 'note', `${t(lang, 'net')} ${NET_NAME}. ${t(lang, 'netScore')} ${formatStrength(lang)} ${t(lang, 'netAgainst')}`),
    );
  }
  root.append(body, live);
  root.addEventListener('keydown', h.key);

  return {
    root,
    body,
    barStatus,
    toggle,
    caption,
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
    after,
    start,
    movesSummary,
    movesList,
    live,
  };
}
