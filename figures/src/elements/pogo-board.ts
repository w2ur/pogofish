// <pogo-board>: the reader plays Pogo against the AlphaZero net. `mode="inline"`
// is the full figure (side, level, new game); `mode="follow"` is the compact
// board bound to the same game, shown once a game is under way and collapsible
// to a bar. Every board shows the store's one game; the driver plays the AI's
// side once for the page. The choices come from board-state.ts, never from
// the DOM.
import {
  announceMove,
  chooseCount,
  counts,
  describeCell,
  destinations,
  neighbour,
  origins,
  resultText,
  tap,
  type CellMark,
  type Selection,
} from '../board-state';
import { createDriver, type Driver } from '../driver';
import { initial, legal, moveName, type Move, type State, type Triple } from '../engine';
import { drawBoard } from '../kit/board-svg';
import { PogoFigure, kitSheet } from '../kit/figure';
import { colon, t, type Lang } from '../kit/strings';
import { SearchClient } from '../search-client';
import { store, type Level, type Store } from '../store';
import boardCss from './pogo-board.css?raw';
import { buildView, colourKey, type CountValue, type Ui } from './pogo-board-view';

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
  /** « Nouvelle partie » was pressed once during a game: the next press abandons it. */
  private confirming = false;
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
    this.ui = buildView(this.lang, this.mode, {
      cell: (i) => this.onCell(i),
      arrow: (e) => this.onArrow(e),
      key: this.onKey,
      count: (n) => this.onCount(n),
      side: (c) => this.deps.store.setReaderColour(c),
      level: (l) => this.deps.store.setLevel(l),
      newGame: () => this.newGame(),
      cancelAbandon: () => {
        if (!this.confirming) return;
        this.confirming = false;
        this.update();
      },
      retry: () => this.deps.driver().retry(),
      toggle: () => {
        this.collapsed = !this.collapsed;
        this.update();
      },
    });
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

  /** With no game under way, starts one; during one, asks first (« Abandonner la partie ? »), then abandons it. */
  private newGame(): void {
    const g = this.deps.store.current();
    if (g && !g.finished && !this.confirming) {
      this.confirming = true;
      this.update();
      // The button's name changes under focus; the live region says it too.
      if (this.ui) this.ui.live.textContent = t(this.lang, 'abandon');
      return;
    }
    this.confirming = false;
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
    if (e.key === 'Escape' && this.confirming) {
      e.preventDefault();
      this.confirming = false;
      this.update();
    } else if (e.key === 'Escape' && this.selection !== null) {
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
    ui.count.element.toggleAttribute('data-off', sel === null);
    ui.count.element.hidden = g === null || g.finished;
    ui.count.buttons.forEach((b, k) => (b.hidden = !available.includes(k + 1)));
    ui.count.set(sel ? (String(sel.count) as CountValue) : null);

    // Status: the result, the AI thinking or failing, or the reader's turn, in one reserved area.
    const result = g ? resultText(lang, g) : null;
    ui.result.hidden = result === null;
    ui.turn.parentElement!.hidden = result !== null;
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
    ui.retry.hidden = status !== 'failed' || result !== null;
    ui.caption.textContent = g?.label ? `${t(lang, 'resumed')}${colon(lang)} ${g.label}` : '';
    ui.caption.hidden = !g?.label;

    // Setup: the choices are for the next game; a game under way keeps its own sides and level.
    const prefs = st.preferences();
    const side = prefs.readerColour;
    const level: Level = prefs.level;
    ui.side.set(side);
    ui.level.set(level);
    // Below the board: the full setup outside a game, one line during one.
    const underWay = g !== null && !g.finished;
    if (!underWay) this.confirming = false;
    ui.setup.hidden = underWay;
    ui.summary.hidden = !underWay;
    ui.summary.textContent = underWay ? `${t(lang, colourKey(g.readerColour))} · ${t(lang, g.level)}` : '';
    ui.newGame.textContent = t(lang, this.confirming ? 'abandon' : 'newGame');
    ui.newGame.classList.toggle('secondary', underWay);
    // The follow board offers a new game only once this one is over.
    ui.newGame.hidden = this.mode === 'follow' && !g?.finished;

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
      labelRoom: true,
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
