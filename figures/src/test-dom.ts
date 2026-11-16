// Controllable stand-ins for the two browser APIs happy-dom does not drive:
// `matchMedia` (reduced motion) and `IntersectionObserver` (visibility).
// test-setup.ts installs them; a test imports this module to flip them.

type Listener = (event: MediaQueryListEvent) => void;

const queries = new Map<string, { matches: boolean; listeners: Set<Listener> }>();

function entry(query: string) {
  let e = queries.get(query);
  if (!e) {
    e = { matches: false, listeners: new Set() };
    queries.set(query, e);
  }
  return e;
}

export function matchMediaMock(query: string): MediaQueryList {
  const e = entry(query);
  return {
    media: query,
    get matches() {
      return e.matches;
    },
    onchange: null,
    addEventListener: (_type: string, fn: Listener) => e.listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => e.listeners.delete(fn),
    addListener: (fn: Listener) => e.listeners.add(fn),
    removeListener: (fn: Listener) => e.listeners.delete(fn),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
}

/** Sets a media query's answer and notifies its listeners, as a browser does. */
export function setMedia(query: string, matches: boolean): void {
  const e = entry(query);
  e.matches = matches;
  for (const fn of [...e.listeners]) fn({ matches, media: query } as MediaQueryListEvent);
}

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Number of listeners still attached to a query: a leak shows here. */
export function mediaListeners(query: string): number {
  return entry(query).listeners.size;
}

export function resetMedia(): void {
  queries.clear();
}

const observers = new Set<IntersectionObserverMock>();

export class IntersectionObserverMock {
  readonly targets = new Set<Element>();
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    observers.add(this);
  }
  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
    observers.delete(this);
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  fire(target: Element): void {
    const record = { target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry;
    this.callback([record], this as unknown as IntersectionObserver);
  }
}

/** Brings `el` within every live observer's margin that watches it. */
export function intersect(el: Element): void {
  for (const o of [...observers]) if (o.targets.has(el)) o.fire(el);
}

/** The observers watching `el`, to fire one directly (a browser may deliver queued entries). */
export function observersOf(el: Element): IntersectionObserverMock[] {
  return [...observers].filter((o) => o.targets.has(el));
}

/** Live observers watching `el`; zero after a disconnect. */
export function observing(el: Element): number {
  return [...observers].filter((o) => o.targets.has(el)).length;
}

/** An element's words as drawn, without the move names' explanations (kit/move-tip.ts). */
export function shownText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('.move-tip').forEach((x) => x.remove());
  return copy.textContent ?? '';
}
