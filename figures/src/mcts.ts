// AlphaZero's search (PUCT), a port of crates/infer/src/mcts.rs with no root
// noise: a new leaf is valued by the net, a terminal position by its exact
// result, a position met again on the simulation's path is a leaf. Selection
// is q + cPuct·prior·√(N+1)/(1+n), first index among equal scores, and every
// sum, quotient and product is rounded to f32 in the Rust order, so the
// visits equal the Rust's exactly, not approximately.
import { LC1_2, key, legal, play, terminal, winner, type Move, type Rules, type State } from './engine';
import { policyIndex, type AzNet } from './nets';

export interface RootRow {
  move: Move;
  prior: number;
  visits: number;
  /** Mean backed-up value of this move, for the player to move at the root; 0 while unvisited. */
  meanValue: number;
}

export interface SearchSnapshot {
  /** Simulations run so far. */
  sim: number;
  /** One row per legal move at the root, in the order of `legal(s)`. */
  root: RootRow[];
}

export interface SearchOptions {
  /** Simulations to run (default 100, as MctsConfig::default). */
  sims?: number;
  /** Exploration constant (default 1.5). */
  cPuct?: number;
  /** Default lc1-2. */
  rules?: Rules;
  /** Simulations between two yields to the event loop (default 10). */
  batch?: number;
  /** Called after every simulation. */
  onSnapshot?: (s: SearchSnapshot) => void;
  /** Aborting rejects the search with an `AbortError` once the current batch ends. */
  signal?: AbortSignal;
}

const f = Math.fround;

interface Edge {
  move: Move;
  visits: number;
  /** f32. */
  valueSum: number;
  /** f32. */
  prior: number;
}

const hex = (bytes: number[]): string => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * As `search_key` (crates/engine/src/rules.rs): the board and player to move,
 * plus, under LC1, the history as a multiset. Only equality matters here, so
 * any canonical order of the history serves.
 */
function searchKey(s: State, rules: Rules): string {
  if (rules === null) return key(s);
  return `${key(s)}|${s.history.map(hex).sort().join(',')}`;
}

/** As `apply_move_under`: the history is kept only when the rule reads it. */
function playUnder(s: State, m: Move, rules: Rules): State {
  const next = play(s, m);
  return rules === null ? { ...next, history: [] } : next;
}

function abortError(): Error {
  return new DOMException('pogo-figures: search aborted', 'AbortError');
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

class Tree {
  readonly nodes = new Map<string, Edge[]>();

  constructor(
    private readonly net: AzNet,
    private readonly rules: Rules,
    private readonly cPuct: number,
  ) {}

  /** Expands `s` if it is new and has a legal move, returning the net's value when it ran. */
  expandIfNeeded(s: State): number | null {
    const k = searchKey(s, this.rules);
    if (this.nodes.has(k)) return null;
    const moves = legal(s);
    if (moves.length === 0) return null;
    const { priors, value } = this.net.evaluate(s);
    this.nodes.set(
      k,
      moves.map((move) => ({ move, visits: 0, valueSum: 0, prior: priors.get(policyIndex(move))! })),
    );
    return value;
  }

  /** One simulation; returns the value for the player to move at `s`. */
  simulate(s: State, path: Set<string>): number {
    if (terminal(s, this.rules)) {
      const w = winner(s, this.rules);
      if (w === null) return 0;
      return (w === 'W') === (s.to_move === 'White') ? 1 : -1;
    }
    const k = searchKey(s, this.rules);
    const revisit = path.has(k);
    path.add(k);
    const edges = this.nodes.get(k);
    if (revisit || edges === undefined) {
      return this.expandIfNeeded(s) ?? this.net.evaluate(s).value;
    }

    const total = edges.reduce((a, e) => a + e.visits, 0);
    const parentSqrt = f(Math.sqrt(total + 1));
    // f32::MIN in Rust; every score is above it, so -Infinity picks the same edge.
    let best = -Infinity;
    let index = 0;
    edges.forEach((e, i) => {
      const q = e.visits === 0 ? 0 : f(e.valueSum / e.visits);
      const score = f(q + f(f(f(this.cPuct * e.prior) * parentSqrt) / f(1 + e.visits)));
      if (score > best) {
        best = score;
        index = i;
      }
    });

    const edge = edges[index]!;
    const value = -this.simulate(playUnder(s, edge.move, this.rules), path);
    edge.visits += 1;
    edge.valueSum = f(edge.valueSum + value);
    return value;
  }

  snapshot(root: State, sim: number): SearchSnapshot {
    const edges = this.nodes.get(searchKey(root, this.rules)) ?? [];
    return {
      sim,
      root: edges.map((e) => ({
        move: e.move,
        prior: e.prior,
        visits: e.visits,
        meanValue: e.visits === 0 ? 0 : f(e.valueSum / e.visits),
      })),
    };
  }
}

/**
 * Searches `s` and resolves with the final snapshot; the move to play is the
 * most visited (the first in `root` order among equals). Yields to the event
 * loop after every `batch` simulations; an aborted search rejects with an
 * `AbortError` and never resolves with a partial result.
 */
export async function search(s: State, net: AzNet, o: SearchOptions = {}): Promise<SearchSnapshot> {
  const { sims = 100, cPuct = 1.5, rules = LC1_2, batch = 10, onSnapshot, signal } = o;
  if (signal?.aborted) throw abortError();
  const tree = new Tree(net, rules, f(cPuct));
  tree.expandIfNeeded(s);
  let sim = 0;
  while (sim < sims) {
    const end = Math.min(sims, sim + Math.max(1, batch));
    while (sim < end) {
      tree.simulate(s, new Set());
      sim += 1;
      onSnapshot?.(tree.snapshot(s, sim));
    }
    if (sim < sims) await yieldToEventLoop();
    if (signal?.aborted) throw abortError();
  }
  return tree.snapshot(s, sim);
}
