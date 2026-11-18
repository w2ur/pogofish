import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from './default-game';

// The engine as a page first meets it: its functions throw until the wasm has loaded.
// A file of its own, so the gate wraps the engine for this file's stores alone.
const gate = vi.hoisted(() => ({ open: true }));
vi.mock('./engine', async (original) => {
  const real = await original<typeof import('./engine')>();
  const guarded =
    <A extends unknown[], R>(fn: (...a: A) => R) =>
    (...a: A): R => {
      if (!gate.open) throw new TypeError("Cannot read properties of undefined (reading 'legal_moves')");
      return fn(...a);
    };
  return { ...real, legal: guarded(real.legal), play: guarded(real.play), terminal: guarded(real.terminal), winner: guarded(real.winner), initial: guarded(real.initial) };
});

const { STORAGE_KEY, createStore } = await import('./store');

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('a follow board opened before the engine has loaded', () => {
  // Regression: 09d1abb — open() closed/sized the board before ready(): restore() ran without the engine,
  // dropped the saved game, latched, and the next write erased it from sessionStorage.
  it('keeps the saved game, in storage and once the engine is there', async () => {
    const storage = memory();
    const first = createStore({ storage, loadEngine: () => Promise.resolve() });
    first.newGame('White', 'normal');
    for (const m of DEFAULT_GAME) first.play(m);
    first.newGame('Red', 'hard');
    first.play(DEFAULT_GAME[0]!);

    gate.open = false;
    let load!: () => void;
    const second = createStore({ storage, loadEngine: () => new Promise<void>((r) => (load = r)) });
    const ready = second.ready();
    second.setFollowClosed(true);
    second.setFollowSize('open');
    const saved = JSON.parse(storage.data.get(STORAGE_KEY)!);
    expect(saved.current?.moves).toEqual([DEFAULT_GAME[0]]);
    expect(saved.lastFinished?.moves).toEqual(DEFAULT_GAME);
    // The choices made before the engine are kept with it.
    expect(saved.followSize).toBe('open');
    expect(saved.followClosed).toBe(true);

    gate.open = true;
    load();
    await ready;
    expect(second.current()).toMatchObject({ readerColour: 'Red', level: 'hard', moves: [DEFAULT_GAME[0]] });
    expect(second.lastFinished()).toMatchObject({ finished: true, result: 'W' });
    expect(second.followSize()).toBe('open');
    expect(second.followClosed()).toBe(true);
  });
});
