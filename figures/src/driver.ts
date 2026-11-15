// Plays the AI's side of the store's game, once for the whole page however
// many boards show it: when the side to move is not the reader's, it asks the
// search for a move and plays it in the store. It runs while at least one
// board is attached; the last one to detach stops any search in flight.
import { LC1_2, type State, type Triple } from './engine';
import type { SearchResult, Via } from './search-client';
import { LEVEL_SIMS, type GameRecord, type Store } from './store';

export type DriverStatus = 'idle' | 'thinking' | 'failed';

export interface Searcher {
  bestMove(state: State, sims: number, rules: typeof LC1_2, signal?: AbortSignal): Promise<SearchResult>;
}

export interface Driver {
  status(): DriverStatus;
  /** Where the last AI move was searched, and how long it took (ms), once one was played. */
  lastSearch(): { via: Via; ms: number } | undefined;
  on(fn: () => void): () => void;
  /** After a failure: asks again. */
  retry(): void;
  /** Keeps the driver running until `signal` aborts. */
  attach(signal: AbortSignal): void;
}

export interface DriverOptions {
  /** The AI's move is never shown sooner than this after it was asked for (default 400 ms). */
  minDelayMs?: number;
  now?: () => number;
}

interface Request {
  start: State;
  ply: number;
  controller: AbortController;
}

const sameTurn = (a: { start: State; ply: number } | undefined, g: GameRecord): boolean =>
  a !== undefined && a.start === g.start && a.ply === g.moves.length;

export const aiToMove = (g: GameRecord | null): g is GameRecord =>
  g !== null && !g.finished && g.states[g.states.length - 1]!.to_move !== g.readerColour;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

export function createDriver(store: Store, searcher: Searcher, o: DriverOptions = {}): Driver {
  const minDelay = o.minDelayMs ?? 400;
  const now = o.now ?? (() => performance.now());
  const listeners = new Set<() => void>();
  let status: DriverStatus = 'idle';
  let inFlight: Request | undefined;
  /** The turn whose search failed: not asked again until `retry`. */
  let failed: { start: State; ply: number } | undefined;
  let last: { via: Via; ms: number } | undefined;
  let attached = 0;
  let unsubscribe: (() => void) | undefined;

  const set = (next: DriverStatus): void => {
    if (next === status) return;
    status = next;
    for (const fn of [...listeners]) fn();
  };

  const stop = (): void => {
    inFlight?.controller.abort();
    inFlight = undefined;
  };

  const ask = (g: GameRecord): void => {
    const request: Request = { start: g.start, ply: g.moves.length, controller: new AbortController() };
    inFlight = request;
    const { signal } = request.controller;
    set('thinking');
    const t0 = now();
    searcher
      .bestMove(g.states[g.states.length - 1]!, LEVEL_SIMS[g.level], LC1_2, signal)
      .then(async (result) => {
        const ms = now() - t0;
        await wait(minDelay - ms, signal);
        if (signal.aborted) return;
        inFlight = undefined;
        last = { via: result.via, ms };
        const move: Triple = result.move;
        // Playing emits 'game', and tick() settles the status from the new position.
        store.play(move);
      })
      .catch(() => {
        if (signal.aborted) return;
        inFlight = undefined;
        failed = { start: request.start, ply: request.ply };
        set('failed');
      });
  };

  const tick = (): void => {
    const g = store.current();
    if (!aiToMove(g)) {
      stop();
      failed = undefined;
      set('idle');
      return;
    }
    if (sameTurn(inFlight, g)) return;
    if (sameTurn(failed, g)) {
      set('failed');
      return;
    }
    stop();
    failed = undefined;
    ask(g);
  };

  return {
    status: () => status,
    lastSearch: () => last,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    retry() {
      failed = undefined;
      if (attached > 0) tick();
    },
    attach(signal) {
      if (signal.aborted) return;
      attached += 1;
      if (attached === 1) {
        unsubscribe = store.on('game', tick);
        tick();
      }
      signal.addEventListener(
        'abort',
        () => {
          attached -= 1;
          if (attached > 0) return;
          unsubscribe?.();
          unsubscribe = undefined;
          stop();
          set('idle');
        },
        { once: true },
      );
    },
  };
}
