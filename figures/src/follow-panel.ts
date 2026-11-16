// What the follow board (<pogo-board mode="follow">) decides about itself, apart
// from the board: whether it is open or folded to its bar, whether it is shown
// at all, and what Escape does. It is a small panel fixed to a corner of the
// page, so it starts folded, opens only when the reader asks for a board, and
// gives way to an inline board on screen.
//
// Open or folded is the reader's choice and lasts for the page's session: the
// store keeps it in its storage record, beside the saved game (store.ts), so a
// reload restores it, and a follow board defined late (woken by a figure's
// « Jouer d’ici ») finds the state the event already set. Moves and the AI's
// replies never change it.

/** How a game started: on a board (inline, or the follow board's own « Nouvelle partie »), or from a figure's « Jouer d’ici ». */
export type FollowStart = 'board' | 'figure';

/** Folded until the reader opens it, or a figure hands a position over. */
export const FOLLOW_OPEN_DEFAULT = false;

/**
 * Whether the follow board is open once a game starts. A figure's « Jouer d’ici »
 * opens it: the reader asked for a board and may be far from the inline one. A
 * game started on a board keeps the reader's last choice (folded by default).
 */
export function openAtStart(open: boolean, how: FollowStart): boolean {
  return how === 'figure' ? true : open;
}

/**
 * Whether the follow board is shown. Not without a game; not while an inline board
 * of the same document is on screen (two boards of one game side by side are noise),
 * unless focus is inside it: hiding a focused panel would move focus by itself.
 */
export function followShown(o: { game: boolean; inlineOnScreen: boolean; focusInside: boolean }): boolean {
  if (!o.game) return false;
  return !o.inlineOnScreen || o.focusInside;
}

export type EscapeAction = 'keep-game' | 'put-down' | 'fold' | 'none';

/**
 * What Escape does, nearest first: it puts away the abandon question, then a
 * lifted stack, then, on an open follow board, folds it. Folded, it does nothing.
 */
export function escapeAction(o: { confirming: boolean; lifted: boolean; follow: boolean; open: boolean }): EscapeAction {
  if (o.confirming) return 'keep-game';
  if (o.lifted) return 'put-down';
  if (o.follow && o.open) return 'fold';
  return 'none';
}

/** The IntersectionObserver constructor; a test passes its own. */
export type ObserverCtor = new (cb: IntersectionObserverCallback, init?: IntersectionObserverInit) => IntersectionObserver;

export interface InlineWatch {
  /** Whether any watched inline board is on screen now. */
  onScreen(): boolean;
  /** Watches inline boards added to the document since; cheap (one query, no layout read). */
  rescan(): void;
  disconnect(): void;
}

/**
 * Watches every inline <pogo-board> of `doc` with one IntersectionObserver and
 * calls `onChange` when whether any is on screen changes. No layout is read: the
 * observer reports. With no inline board, nothing is ever on screen.
 */
export function watchInlineBoards(doc: Document, onChange: (onScreen: boolean) => void, Observer?: ObserverCtor): InlineWatch {
  const Ctor = Observer ?? (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined);
  const visible = new Set<Element>();
  const watched = new Set<Element>();
  let was = false;
  const report = (): void => {
    const now = visible.size > 0;
    if (now === was) return;
    was = now;
    onChange(now);
  };
  const io = Ctor
    ? new Ctor((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target.isConnected) visible.add(e.target);
          else visible.delete(e.target);
        }
        report();
      })
    : undefined;
  const rescan = (): void => {
    if (!io) return;
    // A board that left the document is on screen no more.
    for (const el of watched) {
      if (el.isConnected) continue;
      io.unobserve(el);
      watched.delete(el);
      visible.delete(el);
    }
    report();
    for (const el of doc.querySelectorAll('pogo-board:not([mode="follow"])')) {
      if (watched.has(el)) continue;
      watched.add(el);
      io.observe(el);
    }
  };
  rescan();
  return {
    onScreen: () => was,
    rescan,
    disconnect() {
      io?.disconnect();
      watched.clear();
      visible.clear();
    },
  };
}
