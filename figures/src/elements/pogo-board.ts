// <pogo-board>: the reader plays Pogo against the AlphaZero net. `mode="inline"`
// is the full figure; `mode="follow"` is the page's board, compact and bound to
// the same game: an opaque panel the page fixes to a corner, shown once a game is
// under way or once the page calls open(), in three sizes the reader chooses
// (open, a bar, a dot), closable, and hidden while an inline board is on screen
// (follow-panel.ts). Both offer side and level before each game, and « Nouvelle
// partie » asks once before abandoning one, which then leaves the setup for the
// next. Every board shows the store's one game; the driver plays the AI's side
// once for the page. The reader takes pieces as on every board of the page
// (kit/take-pieces.ts); the choices come from board-state.ts, never from the DOM.
import { announceMove, resultText } from '../board-state';
import { createDriver, type Driver } from '../driver';
import { escapeAction, followShown, watchInlineBoards, type FollowSize, type ObserverCtor } from '../follow-panel';
import { initial, legal, type Move, type State, type Triple } from '../engine';
import { animateMove, drawBoard } from '../kit/board-svg';
import { PogoFigure, kitSheet } from '../kit/figure';
import { moveText, moveTip } from '../kit/move-tip';
import { colon, t, type Lang } from '../kit/strings';
import { takePieces, type TakePieces } from '../kit/take-pieces';
import { SearchClient } from '../search-client';
import { store, type Level, type Store } from '../store';
import boardCss from './pogo-board.css?raw';
import { buildView, colourKey, stamp, type Ui } from './pogo-board-view';

let sheet: CSSStyleSheet | undefined;
function boardSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(boardCss);
  }
  return sheet;
}

/**
 * Moves already announced, per game: two boards never say a move twice. Only a
 * board that is shown claims them, so a move is never said into a hidden region.
 */
const announced = new WeakMap<State, number>();

let pageDriver: Driver | undefined;

export class PogoBoard extends PogoFigure {
  static override stageMinHeight = '560px';

  /** What every board shares; a test swaps them. */
  static deps: { store: Store; driver: () => Driver; observer?: ObserverCtor } = {
    store,
    driver: () => (pageDriver ??= createDriver(store, new SearchClient())),
  };

  private ui: Ui | undefined;
  /** The lifted stack, the squares' buttons and the count chooser: the page's one way to take pieces. */
  private take: TakePieces | undefined;
  /** A follow board: whether an inline board of the document is on screen. */
  private inlineOnScreen = false;
  /** « Nouvelle partie » was pressed once during a game: the next press abandons it. */
  private confirming = false;
  private seen: { start: State; ply: number } | undefined;
  /** The game and ply this board last heard, shown or not: a board that shows again never reads back what it heard hidden. */
  private heard: { start: State; ply: number } | undefined;
  private drawn = '';
  /** A follow board the page opened (open()), or whose game the reader abandoned: shown with no game. */
  private summoned = false;
  /** open() was called before the board was drawn: focus goes in once it is. */
  private focusWhenDrawn = false;

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
    const sync = (): void => this.syncPanel();
    const inline = watchInlineBoards(
      this.ownerDocument,
      (on) => {
        this.inlineOnScreen = on;
        sync();
      },
      this.deps.observer,
    );
    const off = s.on('game', () => {
      inline.rescan();
      sync();
    });
    // Focus leaving the panel may let it give way at last; activeElement settles after the event.
    const onFocusOut = (): void => void queueMicrotask(sync);
    this.addEventListener('focusout', onFocusOut);
    this.signal.addEventListener(
      'abort',
      () => {
        off();
        inline.disconnect();
        this.inlineOnScreen = false;
        this.removeEventListener('focusout', onFocusOut);
      },
      { once: true },
    );
    sync();
    // A game saved before a reload: restoring it is what shows this board.
    if (s.current() === null && s.hasSaved()) s.ready().catch(() => undefined);
  }

  /**
   * Shows the board and moves focus into it. A follow board is shown even with no game
   * under way (it then offers the setup), unclosed and open; focus goes to the setup, or
   * to the board during a game. Before the board is drawn, focus goes in once it is.
   */
  open(): void {
    if (this.mode === 'follow') {
      const { store: s } = this.deps;
      this.summoned = true;
      s.setFollowClosed(false);
      s.setFollowSize('open');
      this.syncPanel();
      // The engine, and a saved game with it, as early as possible: render waits for them.
      s.ready().catch(() => undefined);
    }
    if (!this.ui) {
      this.focusWhenDrawn = true;
      return;
    }
    this.update();
    this.focusInside();
  }

  /** Whether a follow board shows, and how big: its host attributes, read by its sheet and the page. */
  private syncPanel(): void {
    if (this.mode !== 'follow') return;
    const s = this.deps.store;
    const game = s.current() !== null;
    const closed = s.followClosed();
    // Out of the page with nothing to show, or closed by the reader.
    const idle = closed || (!game && !this.summoned);
    this.toggleAttribute('data-idle', idle);
    this.toggleAttribute('data-closed', closed);
    // Out of the page while an inline board is on screen, unless focus is inside it.
    const focusInside = this.shadowRoot!.activeElement !== null;
    this.toggleAttribute(
      'data-yield',
      !idle && !followShown({ game, summoned: this.summoned, closed, inlineOnScreen: this.inlineOnScreen, focusInside }),
    );
    this.dataset.size = s.followSize();
  }

  /** Focus into the board: the setup with no game under way, else the board's cells. */
  private focusInside(): void {
    const ui = this.ui;
    if (!ui) return;
    const g = this.deps.store.current();
    if (!g || g.finished) {
      const stop = ui.side.buttons.find((b) => b.tabIndex === 0) ?? ui.side.buttons[0];
      stop?.focus();
      return;
    }
    this.take?.focus();
  }

  private setSize(size: FollowSize): void {
    this.deps.store.setFollowSize(size);
    this.update();
    const panel = this.ui?.panel;
    if (!panel) return;
    // Shrunk to its dot, the board keeps focus on it, pressed by a click that focused nothing (Safari) or by a key.
    // Any other control that went away hands focus on in update() (repairFocus).
    if (size === 'dot') panel.dot.focus();
  }

  protected async render(signal: AbortSignal): Promise<void> {
    const { store: s } = this.deps;
    await s.ready();
    if (signal.aborted) return;
    const driver = this.deps.driver();
    // No `keys`: Escape does more on this board (onKey), which routes 1/2/3 and the put-down itself.
    const take = takePieces({
      lang: this.lang,
      id: 'counts-label',
      state: () => this.view().s,
      moves: () => this.view().moves,
      onPlay: (move) => this.deps.store.play(move),
      onChange: () => this.update(),
    });
    this.take = take;
    this.ui = buildView(this.lang, this.mode, {
      key: this.onKey,
      side: (c) => this.deps.store.setReaderColour(c),
      level: (l) => this.deps.store.setLevel(l),
      newGame: () => this.newGame(),
      cancelAbandon: () => {
        if (!this.confirming) return;
        this.confirming = false;
        this.update();
      },
      retry: () => this.deps.driver().retry(),
      toggle: () => this.setSize(this.deps.store.followSize() === 'open' ? 'bar' : 'open'),
      toDot: () => this.setSize('dot'),
      reopen: () => this.setSize('open'),
      close: () => {
        this.summoned = false;
        this.deps.store.setFollowClosed(true);
        this.update();
      },
    }, take);
    this.stage.append(this.ui.root);
    const ui = this.ui;
    // A press anywhere else in the board puts the abandon question away.
    ui.root.addEventListener('pointerdown', (e) => {
      if (!this.confirming || e.composedPath().includes(ui.newGame)) return;
      this.confirming = false;
      this.update();
    });
    driver.attach(signal);
    const offGame = s.on('game', () => this.update());
    const offDriver = driver.on(() => this.update());
    signal.addEventListener(
      'abort',
      () => {
        offGame();
        offDriver();
        this.ui = undefined;
        this.take = undefined;
        this.drawn = '';
        this.seen = undefined;
        this.heard = undefined;
      },
      { once: true },
    );
    this.update();
    if (this.focusWhenDrawn) {
      this.focusWhenDrawn = false;
      this.focusInside();
    }
  }

  /**
   * With no game under way, starts one. During one, asks first (« Abandonner la
   * partie ? »), then abandons it: no game starts, so side and level can be chosen
   * before the next (a follow board stays shown for that).
   */
  private newGame(): void {
    const g = this.deps.store.current();
    if (g && !g.finished) {
      if (!this.confirming) {
        this.confirming = true;
        this.update();
        // The button's name changes under focus; the live region says it too.
        if (this.ui) this.ui.live.textContent = t(this.lang, 'abandon');
        return;
      }
      this.confirming = false;
      if (this.mode === 'follow') this.summoned = true;
      this.deps.store.abandon();
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

  /** 1/2/3 choose the count; Escape puts the question, then the stack, away, then folds a follow board. Anywhere in the board. */
  private onKey = (e: KeyboardEvent): void => {
    const lifted = (this.take?.selection() ?? null) !== null;
    const escape =
      e.key === 'Escape'
        ? escapeAction({
            confirming: this.confirming,
            lifted: lifted,
            follow: this.mode === 'follow',
            size: this.deps.store.followSize(),
          })
        : 'none';
    if (escape === 'keep-game') {
      e.preventDefault();
      this.confirming = false;
      this.update();
    } else if (escape === 'put-down') {
      e.preventDefault();
      this.take?.putDown();
      this.update();
    } else if (escape === 'fold') {
      // Folding hides the body: repairFocus() hands focus to the toggle if it was there.
      e.preventDefault();
      this.deps.store.setFollowSize('bar');
      this.update();
    } else if (['1', '2', '3'].includes(e.key) && lifted) {
      e.preventDefault();
      this.take?.count(Number(e.key));
    }
  };

  private update(): void {
    const ui = this.ui;
    const take = this.take;
    if (!ui || !take) return;
    const lang = this.lang;
    const { store: st } = this.deps;
    const driver = this.deps.driver();
    const g = st.current();
    const status = driver.status();
    const { readerTurn } = this.view();

    const ply = g?.moves.length ?? 0;
    const moved = g !== null && this.seen?.start === g.start && ply === this.seen.ply + 1;
    // A new position puts down whatever was lifted, and the abandon question with it:
    // blur alone cannot clear it where a click does not focus a button (Safari, Firefox on Mac).
    if (!g || this.seen?.start !== g.start || this.seen.ply !== ply) {
      take.putDown();
      this.confirming = false;
    }
    this.seen = g ? { start: g.start, ply } : undefined;

    this.draw(g?.moves[ply - 1], moved);
    // The squares' names and the count chooser: only the counts that can move, the chosen one pressed.
    take.sync();
    // The chooser's line is kept (off) through the game, so lifting a stack never shifts the page; gone outside one.
    ui.count.element.hidden = g === null || g.finished;

    // Status: the result, the AI thinking or failing, or the reader's turn, in one reserved area.
    const result = g ? resultText(lang, g) : null;
    ui.result.hidden = result === null;
    ui.turn.parentElement!.hidden = result !== null;
    if (result) {
      ui.who.textContent = stamp(result.you);
      ui.how.textContent = result.how;
    }
    let line = '';
    if (!g) line = t(lang, 'chooseSide');
    else if (result) line = '';
    else if (status === 'failed') line = t(lang, 'searchFailed');
    else if (!readerTurn) line = t(lang, 'thinking');
    else line = `${t(lang, 'yourTurn')} · ${t(lang, colourKey(g.readerColour))}`;
    ui.turn.textContent = line;
    ui.retry.hidden = status !== 'failed' || result !== null;
    ui.caption.replaceChildren(...moveText(lang, g?.label ? `${t(lang, 'resumed')}${colon(lang)} ${g.label}` : ''));
    // The follow board is compact: the inline board and the live region say where the position came from.
    ui.caption.hidden = !g?.label || this.mode === 'follow';

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
    // The compact board says the turn in its bar.
    if (this.mode === 'follow') ui.status.hidden = true;

    // Follow bar: whose turn, and the reader's size, which no move changes.
    const panel = ui.panel;
    if (panel) {
      const size = st.followSize();
      // The colour stays with its separator when the narrow bar wraps the line.
      panel.status.textContent = result ? result.who : line.replace(' · ', '\u00a0· ');
      panel.toggle.textContent = t(lang, size === 'open' ? 'collapse' : 'expand');
      panel.toggle.setAttribute('aria-expanded', String(size === 'open'));
      ui.body.hidden = size !== 'open';
      panel.bar.hidden = size === 'dot';
      panel.dot.hidden = size !== 'dot';
      ui.root.dataset.size = size;
      this.syncPanel();
    }

    // The moves so far, as text.
    const list = g?.moves ?? [];
    ui.movesSummary.textContent = `${t(lang, 'movesPlayed')} (${list.length})`;
    ui.movesList.replaceChildren(
      ...list.map((m, i) => {
        const li = document.createElement('li');
        li.append(`${t(lang, colourKey(g!.states[i]!.to_move))} `, moveTip(lang, m));
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
  private draw(last: Triple | undefined, moved: boolean): void {
    const ui = this.ui!;
    const g = this.deps.store.current();
    const s = g ? g.states[g.states.length - 1]! : initial();
    const marks = this.take!.marks();
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
    if (moved && last && !this.reducedMotion()) animateMove(before, svg, last);
  }

  /**
   * Whether this board is on screen to be heard: not a follow board giving way or
   * waiting, not inside a hidden container. Read once per game event, never in a loop.
   */
  private shown(): boolean {
    if (this.hasAttribute('data-yield') || this.hasAttribute('data-idle')) return false;
    return typeof this.checkVisibility === 'function' ? this.checkVisibility() : true;
  }

  /**
   * Says each new move, then the result, in the live region of the first shown board
   * to see it. A board not shown claims nothing; what it heard meanwhile it never says
   * later, and a move made while no board is shown is said by none.
   */
  private announce(lang: Lang): void {
    const ui = this.ui!;
    const g = this.deps.store.current();
    if (!g) return;
    const heard = this.heard?.start === g.start ? this.heard.ply : g.moves.length;
    this.heard = { start: g.start, ply: g.moves.length };
    if (!this.shown()) return;
    const claimed = announced.get(g.start);
    if (claimed === undefined) {
      // A game first seen (new, taken up or restored) is not read back move by move.
      announced.set(g.start, g.moves.length);
      if (g.label) ui.live.textContent = `${t(lang, 'resumed')}${colon(lang)} ${g.label}`;
      return;
    }
    const done = Math.max(claimed, heard);
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
    if (ui.panel && !ui.panel.dot.hidden) ui.panel.dot.focus();
    else if (ui.body.hidden) ui.panel?.toggle.focus();
    else this.take?.focus();
  }
}
