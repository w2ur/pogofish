// What <pogo-moves view="moves"> plays, apart from the DOM: four moves from the
// start position that, between them, show every kind of move the essay's rules
// list (one piece one step; two pieces on the diagonal; three pieces to a
// neighbouring square; a pick of both colours, its top the mover's; a landing
// on an occupied square), then the frames that show each one: the line that
// announces it, the pieces lifted, each square of their path, the landing.
//
// The order is not the rules' list: a stack of three exists only once a move
// has landed on another stack, so the landing on an occupied square comes
// second, and the three-piece move is also the pick of both colours. The kinds
// each move is said to show are checked against the engine's position
// (moves-demo.test.ts), and every move is legal() there.
import { initial, play, type Colour, type State, type Triple } from '../engine';

export type MoveKind = 'one' | 'diagonal' | 'three' | 'mixed' | 'onto';
const KIND_ORDER: readonly MoveKind[] = ['one', 'diagonal', 'three', 'mixed', 'onto'];

export interface DemoMove {
  move: Triple;
  kinds: MoveKind[];
}

/** White a1-1-a2, Red a3-2-a1 onto it, White b1-2-c2 on the diagonal, Red a1-3-b1 lifting both colours. */
export const DEMO: readonly DemoMove[] = [
  { move: [0, 1, 3], kinds: ['one'] },
  { move: [6, 2, 0], kinds: ['onto'] },
  { move: [1, 2, 5], kinds: ['diagonal'] },
  { move: [0, 3, 1], kinds: ['three', 'mixed'] },
];

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

export interface DemoFrame {
  /** Which move of DEMO this frame belongs to. */
  move: number;
  phase: 'announce' | 'lift' | 'step' | 'land';
  /** The position drawn: before the move until it lands, after it once it has. */
  state: State;
  /** The pieces in the air: taken from `from`, now over `at`, the squares passed in `trail`. */
  carry?: { from: number; count: number; pieces: Colour[]; at: number; trail: number[] };
}

/** Every frame of the demonstration, from the start position (see the header). */
export function demoFrames(): DemoFrame[] {
  const frames: DemoFrame[] = [];
  let s = initial();
  DEMO.forEach((d, move) => {
    const [from, count, to] = d.move;
    const pieces = s.cells[from]!.slice(-count);
    const path = movePath(from, count, to);
    frames.push({ move, phase: 'announce', state: s });
    frames.push({ move, phase: 'lift', state: s, carry: { from, count, pieces, at: from, trail: [] } });
    for (let k = 1; k <= count; k++) {
      frames.push({ move, phase: 'step', state: s, carry: { from, count, pieces, at: path[k]!, trail: path.slice(0, k) } });
    }
    s = play(s, d.move);
    frames.push({ move, phase: 'land', state: s });
  });
  return frames;
}
