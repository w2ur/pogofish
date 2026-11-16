// The reader's game, shared by every board on the page and by the figures that
// replay it. One record per game, rebuilt from its moves through the engine;
// the current game and the last finished one are kept in sessionStorage under
// one key, and nothing is ever sent anywhere. All positions and rules are lc1-2.
import { DEFAULT_GAME } from './default-game';
import { assetUrl, WASM_FILE } from './assets';
import { LC1_2, initial, legal, play, ready, terminal, winner, type Colour, type State, type Triple } from './engine';
import { FOLLOW_SIZE_DEFAULT, isFollowSize, sizeAtStart, type FollowSize } from './follow-panel';
import type { PlayFromDetail } from './kit/figure';
import { holdsGame, STORAGE_KEY } from './saved';

export type Level = 'easy' | 'normal' | 'hard';
export const LEVELS: readonly Level[] = ['easy', 'normal', 'hard'];
/** Simulations per move; only `normal` has a measured strength. */
export const LEVEL_SIMS: Record<Level, number> = { easy: 25, normal: 100, hard: 400 };

export interface GameRecord {
  start: State;
  moves: Triple[];
  /** `states[0]` is `start`, one state per ply. */
  states: State[];
  readerColour: Colour;
  level: Level;
  result: 'W' | 'R' | null;
  /** The loser produced a position for the third time (lc1-2), rather than losing every stack. */
  endedByRepetition: boolean;
  finished: boolean;
  /** The label of the figure that handed this position over, for a game opened by `playFrom`. */
  label?: string;
}

export type StoreEvent = 'game' | 'playfrom';

export interface Store {
  current(): GameRecord | null;
  /**
   * `null` → figures use `DEFAULT_GAME`. Safe to call at any time, but a saved game is
   * only there once `ready()` has restored it: await `ready()`, or subscribe to 'game',
   * which fires when a restore finds one.
   */
  lastFinished(): GameRecord | null;
  readonly DEFAULT_GAME: readonly Triple[];
  /** Opens the board on `s` (the reader plays the side to move), emits 'game' then 'playfrom'. A finished position is ignored. */
  playFrom(s: State, label: string): void;
  on(ev: StoreEvent, fn: () => void): () => void;
  /** Loads the engine, then restores the saved games once. Await it before reading a saved game. */
  ready(): Promise<void>;
  /** Abandons any game under way and starts one from the initial position. */
  newGame(readerColour: Colour, level: Level): void;
  /**
   * Ends the game under way without starting another, so that side and level can be
   * chosen first. An abandoned game is not a finished one: `lastFinished` keeps its own.
   */
  abandon(): void;
  /** Plays `m` in the current game; throws if there is none, it is over, or `m` is not legal. */
  play(m: Triple): void;
  /**
   * The side the reader takes in the NEXT game. A game under way keeps its sides:
   * switching mid-game would let one reader play both colours.
   */
  setReaderColour(c: Colour): void;
  /** The level of the NEXT game; a game under way keeps its own, so `lastFinished().level` is the one played. */
  setLevel(level: Level): void;
  /** The colour and level the next new game starts with. */
  preferences(): { readerColour: Colour; level: Level };
  /**
   * Whether storage holds a game (finished or not) to restore, without the engine.
   * Saved preferences alone do not count, so a follow board does not load the engine for them.
   */
  hasSaved(): boolean;
  /**
   * The follow board's size, open, bar or dot: the reader's choice, kept in the storage
   * record for the page's session. A bar by default; `playFrom` opens it, `newGame`
   * and moves leave it (follow-panel.ts).
   */
  followSize(): FollowSize;
  /** The reader chose a size for the follow board. */
  setFollowSize(size: FollowSize): void;
  /** Whether the reader closed the follow board: hidden until it is opened again, or a figure hands a position over. */
  followClosed(): boolean;
  setFollowClosed(closed: boolean): void;
}

/** The part of `Storage` the store uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export { STORAGE_KEY };

interface Saved {
  start: State;
  moves: Triple[];
  readerColour: Colour;
  level: Level;
  label?: string;
}

interface SavedFile {
  v: 1;
  current: Saved | null;
  lastFinished: Saved | null;
  prefs: { readerColour: Colour; level: Level };
  followSize?: FollowSize;
  followClosed?: boolean;
  /** Before followSize: true restores open, anything else a bar. */
  followOpen?: boolean;
}

const COLOURS: readonly Colour[] = ['White', 'Red'];
const isColour = (x: unknown): x is Colour => COLOURS.includes(x as Colour);
const isLevel = (x: unknown): x is Level => LEVELS.includes(x as Level);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;

/**
 * A shape the engine can read without panicking: nine stacks of six pieces a
 * side, a player to move, history as byte strings. The wasm unwraps its input,
 * so a bad record must never reach it.
 */
export function isStateShape(x: unknown): x is State {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  if (!Array.isArray(s.cells) || s.cells.length !== 9) return false;
  let white = 0;
  let red = 0;
  for (const stack of s.cells) {
    if (!Array.isArray(stack)) return false;
    for (const piece of stack) {
      if (piece === 'White') white++;
      else if (piece === 'Red') red++;
      else return false;
    }
  }
  if (white !== 6 || red !== 6) return false;
  if (!isColour(s.to_move) || !isInt(s.move_count, 0, 1e9)) return false;
  return Array.isArray(s.history) && s.history.every((k) => Array.isArray(k) && k.every((b) => isInt(b, 0, 255)));
}

const isTriple = (x: unknown): x is Triple =>
  Array.isArray(x) && x.length === 3 && isInt(x[0], 0, 8) && isInt(x[1], 1, 3) && isInt(x[2], 0, 8);

const sameMove = (m: { from_cell: number; num_pieces: number; to_cell: number }, t: Triple): boolean =>
  m.from_cell === t[0] && m.num_pieces === t[1] && m.to_cell === t[2];

function close(record: GameRecord): GameRecord {
  const last = record.states[record.states.length - 1]!;
  if (!terminal(last, LC1_2)) return record;
  // Every stack topped by one colour is game A's own end; anything else lc1-2 ends is a repetition.
  return { ...record, result: winner(last, LC1_2), endedByRepetition: !terminal(last, null), finished: true };
}

/** Rebuilds a record by replaying its moves; `null` when any move is illegal or follows the end. */
export function rebuild(saved: unknown): GameRecord | null {
  if (typeof saved !== 'object' || saved === null) return null;
  const s = saved as Record<string, unknown>;
  if (!isStateShape(s.start) || !Array.isArray(s.moves) || !s.moves.every(isTriple)) return null;
  if (!isColour(s.readerColour) || !isLevel(s.level)) return null;
  if (s.label !== undefined && typeof s.label !== 'string') return null;
  const states = [s.start];
  for (const m of s.moves) {
    const at = states[states.length - 1]!;
    if (terminal(at, LC1_2) || !legal(at).some((l) => sameMove(l, m))) return null;
    states.push(play(at, m));
  }
  return close({
    start: s.start,
    moves: s.moves,
    states,
    readerColour: s.readerColour,
    level: s.level,
    result: null,
    endedByRepetition: false,
    finished: false,
    ...(s.label === undefined ? {} : { label: s.label }),
  });
}

const toSaved = (r: GameRecord): Saved => ({
  start: r.start,
  moves: r.moves,
  readerColour: r.readerColour,
  level: r.level,
  ...(r.label === undefined ? {} : { label: r.label }),
});

/** sessionStorage, or `null` where touching it throws (private mode, blocked storage). */
export function sessionStorageOrNull(): StorageLike | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export interface StoreOptions {
  storage: StorageLike | null;
  /** Where figures dispatch `pogo:playfrom` (the document). */
  target?: EventTarget;
  /** Loads the engine (default: the package's wasm, next to the bundle). */
  loadEngine?: () => Promise<void>;
}

export function createStore(o: StoreOptions): Store {
  const listeners: Record<StoreEvent, Set<() => void>> = { game: new Set(), playfrom: new Set() };
  let current: GameRecord | null = null;
  let last: GameRecord | null = null;
  let prefs: { readerColour: Colour; level: Level } = { readerColour: 'White', level: 'normal' };
  let followSize: FollowSize = FOLLOW_SIZE_DEFAULT;
  let followClosed = false;
  let restored = false;
  let readyPromise: Promise<void> | undefined;

  const emit = (ev: StoreEvent): void => {
    for (const fn of [...listeners[ev]]) fn();
  };

  const read = (): string | null => {
    try {
      return o.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  };

  const write = (): void => {
    const file: SavedFile = {
      v: 1,
      current: current && toSaved(current),
      lastFinished: last && toSaved(last),
      prefs,
      followSize,
      followClosed,
    };
    try {
      o.storage?.setItem(STORAGE_KEY, JSON.stringify(file));
    } catch {
      // Full or blocked storage: the game simply is not kept across a reload.
    }
  };

  /** Runs once, before the first change and at `ready()`: the engine is usable by then. */
  const restore = (): void => {
    if (restored) return;
    restored = true;
    const raw = read();
    if (raw === null) return;
    let file: Partial<SavedFile>;
    try {
      file = JSON.parse(raw) as Partial<SavedFile>;
    } catch {
      return;
    }
    if (typeof file !== 'object' || file === null || file.v !== 1) return;
    const p = file.prefs;
    if (p && isColour(p.readerColour) && isLevel(p.level)) prefs = { readerColour: p.readerColour, level: p.level };
    followSize = isFollowSize(file.followSize) ? file.followSize : file.followOpen === true ? 'open' : FOLLOW_SIZE_DEFAULT;
    followClosed = file.followClosed === true;
    try {
      const lastFinished = file.lastFinished ? rebuild(file.lastFinished) : null;
      if (lastFinished?.finished) last = lastFinished;
      if (file.current) current = rebuild(file.current);
    } catch {
      // A record the engine refuses is dropped like any other invalid one.
    }
    if (current !== null || last !== null) emit('game');
  };

  const changed = (): void => {
    if (current?.finished) last = current;
    write();
    emit('game');
  };

  const begin = (start: State, readerColour: Colour, level: Level, label?: string): void => {
    // A clone, so two games from the same position are never the same object.
    const s = structuredClone(start);
    current = close({
      start: s,
      moves: [],
      states: [s],
      readerColour,
      level,
      result: null,
      endedByRepetition: false,
      finished: false,
      ...(label === undefined ? {} : { label }),
    });
  };

  const store: Store = {
    DEFAULT_GAME,
    current: () => current,
    lastFinished: () => last,
    preferences: () => ({ ...prefs }),
    hasSaved() {
      return holdsGame(read());
    },
    followSize: () => followSize,
    followClosed: () => followClosed,

    setFollowSize(size) {
      restore();
      if (size === followSize) return;
      followSize = size;
      write();
    },

    setFollowClosed(closed) {
      restore();
      if (closed === followClosed) return;
      followClosed = closed;
      write();
    },

    on(ev, fn) {
      listeners[ev].add(fn);
      return () => listeners[ev].delete(fn);
    },

    ready() {
      readyPromise ??= (o.loadEngine ?? (() => ready(assetUrl(WASM_FILE))))().then(restore);
      return readyPromise;
    },

    newGame(readerColour, level) {
      restore();
      prefs = { readerColour, level };
      followSize = sizeAtStart(followSize, 'board');
      begin(initial(), readerColour, level);
      changed();
    },

    abandon() {
      restore();
      if (current === null) return;
      // Unfinished, so changed() does not take it for the last finished game.
      current = null;
      changed();
    },

    playFrom(s, label) {
      if (!isStateShape(s) || terminal(s, LC1_2)) return;
      restore();
      prefs = { ...prefs, readerColour: s.to_move };
      followSize = sizeAtStart(followSize, 'figure');
      followClosed = false;
      begin(s, s.to_move, prefs.level, label);
      changed();
      emit('playfrom');
    },

    play(m) {
      restore();
      if (!current || current.finished) throw new Error('pogo-figures: no game under way');
      const at = current.states[current.states.length - 1]!;
      if (!isTriple(m) || !legal(at).some((l) => sameMove(l, m))) {
        throw new Error(`pogo-figures: illegal move ${JSON.stringify(m)}`);
      }
      current = close({ ...current, moves: [...current.moves, m], states: [...current.states, play(at, m)] });
      changed();
    },

    setReaderColour(c) {
      restore();
      prefs = { ...prefs, readerColour: c };
      write();
      emit('game');
    },

    setLevel(level) {
      restore();
      prefs = { ...prefs, level };
      write();
      emit('game');
    },
  };

  o.target?.addEventListener('pogo:playfrom', (e) => {
    const detail = (e as CustomEvent<PlayFromDetail>).detail;
    if (detail) store.playFrom(detail.state, detail.label);
  });

  return store;
}

/** The page's one store, on sessionStorage and the document. */
export const store: Store = createStore({
  storage: sessionStorageOrNull(),
  target: typeof document === 'undefined' ? undefined : document,
});
