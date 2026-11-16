// What <pogo-line> replays, apart from the DOM: a line of moves turned into
// frames, one per ply, under the rules the page names. Under game A a line that
// comes back to its start is a loop and plays on without end; under lc1-2 the
// same line is repeated until the repetition rule ends it, and every frame says
// how many times its position has been seen.
import type { TableData } from '../data';
import { LC1_2, initial, key, play, terminal, winner, type Colour, type Rules, type State, type Triple } from '../engine';
import { t, type Fidelity, type Lang } from '../kit/strings';
import { TABLE_SOURCE } from '../table';

export type LineName = keyof TableData['lines'];

const LINES: readonly LineName[] = ['shortestWin', 'loop', 'centreLoss', 'openingWin'];

/** The `rules` attribute: "A" is game A (no stopping rule), "lc1-2" the repetition rule. */
export function parseRules(attr: string | null): Rules {
  if (attr === 'A') return null;
  if (attr === 'lc1-2') return LC1_2;
  throw new Error(`pogo-line: rules must be "A" or "lc1-2", not ${JSON.stringify(attr)}`);
}

export function parseLine(attr: string | null): LineName {
  const found = LINES.find((l) => l === attr);
  if (!found) throw new Error(`pogo-line: unknown line ${JSON.stringify(attr)}`);
  return found;
}

export interface Frame {
  ply: number;
  state: State;
  /** The move that led here, and who made it; absent at ply 0. */
  move?: Triple;
  mover?: Colour;
  /** Under lc1-2, how many times this position has stood so far in the line; null under game A. */
  seen: number | null;
  /** Set on the frame that ends the game. */
  result: { winner: 'W' | 'R'; byRepetition: boolean } | null;
}

export interface LineFrames {
  frames: Frame[];
  /** The last frame is the first position again and nothing ends it: play wraps. */
  cyclic: boolean;
}

/** A loop is repeated at most this many times under lc1-2 before the frames stop anyway. */
const MAX_CYCLES = 8;

export function lineFrames(moves: readonly Triple[], rules: Rules, start: State = initial()): LineFrames {
  const counts = new Map<string, number>();
  const see = (s: State): number | null => {
    if (rules === null) return null;
    const k = key(s);
    const n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    return n;
  };
  const frames: Frame[] = [{ ply: 0, state: start, seen: see(start), result: null }];

  const playAll = (): boolean => {
    for (const m of moves) {
      const before = frames[frames.length - 1]!.state;
      const state = play(before, m);
      const over = terminal(state, rules);
      const w = over ? winner(state, rules) : null;
      frames.push({
        ply: frames.length,
        state,
        move: m,
        mover: before.to_move,
        seen: see(state),
        result: w ? { winner: w, byRepetition: rules !== null && !terminal(state, null) } : null,
      });
      if (over) return true;
    }
    return false;
  };

  if (playAll()) return { frames, cyclic: false };
  const closes = moves.length > 0 && key(frames[frames.length - 1]!.state) === key(start);
  if (!closes) return { frames, cyclic: false };
  if (rules === null) return { frames, cyclic: true };
  for (let cycle = 1; cycle < MAX_CYCLES; cycle++) if (playAll()) break;
  return { frames, cyclic: false };
}

/** « Cette position pour la 2e fois » / "This position for the 2nd time". */
export function seenText(lang: Lang, n: number): string {
  return `${t(lang, 'seenFor')} ${ordinal(lang, n)} ${t(lang, 'seenTime')}`;
}

function ordinal(lang: Lang, n: number): string {
  if (lang === 'fr') return n === 1 ? '1re' : `${n}e`;
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * What a line's label may claim (spec §7). The shortest win and the loop are the
 * engine's, under either rule set. The centre loss and the opening win are the
 * solved table's, which is game A's alone: measured under "A", only computed under
 * lc1-2, where the table says nothing.
 */
export function lineFidelity(name: LineName, rules: Rules): { kind: Fidelity; source?: string } {
  const fromTable = name === 'centreLoss' || name === 'openingWin';
  return fromTable && rules === null ? { kind: 'measured', source: TABLE_SOURCE } : { kind: 'live' };
}
