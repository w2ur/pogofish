import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from './default-game';
import { LC1_2, initial, legal, play, replay, terminal, type State, type Triple } from './engine';
import { STORAGE_KEY, createStore, rebuild, sessionStorageOrNull, type StorageLike } from './store';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const LOOP: Triple[] = [
  [0, 1, 1],
  [6, 1, 3],
  [1, 1, 0],
  [3, 1, 6],
];

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

/** A legal move that does not end the game (lc1-2), so a test can play on. */
function lasting(s: State): Triple {
  for (const m of legal(s)) {
    const t: Triple = [m.from_cell, m.num_pieces, m.to_cell];
    if (!terminal(play(s, t), LC1_2)) return t;
  }
  throw new Error('every move ends the game');
}

const make = (storage: StorageLike | null = memory(), target?: EventTarget) =>
  createStore({ storage, target, loadEngine: () => Promise.resolve() });

describe('the store', () => {
  it('a finished game becomes lastFinished', () => {
    const store = make();
    store.newGame('White', 'normal');
    for (const m of DEFAULT_GAME) store.play(m);
    const g = store.current()!;
    expect(g).toMatchObject({ finished: true, result: 'W', endedByRepetition: false });
    expect(g.states).toHaveLength(10);
    expect(store.lastFinished()).toBe(g);
  });

  it('a repetition loss is a finished game, with the winner and the rule named', () => {
    const store = make();
    store.newGame('Red', 'easy');
    // The initial position a third time, produced by Red's eighth-ply move: Red loses.
    for (const m of [...LOOP, ...LOOP]) store.play(m);
    expect(store.lastFinished()).toMatchObject({ finished: true, result: 'W', endedByRepetition: true });
  });

  it('an abandoned game (new game mid-way) does not become lastFinished', () => {
    const store = make();
    store.newGame('White', 'normal');
    store.play(DEFAULT_GAME[0]!);
    store.newGame('Red', 'hard');
    expect(store.lastFinished()).toBeNull();
    expect(store.current()).toMatchObject({ moves: [], readerColour: 'Red', level: 'hard', finished: false });

    for (const m of DEFAULT_GAME) store.play(m);
    const finished = store.lastFinished();
    store.newGame('White', 'normal');
    store.play(DEFAULT_GAME[0]!);
    store.newGame('White', 'normal');
    expect(store.lastFinished()).toBe(finished);
  });

  it('with no game, figures get DEFAULT_GAME, part 1’s openingWin', () => {
    const store = make();
    expect(store.current()).toBeNull();
    expect(store.lastFinished()).toBeNull();
    const fixture = JSON.parse(read('fixtures/lines.json')) as { openingWin: Triple[] };
    const table = JSON.parse(read('public/data/table.json')) as { lines: { openingWin: Triple[] } };
    expect(store.DEFAULT_GAME).toEqual(fixture.openingWin);
    expect(store.DEFAULT_GAME).toEqual(table.lines.openingWin);
    expect(store.DEFAULT_GAME).toBe(DEFAULT_GAME);
  });

  it('playFrom emits once with the state, and the reader plays the side to move', () => {
    const store = make();
    const s = replay(DEFAULT_GAME.slice(0, 3) as Triple[])[3]!;
    const playfrom = vi.fn();
    const game = vi.fn();
    store.on('playfrom', playfrom);
    store.on('game', game);
    store.playFrom(s, 'ply 3');
    expect(playfrom).toHaveBeenCalledTimes(1);
    expect(game).toHaveBeenCalledTimes(1);
    expect(store.current()).toMatchObject({ start: s, moves: [], readerColour: 'Red', label: 'ply 3' });
    expect(store.current()!.start).not.toBe(s);
  });

  it('turns a figure’s pogo:playfrom event into playFrom', () => {
    const target = new EventTarget();
    const store = make(memory(), target);
    const playfrom = vi.fn();
    store.on('playfrom', playfrom);
    const s = play1();
    target.dispatchEvent(new CustomEvent('pogo:playfrom', { detail: { state: s, label: 'from a figure' } }));
    expect(playfrom).toHaveBeenCalledTimes(1);
    expect(store.current()!.label).toBe('from a figure');
  });

  it('playFrom ignores a finished position and a malformed one', () => {
    const store = make();
    const end = replay(DEFAULT_GAME as Triple[])[9]!;
    const playfrom = vi.fn();
    store.on('playfrom', playfrom);
    store.playFrom(end, 'over');
    store.playFrom({ ...initial(), cells: [] } as State, 'broken');
    expect(playfrom).not.toHaveBeenCalled();
    expect(store.current()).toBeNull();
  });

  it('play refuses an illegal move, and a move after the end', () => {
    const store = make();
    expect(() => store.play([0, 1, 1])).toThrow(/^pogo-figures: /);
    store.newGame('White', 'normal');
    expect(() => store.play([0, 2, 1])).toThrow(/^pogo-figures: illegal/);
    for (const m of DEFAULT_GAME) store.play(m);
    expect(() => store.play(LOOP[0]!)).toThrow(/^pogo-figures: /);
  });

  it('setReaderColour and setLevel during a game change only the next game', () => {
    const store = make();
    store.newGame('White', 'normal');
    store.play(DEFAULT_GAME[0]!);
    store.setReaderColour('Red');
    store.setLevel('hard');
    expect(store.current()).toMatchObject({ readerColour: 'White', level: 'normal' });
    expect(store.preferences()).toEqual({ readerColour: 'Red', level: 'hard' });
    // The finished game keeps the level it was played at.
    for (const m of DEFAULT_GAME.slice(1)) store.play(m);
    expect(store.lastFinished()).toMatchObject({ readerColour: 'White', level: 'normal' });
  });
});

describe('the follow board’s open or folded', () => {
  it('is folded by default; a game started on a board leaves it, a figure’s playFrom opens it', () => {
    const store = make();
    expect(store.followOpen()).toBe(false);
    store.newGame('White', 'normal');
    expect(store.followOpen()).toBe(false);
    store.playFrom(replay(DEFAULT_GAME.slice(0, 2)).at(-1)!, 'coup 2');
    expect(store.followOpen()).toBe(true);
  });

  it('the reader’s choice survives ten moves and the next game started on a board', () => {
    const store = make();
    store.newGame('White', 'normal');
    store.setFollowOpen(true);
    // Ten plies, each side's: moves and replies alike leave it.
    for (let ply = 0; ply < 10; ply++) {
      store.play(lasting(store.current()!.states.at(-1)!));
      expect(store.followOpen()).toBe(true);
    }
    expect(store.current()!.finished).toBe(false);
    store.newGame('Red', 'easy');
    expect(store.followOpen()).toBe(true);
    store.setFollowOpen(false);
    store.playFrom(replay(DEFAULT_GAME.slice(0, 2)).at(-1)!, 'coup 2');
    expect(store.followOpen()).toBe(true);
  });

  it('is kept in the storage record, and a record without it restores folded', async () => {
    const storage = memory();
    const first = make(storage);
    first.newGame('White', 'normal');
    first.setFollowOpen(true);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).followOpen).toBe(true);
    const second = make(storage);
    await second.ready();
    expect(second.followOpen()).toBe(true);

    first.setFollowOpen(false);
    const third = make(storage);
    await third.ready();
    expect(third.followOpen()).toBe(false);

    // A record written before the field existed: the game comes back, folded.
    const old = JSON.parse(storage.data.get(STORAGE_KEY)!);
    old.followOpen = undefined;
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...old, followOpen: undefined }));
    expect(storage.data.get(STORAGE_KEY)).not.toContain('followOpen');
    const fourth = make(storage);
    await fourth.ready();
    expect(fourth.current()).not.toBeNull();
    expect(fourth.followOpen()).toBe(false);
  });

  it('opening it before ready() does not lose the saved game, and the choice wins over the record', async () => {
    const storage = memory();
    const first = make(storage);
    first.newGame('White', 'normal');
    const second = make(storage);
    second.setFollowOpen(true);
    await second.ready();
    expect(second.current()).not.toBeNull();
    expect(second.followOpen()).toBe(true);
  });
});

describe('persistence', () => {
  it('the current and the last finished game survive a reload, under one key', async () => {
    const storage = memory();
    const first = make(storage);
    first.newGame('White', 'normal');
    for (const m of DEFAULT_GAME) first.play(m);
    first.newGame('Red', 'hard');
    first.play(DEFAULT_GAME[0]!);
    expect([...storage.data.keys()]).toEqual([STORAGE_KEY]);

    const second = make(storage);
    expect(second.hasSaved()).toBe(true);
    const game = vi.fn();
    second.on('game', game);
    await second.ready();
    expect(game).toHaveBeenCalledTimes(1);
    expect(second.lastFinished()).toMatchObject({ result: 'W', finished: true, moves: DEFAULT_GAME });
    expect(second.current()).toMatchObject({ readerColour: 'Red', level: 'hard', moves: [DEFAULT_GAME[0]] });
    expect(second.preferences()).toEqual({ readerColour: 'Red', level: 'hard' });
  });

  it('hasSaved is true only for a saved game under way, not for saved preferences alone', () => {
    const storage = memory();
    const store = make(storage);
    store.setLevel('hard');
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    expect(make(storage).hasSaved()).toBe(false);
    store.newGame('White', 'hard');
    expect(make(storage).hasSaved()).toBe(true);
    storage.setItem(STORAGE_KEY, 'not json');
    expect(make(storage).hasSaved()).toBe(false);
  });

  it('lastFinished before ready() is null, without throwing, and a restore announces itself on game', async () => {
    const storage = memory();
    const first = make(storage);
    first.newGame('White', 'normal');
    for (const m of DEFAULT_GAME) first.play(m);
    const second = make(storage);
    expect(second.lastFinished()).toBeNull();
    const game = vi.fn(() => expect(second.lastFinished()).not.toBeNull());
    second.on('game', game);
    await second.ready();
    expect(game).toHaveBeenCalledTimes(1);
  });

  it('an invalid record is dropped silently', async () => {
    const cases: unknown[] = [
      'not json',
      { v: 2 },
      { v: 1, current: { start: initial(), moves: [[0, 2, 1]], readerColour: 'White', level: 'normal' }, lastFinished: null },
      { v: 1, current: { start: { ...initial(), cells: [['Blue']] }, moves: [], readerColour: 'White', level: 'normal' }, lastFinished: null },
      { v: 1, current: { start: initial(), moves: [], readerColour: 'Green', level: 'normal' }, lastFinished: null },
      { v: 1, current: null, lastFinished: { start: initial(), moves: DEFAULT_GAME.slice(0, 4), readerColour: 'White', level: 'normal' } },
      { v: 1, current: null, lastFinished: { start: initial(), moves: [...LOOP, ...LOOP, afterTheEnd()], readerColour: 'White', level: 'normal' } },
    ];
    for (const c of cases) {
      const storage = memory();
      storage.setItem(STORAGE_KEY, typeof c === 'string' ? c : JSON.stringify(c));
      const store = make(storage);
      await store.ready();
      expect(store.current(), JSON.stringify(c)).toBeNull();
      expect(store.lastFinished(), JSON.stringify(c)).toBeNull();
    }
  });

  it('rebuild recomputes the states and the result rather than trusting them', () => {
    const r = rebuild({ start: initial(), moves: DEFAULT_GAME, readerColour: 'White', level: 'normal', states: [], result: 'R' });
    expect(r).toMatchObject({ result: 'W', finished: true });
    expect(r!.states).toEqual(replay(DEFAULT_GAME as Triple[]));
  });

  it('a game in memory wins over the saved one', async () => {
    const storage = memory();
    const first = make(storage);
    first.newGame('Red', 'easy');
    const second = make(storage);
    second.newGame('White', 'hard');
    await second.ready();
    expect(second.current()).toMatchObject({ readerColour: 'White', level: 'hard' });
    expect(second.preferences()).toEqual({ readerColour: 'White', level: 'hard' });
  });

  it('store survives a sessionStorage that throws', async () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const store = make(throwing);
    await store.ready();
    expect(store.hasSaved()).toBe(false);
    store.newGame('White', 'normal');
    for (const m of DEFAULT_GAME) store.play(m);
    expect(store.lastFinished()).toMatchObject({ finished: true });
  });

  it('a sessionStorage whose very access throws reads as none', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      expect(sessionStorageOrNull()).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    }
    expect(make(null).hasSaved()).toBe(false);
  });
});

function play1(): State {
  const s = initial();
  return replay([[legal(s)[0]!.from_cell, legal(s)[0]!.num_pieces, legal(s)[0]!.to_cell]])[1]!;
}

/** A move the engine still lists after a repetition loss, where the game is already over. */
function afterTheEnd(): Triple {
  const m = legal(replay([...LOOP, ...LOOP])[8]!)[0]!;
  return [m.from_cell, m.num_pieces, m.to_cell];
}
