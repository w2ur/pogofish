// Lazy definition, the DOM half: watches the document for instances of each
// tag, imports a tag's module when its first instance nears the screen, and
// defines the class. Until then the element shows its light-DOM children (the
// page styles them under `:not(:defined)`); an import that fails leaves them in
// place for good, and so does a class that cannot be defined. lazy-plan.ts decides
// what to import; this file only observes.
//
// What stays connected: the IntersectionObserver watches only the instances whose
// tag is still waiting, and lets go of an instance once its tag is requested or once
// it leaves the document. The MutationObserver stays connected for as long as any
// tag is still waiting, because an instance can be added at any time (a later render,
// a tab built on demand); on a page that lacks one of the tags that is the page's
// whole life. Its work is kept small: it looks only for the tags still waiting.
import { LazyPlan } from './lazy-plan';
import type { Loader } from './registry';

export interface LazyOptions {
  loaders: Readonly<Record<string, Loader>>;
  /** Where instances are looked for: the document by default. */
  root?: Document;
  /**
   * When an instance's tag is imported: `now`, without waiting for the viewport;
   * `approach` (the default), when it nears the screen; `wait`, only on `wake()`.
   */
  when?: (el: Element) => When;
  /**
   * How far ahead of the viewport a tag is imported. Twice the kit's own render
   * margin (figure.ts, 50%): the class is in place before the figure would render.
   */
  rootMargin?: string;
  /** Called once per tag whose import failed. */
  onError?: (tag: string, error: unknown) => void;
}

export type When = 'now' | 'approach' | 'wait';

export interface LazyHandle {
  /** Imports `tag` now if an instance of it is in the document and its module was never requested. */
  wake(tag: string): void;
  /** Resolves when every import started so far has settled; for tests and the harness. */
  settled(): Promise<void>;
  stop(): void;
}

export function lazyDefine(o: LazyOptions): LazyHandle {
  const root = o.root ?? document;
  const tags = Object.keys(o.loaders);
  const plan = new LazyPlan(tags, (tag) => customElements.get(tag) !== undefined);
  const watched = new Map<string, Set<Element>>();
  const inFlight = new Set<Promise<void>>();
  const onError =
    o.onError ??
    ((tag: string, error: unknown) => console.warn(`pogo-figures: <${tag}> could not load; its fallback stays`, error));
  const fail = (tag: string, error: unknown): void => {
    plan.settle(tag, false);
    onError(tag, error);
  };

  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => load(entries.filter((e) => e.isIntersecting).map((e) => e.target.localName)),
          { rootMargin: o.rootMargin ?? '100%' },
        )
      : undefined;

  const unwatch = (tag: string): void => {
    for (const el of watched.get(tag) ?? []) io?.unobserve(el);
    watched.delete(tag);
  };

  function load(approached: string[]): void {
    for (const tag of plan.take(approached)) {
      unwatch(tag);
      const run = o.loaders[tag]!()
        .then(
          (ctor) => {
            // A class the registry refuses (a constructor already defined under another
            // name) is a failure like a failed import: warned once, the fallback stays.
            try {
              if (!customElements.get(tag)) customElements.define(tag, ctor);
            } catch (error) {
              fail(tag, error);
              return;
            }
            plan.settle(tag, true);
          },
          (error: unknown) => fail(tag, error),
        )
        .finally(() => inFlight.delete(run));
      inFlight.add(run);
    }
    if (!plan.anyWaiting()) {
      mo?.disconnect();
      io?.disconnect();
    }
  }

  function consider(el: Element): void {
    const tag = el.localName;
    if (!plan.waiting(tag)) return;
    const when = o.when?.(el) ?? 'approach';
    if (when === 'wait') return;
    if (!io || when === 'now') {
      load([tag]);
      return;
    }
    let set = watched.get(tag);
    if (!set) watched.set(tag, (set = new Set()));
    if (set.has(el)) return;
    set.add(el);
    io.observe(el);
  }

  function scan(node: Node): void {
    if (!(node instanceof Element)) return;
    const selector = tags.filter((tag) => plan.waiting(tag)).join(',');
    if (!selector) return;
    if (node.matches(selector)) consider(node);
    for (const el of node.querySelectorAll(selector)) consider(el);
  }

  /** Lets go of watched instances no longer in the document (a node removed, or one of its descendants). */
  function release(node: Node): void {
    if (!(node instanceof Element) || !watched.size) return;
    for (const set of watched.values())
      for (const el of set)
        if (!el.isConnected && (el === node || node.contains(el))) {
          io?.unobserve(el);
          set.delete(el);
        }
  }

  // An instance added after this call (a later render, a tab built on demand) is picked up too.
  const mo =
    typeof MutationObserver === 'function'
      ? new MutationObserver((records) => {
          for (const r of records) {
            // A moved instance is removed and added again: it is still connected, and kept.
            for (const n of r.removedNodes) release(n);
            for (const n of r.addedNodes) scan(n);
          }
        })
      : undefined;
  mo?.observe(root, { childList: true, subtree: true });
  scan(root.documentElement);

  return {
    wake(tag) {
      if (plan.waiting(tag) && root.querySelector(tag)) load([tag]);
    },
    async settled() {
      while (inFlight.size) await Promise.all([...inFlight]);
    },
    stop() {
      mo?.disconnect();
      io?.disconnect();
      watched.clear();
    },
  };
}
