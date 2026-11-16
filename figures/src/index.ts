// The entry a page imports. It holds only what every page needs to start: the
// list of tags, one loader per tag, and the lazy-definition logic. Each element
// is its own chunk, imported when the first instance of its tag nears the screen.
import { lazyDefine, type LazyHandle } from './lazy-define';
import { immediate, LOADERS } from './registry';

export { manifest } from './manifest';

let handle: LazyHandle | undefined;

/**
 * Registers every `<pogo-…>` element, each when the first instance of its tag nears
 * the screen (at once without IntersectionObserver), including instances added later;
 * safe to call twice. An element stays undefined, its fallback shown, until then.
 */
export function defineAll(): void {
  if (handle || typeof document === 'undefined') return;
  handle = lazyDefine({ loaders: LOADERS, immediate });
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
