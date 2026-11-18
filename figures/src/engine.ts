// The only module that talks to the WASM engine. It owns the two traps of
// that API: a null rule set poisons the instance, and cells are indexed
// row-major 0..8 with the stack bottom first.
import * as wasm from 'pogofish-wasm';
import { assetUrl, WASM_FILE } from './assets';

export type Colour = 'White' | 'Red';

/** The Rust JSON shape: `cells` row-major 0..8, each stack bottom first. */
export interface State {
  cells: Colour[][];
  to_move: Colour;
  move_count: number;
  history: number[][];
}

export interface Move {
  from_cell: number;
  num_pieces: 1 | 2 | 3;
  to_cell: number;
}

/** `[from, n, to]`, the convention of the JSON files. */
export type Triple = [number, number, number];

/** `null` is game A, the published rules with no stopping rule. */
export type Rules = { LC1: { repetitions: 2 } } | null;

export const LC1_2: Rules = { LC1: { repetitions: 2 } };

// The WASM names game A by a unit variant; passing null would throw and
// leave the instance unusable, so the mapping lives here and nowhere else.
const UNCAPPED = 'Uncapped';
const wasmRules = (rules: Rules): unknown => rules ?? UNCAPPED;

const HERE = './';
const FEATURES = 'mover-relative-repetition';

let readyPromise: Promise<void> | undefined;

async function loadBytes(url: URL): Promise<BufferSource> {
  if (url.protocol === 'file:') {
    // Tests run in Node, where fetch cannot read file: URLs. The specifier is
    // opaque to Vite so a browser build never tries to bundle node:fs.
    const specifier = 'node:fs/promises';
    const { readFile } = (await import(/* @vite-ignore */ specifier)) as typeof import('node:fs/promises');
    return readFile(url);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`pogo-figures: could not fetch ${url.href} (${response.status})`);
  }
  return response.arrayBuffer();
}

/** Loads the engine once; later calls return the same promise, or try again after a failure. */
export function ready(wasmUrl?: string): Promise<void> {
  readyPromise ??= (async () => {
    // Relative to the package's root, not to this module: it sits in a chunk under assets/.
    const url = new URL(wasmUrl ?? WASM_FILE, assetUrl(HERE));
    wasm.initSync({ module: await loadBytes(url) });
  })().catch((error: unknown) => {
    readyPromise = undefined;
    throw error;
  });
  return readyPromise;
}

export function initial(): State {
  return wasm.initial_state() as State;
}

export function legal(s: State): Move[] {
  return wasm.legal_moves(s) as Move[];
}

const asMove = (m: Move | Triple): Move =>
  Array.isArray(m) ? { from_cell: m[0], num_pieces: m[1] as Move['num_pieces'], to_cell: m[2] } : m;

export function play(s: State, m: Move | Triple): State {
  return wasm.apply_move(s, asMove(m)) as State;
}

export function terminal(s: State, rules: Rules = LC1_2): boolean {
  return wasm.is_terminal(s, wasmRules(rules)) != null;
}

export function winner(s: State, rules: Rules = LC1_2): 'W' | 'R' | null {
  const w = wasm.winner_with_rules(s, wasmRules(rules)) as string | null;
  return w === 'W' || w === 'R' ? w : null;
}

export function key(s: State): string {
  return wasm.state_key(s);
}

export function features(s: State): Float32Array {
  return wasm.encode_features(s, FEATURES);
}

/** `states[0]` is `from` (default: the initial position), one state per ply. */
export function replay(moves: Triple[], from: State = initial()): State[] {
  const states = [from];
  for (const m of moves) states.push(play(states[states.length - 1]!, m));
  return states;
}

const cellName = (i: number): string => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;
const cellIndex = (name: string): number => 'abc'.indexOf(name[0]!) + 3 * (Number(name[1]) - 1);

export function moveName(m: Move | Triple): string {
  const [from, n, to] = Array.isArray(m) ? m : [m.from_cell, m.num_pieces, m.to_cell];
  return `${cellName(from)}-${n}-${cellName(to)}`;
}

export function parseMoveName(name: string): Triple {
  const match = /^([abc][123])-([123])-([abc][123])$/.exec(name);
  if (!match) throw new Error(`pogo-figures: bad move name "${name}"`);
  return [cellIndex(match[1]!), Number(match[2]), cellIndex(match[3]!)];
}
