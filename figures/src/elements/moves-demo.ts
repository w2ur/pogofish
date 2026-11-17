// What <pogo-moves view="moves"> shows, apart from the DOM: every move the
// rules allow from one stack, grouped by how many pieces it lifts. The stack is
// Red’s a1, three pieces high (a white one under two red ones), in the
// position three moves from the start reach; there every count, one, two and
// three, has moves, and some land on occupied squares. Every move comes from
// legal(): footnote 2’s rule, no return to the starting square, is the
// engine’s, never typed here (moves-demo.test.ts holds both). Each group has
// one example, which it plays first; then every other move (fanFrames), the three
// boards at once: the pieces lifted, carried square by square along their path,
// and landed.
import { legal, play, replay, type Colour, type State, type Triple } from '../engine';

export type MoveKind = 'one' | 'diagonal' | 'three' | 'mixed' | 'onto';
const KIND_ORDER: readonly MoveKind[] = ['one', 'diagonal', 'three', 'mixed', 'onto'];

const rc = (i: number): [number, number] => [i % 3, Math.floor(i / 3)];

/** The kinds of the rules' list `m` shows from `s`, in the list's order. */
export function kindsOf(s: State, m: Triple): MoveKind[] {
  const [from, n, to] = m;
  const [x1, y1] = rc(from);
  const [x2, y2] = rc(to);
  const dx = Math.abs(x1 - x2);
  const dy = Math.abs(y1 - y2);
  const picked = s.cells[from]!.slice(-n);
  const has: Record<MoveKind, boolean> = {
    one: n === 1,
    diagonal: n === 2 && dx === 1 && dy === 1,
    three: n === 3 && dx + dy === 1,
    mixed: new Set(picked).size > 1,
    onto: s.cells[to]!.length > 0,
  };
  return KIND_ORDER.filter((k) => has[k]);
}

const neighbours = (i: number): number[] => {
  const [x, y] = rc(i);
  return [
    [x, y + 1],
    [x + 1, y],
    [x, y - 1],
    [x - 1, y],
  ]
    .filter(([a, b]) => a! >= 0 && a! < 3 && b! >= 0 && b! < 3)
    .map(([a, b]) => a! + 3 * b!);
};

/**
 * A walk of `n` orthogonal steps from `from` to `to`, as the pieces could take it:
 * one that never comes back on a square when there is one, else any. Throws when
 * no walk of that length reaches `to` (the move is not one the rules allow).
 */
export function movePath(from: number, n: number, to: number): number[] {
  let fallback: number[] | undefined;
  const walk = (path: number[]): number[] | undefined => {
    const here = path.at(-1)!;
    if (path.length === n + 1) {
      if (here !== to) return undefined;
      if (new Set(path).size === path.length) return path;
      fallback ??= path;
      return undefined;
    }
    for (const next of neighbours(here)) {
      const found = walk([...path, next]);
      if (found) return found;
    }
    return undefined;
  };
  const path = walk([from]) ?? fallback;
  if (!path) throw new Error(`pogo-moves: no walk of ${n} steps from ${from} to ${to}`);
  return path;
}


/** The moves that reach the position the figure shows: White a1-1-a2, Red a3-2-a1, White b1-2-c2. */
export const FAN_PRELUDE: readonly Triple[] = [
  [0, 1, 3],
  [6, 2, 0],
  [1, 2, 5],
];
/** The stack every move leaves from: a1. */
export const FAN_FROM = 0;

export type Count = 1 | 2 | 3;

export interface FanGroup {
  count: Count;
  /** Every legal move from FAN_FROM lifting `count` pieces, by landing square. */
  moves: Triple[];
  /** The one that shows its count’s line of the rules best (see fan()). */
  example: Triple;
  /** The order the figure plays them in: the example first, then by landing square. */
  played: Triple[];
}

export interface Fan {
  state: State;
  from: number;
  groups: FanGroup[];
}

/** What a group’s example is chosen to show first: its count’s own line of the rules. */
const SIGNATURE: Record<Count, MoveKind> = { 1: 'one', 2: 'diagonal', 3: 'three' };

/**
 * The position, the stack, and its moves by count. A group’s example is a move that shows its
 * count’s line of the rules (one step; the diagonal; a neighbouring square), and among those the
 * one that shows the most of the others (both colours lifted, an occupied square); the first by
 * landing square on a tie. Throws if a count has no move: the figure would leave it out.
 */
export function fan(): Fan {
  const state = replay([...FAN_PRELUDE]).at(-1)!;
  const mine = legal(state).filter((m) => m.from_cell === FAN_FROM);
  const groups = ([1, 2, 3] as const).map((count): FanGroup => {
    const moves = mine
      .filter((m) => m.num_pieces === count)
      .map((m): Triple => [m.from_cell, m.num_pieces, m.to_cell])
      .sort((a, b) => a[2] - b[2]);
    if (moves.length === 0) throw new Error(`pogo-moves: no move lifts ${count} from ${FAN_FROM}`);
    const score = (m: Triple): number => {
      const kinds = kindsOf(state, m);
      return (kinds.includes(SIGNATURE[count]) ? 10 : 0) + kinds.length;
    };
    const example = moves.reduce((best, m) => (score(m) > score(best) ? m : best));
    return { count, moves, example, played: [example, ...moves.filter((m) => m !== example)] };
  });
  return { state, from: FAN_FROM, groups };
}

export interface BoardFrame {
  phase: 'rest' | 'lift' | 'step' | 'land';
  /** The move this board is playing; absent at rest. */
  move?: Triple;
  /** The board’s position: before the move until it lands, after it once it has. */
  state: State;
  /** The pieces in the air: taken from `from`, now over `at`, the squares passed in `trail`. */
  carry?: { from: number; count: number; pieces: Colour[]; at: number; trail: number[] };
}

export interface FanFrame {
  /** Which of each board’s moves is playing (0 for the first); -1 on the frame where all rest. */
  round: number;
  /** One per group, in the groups’ order. */
  boards: BoardFrame[];
}

/**
 * The frame with every board at rest, then every move of every board, the three boards at once:
 * round r plays each board’s r-th move (lifted, each square, landed) from the same frame on, and
 * lasts as long as its longest move; a board that has landed holds its landing to the round’s
 * end, and one whose moves are all played rests, every landing shown.
 */
export function fanFrames(f: Fan = fan()): FanFrame[] {
  const rest: BoardFrame = { phase: 'rest', state: f.state };
  const frames: FanFrame[] = [{ round: -1, boards: f.groups.map(() => rest) }];
  const rounds = Math.max(...f.groups.map((g) => g.played.length));
  for (let round = 0; round < rounds; round++) {
    const playing = f.groups.filter((g) => round < g.played.length);
    const ticks = Math.max(...playing.map((g) => g.count + 2));
    for (let t = 0; t < ticks; t++) {
      const boards = f.groups.map((g): BoardFrame => {
        const move = g.played[round];
        if (!move) return rest;
        const [from, count] = move;
        if (t > count) return { phase: 'land', move, state: play(f.state, move) };
        const pieces = f.state.cells[from]!.slice(-count);
        const path = movePath(...move);
        return { phase: t === 0 ? 'lift' : 'step', move, state: f.state, carry: { from, count, pieces, at: path[t]!, trail: path.slice(0, t) } };
      });
      frames.push({ round, boards });
    }
  }
  return frames;
}
