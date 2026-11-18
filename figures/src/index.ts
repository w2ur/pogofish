// The entry a page imports. It holds only what every page needs to start: the
// list of tags, one loader per tag, and the lazy-definition logic. Each element
// is its own chunk, imported when the first instance of its tag nears the screen.
import { lazyDefine, type LazyHandle } from './lazy-define';
import { LOADERS, when } from './registry';

export { manifest } from './manifest';

let handle: LazyHandle | undefined;

/**
 * Registers every `<pogo-…>` element, each when the first instance of its tag nears
 * the screen (at once without IntersectionObserver), including instances added later;
 * safe to call twice. An element stays undefined, its fallback shown, until then.
 */
export function defineAll(): void {
  if (handle || typeof document === 'undefined') return;
  const h = (handle = lazyDefine({ loaders: LOADERS, when }));
  // A figure hands the board a position: the store (in the kit) takes the game, and a
  // follow board waiting for its first game is defined to show it.
  document.addEventListener('pogo:playfrom', () => h.wake('pogo-board'));
}

/**
 * Opens the page's board: the follow board if the page has one, else the first board.
 * A follow board with no game waits undefined (registry.ts), so this asks for its module
 * first, then calls its open(): what the essay's « vous pouvez jouer ici » does.
 * Resolves true once a board was opened; false, never pending, when none can be: no
 * board on the page, defineAll() never called, or the board's module failed to load.
 */
export async function openBoard(): Promise<boolean> {
  if (typeof document === 'undefined' || !document.querySelector('pogo-board')) return false;
  if (!customElements.get('pogo-board')) {
    const h = handle;
    if (!h) return false;
    h.wake('pogo-board');
    // Every import started so far has settled by then, the board's included: defined, or failed for good.
    await Promise.race([customElements.whenDefined('pogo-board'), h.settled()]);
    if (!customElements.get('pogo-board')) return false;
  }
  const board = document.querySelector('pogo-board[mode="follow"]') ?? document.querySelector('pogo-board');
  const open = (board as (Element & { open?: () => void }) | null)?.open;
  if (!board || !open) return false;
  open.call(board);
  return true;
}

/** Imports and defines every element now, whatever the page holds: the eager path, for tests and tools. */
export async function loadAll(): Promise<void> {
  await Promise.all(
    Object.entries(LOADERS).map(async ([tag, load]) => {
      const ctor = await load();
      if (!customElements.get(tag)) customElements.define(tag, ctor);
    }),
  );
}

export * from './engine';
