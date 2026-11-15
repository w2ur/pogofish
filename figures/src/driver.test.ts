import { describe, expect, it, vi } from 'vitest';
import { createDriver, type Searcher } from './driver';
import { legal, type State, type Triple } from './engine';
import type { SearchResult } from './search-client';
import { createStore } from './store';

const first = (s: State): Triple => {
  const m = legal(s)[0]!;
  return [m.from_cell, m.num_pieces, m.to_cell];
};

/** A searcher the test settles by hand; it records the sims it was asked for. */
function manual() {
  const calls: { state: State; sims: number; signal?: AbortSignal; resolve: (r: SearchResult) => void; reject: (e: Error) => void }[] = [];
  const searcher: Searcher = {
    bestMove: (state, sims, _rules, signal) =>
      new Promise((resolve, reject) => calls.push({ state, sims, signal, resolve, reject })),
  };
  const answer = (i: number): void => calls[i]!.resolve({ move: first(calls[i]!.state), snapshot: { sim: 1, root: [] }, via: 'worker' });
  return { searcher, calls, answer };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const store = createStore({ storage: null });
  const m = manual();
  const driver = createDriver(store, m.searcher, { minDelayMs: 0 });
  const attached = new AbortController();
  driver.attach(attached.signal);
  return { store, driver, attached, ...m };
}

describe('the driver', () => {
  it('plays the AI’s side at the level’s simulations, and waits on the reader’s', async () => {
    const { store, driver, calls, answer } = setup();
    store.newGame('Red', 'hard');
    expect(driver.status()).toBe('thinking');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sims).toBe(400);
    answer(0);
    await flush();
    expect(store.current()!.moves).toHaveLength(1);
    expect(driver.status()).toBe('idle');
    expect(driver.lastSearch()?.via).toBe('worker');
    expect(calls).toHaveLength(1);
  });

  it('reader playing White: nothing is searched until the reader moves', async () => {
    const { store, calls } = setup();
    store.newGame('White', 'easy');
    expect(calls).toHaveLength(0);
    store.play(first(store.current()!.states[0]!));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sims).toBe(25);
  });

  it('two boards attached search once', () => {
    const { store, driver, calls } = setup();
    driver.attach(new AbortController().signal);
    store.newGame('Red', 'normal');
    store.setLevel('normal');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sims).toBe(100);
  });

  it('a new game while the AI thinks aborts the search, and its answer is never played', async () => {
    const { store, calls, answer } = setup();
    store.newGame('Red', 'normal');
    store.newGame('Red', 'easy');
    expect(calls[0]!.signal!.aborted).toBe(true);
    answer(0);
    await flush();
    expect(store.current()!.moves).toHaveLength(0);
    answer(1);
    await flush();
    expect(store.current()!.moves).toHaveLength(1);
  });

  it('a failed search says so and waits for a retry', async () => {
    const { store, driver, calls } = setup();
    const changes = vi.fn();
    driver.on(changes);
    store.newGame('Red', 'normal');
    calls[0]!.reject(new Error('pogo-figures: net 404'));
    await flush();
    expect(driver.status()).toBe('failed');
    store.setLevel('hard');
    expect(calls).toHaveLength(1);
    driver.retry();
    expect(driver.status()).toBe('thinking');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sims).toBe(400);
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('the last board detaching stops the search', () => {
    const { store, driver, attached, calls } = setup();
    const second = new AbortController();
    driver.attach(second.signal);
    store.newGame('Red', 'normal');
    attached.abort();
    expect(calls[0]!.signal!.aborted).toBe(false);
    second.abort();
    expect(calls[0]!.signal!.aborted).toBe(true);
    expect(driver.status()).toBe('idle');
    store.newGame('Red', 'normal');
    expect(calls).toHaveLength(1);
  });

  it('the AI’s move is shown no sooner than the minimum delay', async () => {
    vi.useFakeTimers();
    try {
      const store = createStore({ storage: null });
      const m = manual();
      let clock = 0;
      const driver = createDriver(store, m.searcher, { minDelayMs: 400, now: () => clock });
      driver.attach(new AbortController().signal);
      store.newGame('Red', 'normal');
      clock = 100;
      m.answer(0);
      await vi.advanceTimersByTimeAsync(299);
      expect(store.current()!.moves).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(store.current()!.moves).toHaveLength(1);
      expect(driver.lastSearch()).toEqual({ via: 'worker', ms: 100 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('the reader switching sides hands the turn to the AI', () => {
    const { store, calls } = setup();
    store.newGame('White', 'normal');
    expect(calls).toHaveLength(0);
    store.setReaderColour('Red');
    expect(calls).toHaveLength(1);
  });
});
