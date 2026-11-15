// <pogo-board>: the reader plays Pogo against the AlphaZero net. `mode="inline"`
// is the full figure (side, level, new game); `mode="follow"` is the compact
// board bound to the same game, shown once a game is under way and collapsible
// to a bar. Every board shows the store's one game; the driver plays the AI's
// side once for the page. The choices come from board-state.ts, never from
// the DOM.
import { NET_NAME } from '../assets';
import {
  SCREEN_ORDER,
  announceMove,
  chooseCount,
  counts,
  describeCell,
  destinations,
  formatStrength,
  neighbour,
  origins,
  resultText,
  tap,
  type CellMark,
  type Selection,
} from '../board-state';
import { createDriver, type Driver } from '../driver';
import { initial, legal, moveName, type Colour, type Move, type State, type Triple } from '../engine';
import { drawBoard } from '../kit/board-svg';
import { controlButton } from '../kit/controls';
import { PogoFigure, kitSheet } from '../kit/figure';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { SearchClient } from '../search-client';
import { LEVELS, store, type Level, type Store } from '../store';
import boardCss from './pogo-board.css?raw';

let sheet: CSSStyleSheet | undefined;
function boardSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(boardCss);
  }
  return sheet;
}

/** Moves already announced, per game: two boards never say a move twice. */
const announced = new WeakMap<State, number>();

let pageDriver: Driver | undefined;

const MOVE_MS = 240;
const COLOURS: readonly Colour[] = ['White', 'Red'];
const colourKey = (c: Colour): StringKey => (c === 'White' ? 'white' : 'red');

interface Ui {
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
  counts: HTMLElement;
  countButtons: HTMLButtonElement[];
  sides: HTMLButtonElement[];
  levels: HTMLButtonElement[];
  /** « Nouvelle partie » under the result. */
  after: HTMLButtonElement;
  /** « Nouvelle partie » in the setup, inline only. */
  start?: HTMLButtonElement;
  movesSummary: HTMLElement;
  movesList: HTMLOListElement;
  live: HTMLElement;
}

export class PogoBoard extends PogoFigure {
  static override fidelity = 'live' as const;
  static override game = 'gameLc12' as const;
  static override stageMinHeight = '560px';

  /** What every board shares; a test swaps them. */
  static deps: { store: Store; driver: () => Driver } = {
    store,
    driver: () => (pageDriver ??= createDriver(store, new SearchClient())),
  };

  private ui: Ui | undefined;
  private selection: Selection = null;
  private focusCell = 0;
  private collapsed = false;
  private seen: { start: State; ply: number } | undefined;
  private drawn = '';

  private get mode(): 'inline' | 'follow' {
    return this.getAttribute('mode') === 'follow' ? 'follow' : 'inline';
  }

  private get deps() {
    return (this.constructor as typeof PogoBoard).deps;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const root = this.shadowRoot!;
    if (!root.adoptedStyleSheets.includes(boardSheet())) root.adoptedStyleSheets = [kitSheet(), boardSheet()];
    if (this.mode !== 'follow') return;
    this.stage.style.setProperty('--_stage-min', '0px');
    const { store: s } = this.deps;
    const sync = (): void => {
      this.toggleAttribute('data-idle', s.current() === null);
    };
    const off = s.on('game', sync);
    this.signal.addEventListener('abort', off, { once: true });
    sync();
    // A game saved before a reload: restoring it is what shows this board.
    if (s.current() === null && s.hasSaved()) s.ready().catch(() => undefined);
  }

  protected async render(signal: AbortSignal): Promise<void> {
    const { store: s } = this.deps;
    await s.ready();
    if (signal.aborted) return;
    const driver = this.deps.driver();
    this.ui = this.build();
    this.stage.append(this.ui.root);
    driver.attach(signal);
    const offGame = s.on('game', () => this.update());
    const offDriver = driver.on(() => this.update());
    signal.addEventListener(
      'abort',
      () => {
        offGame();
        offDriver();
        this.ui = undefined;
        this.drawn = '';
        this.seen = undefined;
      },
      { once: true },
    );
    this.update();
  }

  private build(): Ui {
    const lang = this.lang;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const root = el('div', 'pb');
    root.dataset.mode = this.mode;
    const body = el('div', 'body');
    body.id = 'board-body';

    let barStatus: HTMLElement | undefined;
    let toggle: HTMLButtonElement | undefined;
    if (this.mode === 'follow') {
      const bar = el('div', 'bar');
      barStatus = el('p', 'bar-status label');
      toggle = controlButton(t(lang, 'collapse'), () => {
        this.collapsed = !this.collapsed;
        this.update();
      }, true);
      toggle.setAttribute('aria-controls', body.id);
      bar.append(barStatus, toggle);
      root.append(bar);
    }

    const caption = el('p', 'caption');
    const turn = el('p', 'turn');
    const retry = controlButton(t(lang, 'retry'), () => this.deps.driver().retry(), true);
    retry.classList.add('retry');
    const result = el('div', 'result');
    const who = el('p', 'shout who');
    const how = el('p', 'how');
    const you = el('p', 'you');
    result.append(who, how, you);

    const play = el('div', 'play');
    const svg = drawBoard(initial(), { labels: true });
    const grid = el('div', 'cells');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', t(lang, 'board'));
    const cells: HTMLButtonElement[] = [];
    for (const i of SCREEN_ORDER) {
      const b = el('button', 'cell-button');
      b.type = 'button';
      b.dataset.cell = String(i);
      b.addEventListener('click', () => this.onCell(i));
      cells[i] = b;
      grid.append(b);
    }
    grid.addEventListener('keydown', (e) => this.onArrow(e));
    play.append(svg, grid);

    const countsRow = el('div', 'counts');
    countsRow.setAttribute('role', 'group');
    const countsLabel = el('span', 'label', `${t(lang, 'pieces')}${colon(lang)}`);
    countsLabel.id = 'counts-label';
    countsRow.setAttribute('aria-labelledby', countsLabel.id);
    const countButtons = [1, 2, 3].map((n) => {
      const b = controlButton(String(n), () => this.onCount(n), true);
      b.classList.add('choice');
      b.setAttribute('aria-pressed', 'false');
      return b;
    });
    countsRow.append(countsLabel, ...countButtons);

    const sides: HTMLButtonElement[] = [];
    const levels: HTMLButtonElement[] = [];
    let setup: HTMLElement | undefined;
    let start: HTMLButtonElement | undefined;
    if (this.mode === 'inline') {
      setup = el('div', 'setup');
      const group = (labelKey: StringKey, id: string, buttons: HTMLButtonElement[]): HTMLElement => {
        const g = el('div', 'group');
        g.setAttribute('role', 'group');
        const label = el('span', 'label', t(lang, labelKey));
        label.id = id;
        g.setAttribute('aria-labelledby', id);
        g.append(label, ...buttons);
        return g;
      };
      for (const c of COLOURS) {
        const b = controlButton(t(lang, colourKey(c)), () => this.deps.store.setReaderColour(c), true);
        b.classList.add('choice');
        b.dataset.colour = c;
        sides.push(b);
      }
      for (const level of LEVELS) {
        const b = controlButton(t(lang, level), () => this.deps.store.setLevel(level), true);
        b.classList.add('choice');
        b.dataset.level = level;
        if (level === 'normal') b.append(el('span', 'tag', ` · ${t(lang, 'measured')}`));
        levels.push(b);
      }
      start = controlButton(t(lang, 'newGame'), () => this.newGame());
      start.dataset.role = 'new-game';
      const row = el('div', 'controls');
      row.append(start);
      setup.append(group('side', 'side-label', sides), group('level', 'level-label', levels), row);
    }
    // At the end of a game the result is followed by its own « Nouvelle partie »;
    // the setup's one gives way, so only one is ever shown.
    const after = controlButton(t(lang, 'newGame'), () => this.newGame());
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
    body.append(caption, status, result, play, countsRow);
    if (setup) body.append(setup);
    body.append(moves);
    if (this.mode === 'inline') {
      body.append(
        el('p', 'note', `${t(lang, 'net')} ${NET_NAME}. ${t(lang, 'netScore')} ${formatStrength(lang)} ${t(lang, 'netAgainst')}`),
      );
    }
    root.append(body, live);
    root.addEventListener('keydown', this.onKey);

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
      counts: countsRow,
      countButtons,
      sides,
      levels,
      after,
      start,
      movesSummary,
      movesList,
      live,
    };
  }

  private newGame(): void {
    const { readerColour, level } = this.deps.store.preferences();
    this.deps.store.newGame(readerColour, level);
  }

  /** The position shown and whether the reader may act on it now. */
  private view(): { s: State; moves: Move[]; readerTurn: boolean } {
    const g = this.deps.store.current();
    const s = g ? g.states[g.states.length - 1]! : initial();
    // The driver searches only on the AI's turn, so the reader's turn is never a thinking one.
    const readerTurn = g !== null && !g.finished && s.to_move === g.readerColour;
    return { s, moves: readerTurn ? legal(s) : [], readerTurn };
  }

  private onCell(i: number): void {
    this.focusCell = i;
    const { moves } = this.view();
    if (moves.length === 0) return;
    const r = tap(this.selection, moves, i);
    if ('play' in r) {
      this.selection = null;
      this.deps.store.play(r.play);
      return;
    }
    this.selection = r.selection;
    this.update();
  }

  private onCount(n: number): void {
    const { moves } = this.view();
    this.selection = chooseCount(this.selection, moves, n);
    this.update();
  }

  private onArrow(e: KeyboardEvent): void {
    const from = Number((e.target as HTMLElement).dataset.cell ?? this.focusCell);
    const to = neighbour(from, e.key);
    if (to === from && !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    this.focusCell = to;
    this.syncFocus();
    this.ui?.cells[to]?.focus();
  }

  /** 1/2/3 choose the count, Escape puts the stack down; anywhere in the board. */
  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.selection !== null) {
      e.preventDefault();
      this.selection = null;
      this.update();
    } else if (['1', '2', '3'].includes(e.key) && this.selection !== null) {
      e.preventDefault();
      this.onCount(Number(e.key));
    }
  };

  private syncFocus(): void {
    this.ui?.cells.forEach((b, i) => (b.tabIndex = i === this.focusCell ? 0 : -1));
  }

  private update(): void {
    const ui = this.ui;
    if (!ui) return;
    const lang = this.lang;
    const { store: st } = this.deps;
    const driver = this.deps.driver();
    const g = st.current();
    const status = driver.status();
    const { s, moves, readerTurn } = this.view();

    // A new position puts down whatever was lifted.
    const ply = g?.moves.length ?? 0;
    const moved = g !== null && this.seen?.start === g.start && ply === this.seen.ply + 1;
    if (!g || this.seen?.start !== g.start || this.seen.ply !== ply) this.selection = null;
    if (this.selection && !origins(moves).includes(this.selection.from)) this.selection = null;
    this.seen = g ? { start: g.start, ply } : undefined;

    this.draw(g?.moves[ply - 1], moves, moved);
    this.drawCells(s, moves);

    // Count chooser: only the counts that can move, the chosen one pressed.
    const sel = this.selection;
    const available = sel ? counts(moves, sel.from) : [];
    // Kept (hidden) through the game, so lifting a stack never shifts the page; gone outside one.
    ui.counts.toggleAttribute('data-off', sel === null);
    ui.counts.hidden = g === null || g.finished;
    ui.countButtons.forEach((b, k) => {
      b.hidden = !available.includes(k + 1);
      b.setAttribute('aria-pressed', String(sel?.count === k + 1));
    });

    // Status: the result, the AI thinking or failing, or the reader's turn.
    const result = g ? resultText(lang, g) : null;
    ui.result.hidden = result === null;
    if (result) {
      ui.who.textContent = result.who;
      ui.how.textContent = result.how;
      ui.you.textContent = result.you;
    }
    let line = '';
    if (!g) line = t(lang, 'chooseSide');
    else if (result) line = '';
    else if (status === 'failed') line = t(lang, 'searchFailed');
    else if (!readerTurn) line = t(lang, 'thinking');
    else line = `${t(lang, 'yourTurn')} · ${t(lang, colourKey(g.readerColour))}`;
    ui.turn.textContent = line;
    ui.turn.hidden = this.mode === 'follow' || result !== null;
    ui.retry.hidden = status !== 'failed' || result !== null;
    ui.caption.textContent = g?.label ? `${t(lang, 'resumed')}${colon(lang)} ${g.label}` : '';
    ui.caption.hidden = !g?.label;

    // Setup: what the current game is played with, else what the next will be.
    const prefs = st.preferences();
    const side = g && !g.finished ? g.readerColour : prefs.readerColour;
    const level: Level = g && !g.finished ? g.level : prefs.level;
    ui.sides.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.colour === side)));
    ui.levels.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === level)));
    if (ui.start) ui.start.hidden = g?.finished === true;

    // Follow bar: whose turn, collapsible.
    if (ui.barStatus && ui.toggle) {
      ui.barStatus.textContent = result ? result.who : line;
      ui.toggle.textContent = t(lang, this.collapsed ? 'expand' : 'collapse');
      ui.toggle.setAttribute('aria-expanded', String(!this.collapsed));
      ui.body.hidden = this.collapsed;
      this.toggleAttribute('data-collapsed', this.collapsed);
    }

    // The moves so far, as text.
    const list = g?.moves ?? [];
    ui.movesSummary.textContent = `${t(lang, 'movesPlayed')} (${list.length})`;
    ui.movesList.replaceChildren(
      ...list.map((m, i) => {
        const li = document.createElement('li');
        li.textContent = `${t(lang, colourKey(g!.states[i]!.to_move))} ${moveName(m)}`;
        return li;
      }),
    );

    this.announce(lang);
    const last = driver.lastSearch();
    if (last) {
      this.dataset.search = last.via;
      this.dataset.thinkMs = String(Math.round(last.ms));
    }
    this.repairFocus();
  }

  /** Redraws the SVG only when what it shows changed, so a running move animation is not cut. */
  private draw(last: Triple | undefined, moves: Move[], moved: boolean): void {
    const ui = this.ui!;
    const g = this.deps.store.current();
    const s = g ? g.states[g.states.length - 1]! : initial();
    const marks: { cell: number; kind: 'target' | 'picked' }[] = [];
    if (this.selection) {
      marks.push({ cell: this.selection.from, kind: 'picked' });
      for (const c of destinations(moves, this.selection.from, this.selection.count)) marks.push({ cell: c, kind: 'target' });
    } else {
      for (const c of origins(moves)) marks.push({ cell: c, kind: 'target' });
    }
    const key = JSON.stringify([s.cells, last, marks]);
    if (key === this.drawn) return;
    this.drawn = key;
    const svg = drawBoard(s, {
      labels: true,
      marks,
      ...(last ? { to: last[2], moving: last[1] } : {}),
    });
    const before = ui.svg;
    before.replaceWith(svg);
    ui.svg = svg;
    if (moved && last && !this.reducedMotion()) this.animateMove(before, svg, last);
  }

  /** The moved discs travel from where they stood to where they land. */
  private animateMove(before: SVGSVGElement, after: SVGSVGElement, [from, n]: Triple): void {
    const left = [...before.querySelectorAll<SVGCircleElement>(`.stack[data-cell="${from}"] .disc`)].slice(-n);
    const landed = [...after.querySelectorAll<SVGCircleElement>('.disc.moved')];
    landed.forEach((disc, k) => {
      const old = left[k];
      if (!old || typeof disc.animate !== 'function') return;
      const dx = Number(old.getAttribute('cx')) - Number(disc.getAttribute('cx'));
      const dy = Number(old.getAttribute('cy')) - Number(disc.getAttribute('cy'));
      // The cut-out before the disc and the ink ring after it travel with it.
      for (const node of [disc.previousElementSibling, disc, disc.nextElementSibling]) {
        (node as SVGElement | null)?.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
          { duration: MOVE_MS, easing: 'ease-out' },
        );
      }
    });
  }

  private drawCells(s: State, moves: Move[]): void {
    const ui = this.ui!;
    const lang = this.lang;
    const sel = this.selection;
    const lift = origins(moves);
    const land = sel ? destinations(moves, sel.from, sel.count) : [];
    ui.cells.forEach((b, i) => {
      let mark: CellMark = null;
      if (sel?.from === i) mark = 'selected';
      else if (land.includes(i)) mark = 'target';
      else if (!sel && lift.includes(i)) mark = 'can-lift';
      const actionable = sel ? mark !== null || lift.includes(i) : mark === 'can-lift';
      b.setAttribute('aria-label', describeCell(lang, s, i, mark));
      b.toggleAttribute('data-actionable', actionable);
      b.setAttribute('aria-disabled', String(!actionable));
    });
    this.syncFocus();
  }

  /** Says each new move, then the result, in the live region of the first board to see it. */
  private announce(lang: Lang): void {
    const ui = this.ui!;
    const g = this.deps.store.current();
    if (!g) return;
    const done = announced.get(g.start);
    if (done === undefined) {
      // A game first seen (new, taken up or restored) is not read back move by move.
      announced.set(g.start, g.moves.length);
      if (g.label) ui.live.textContent = `${t(lang, 'resumed')}${colon(lang)} ${g.label}`;
      return;
    }
    if (g.moves.length <= done) return;
    const said = g.moves.slice(done).map((m, k) => announceMove(lang, g.states[done + k]!.to_move, m));
    const result = resultText(lang, g);
    if (result) said.push(`${result.who}. ${result.how}`);
    announced.set(g.start, g.moves.length);
    ui.live.textContent = said.join('. ');
  }

  /** A control that had focus and went away hands it to the board. */
  private repairFocus(): void {
    const ui = this.ui!;
    const active = this.shadowRoot?.activeElement as HTMLElement | null;
    if (!active) return;
    const gone = active.closest('[hidden], [data-off]') !== null || (active as HTMLButtonElement).disabled === true;
    if (!gone) return;
    if (ui.body.hidden) ui.toggle?.focus();
    else ui.cells[this.focusCell]?.focus();
  }
}
