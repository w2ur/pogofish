// What the playable board decides, apart from the DOM: which stacks the reader
// may lift, how many pieces, where they may land, how the arrow keys move, and
// the words the board says. Every choice is derived from legal(): nothing here
// knows the rules.
import type { Colour, Move, State, Triple } from './engine';
import { moveName } from './engine';
import type { GameRecord } from './store';
import { colon, t, type Lang } from './kit/strings';

/** A lifted stack and how many of its pieces; `null` when nothing is lifted. */
export type Selection = { from: number; count: number } | null;

export type Tap = { selection: Selection } | { play: Triple };

const unique = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);

/** Cells the reader may lift from: those with at least one legal move. */
export const origins = (moves: readonly Move[]): number[] => unique(moves.map((m) => m.from_cell));

/** Counts that can leave `from`, each with at least one legal destination. */
export const counts = (moves: readonly Move[], from: number): number[] =>
  unique(moves.filter((m) => m.from_cell === from).map((m) => m.num_pieces));

export const destinations = (moves: readonly Move[], from: number, count: number): number[] =>
  unique(moves.filter((m) => m.from_cell === from && m.num_pieces === count).map((m) => m.to_cell));

/** Lifts `from` with its smallest count, or nothing if it cannot move. */
function lift(moves: readonly Move[], from: number): Selection {
  const n = counts(moves, from)[0];
  return n === undefined ? null : { from, count: n };
}

/**
 * A tap on `cell`. `moves` is legal() when the reader is to move, else empty.
 * Tapping the lifted stack again cancels; tapping a destination plays; tapping
 * another stack the reader may lift lifts that one instead; anything else keeps
 * the selection.
 */
export function tap(sel: Selection, moves: readonly Move[], cell: number): Tap {
  if (sel === null) return { selection: lift(moves, cell) };
  if (cell === sel.from) return { selection: null };
  if (destinations(moves, sel.from, sel.count).includes(cell)) return { play: [sel.from, sel.count, cell] };
  if (origins(moves).includes(cell)) return { selection: lift(moves, cell) };
  return { selection: sel };
}

/** Changes the count of the lifted stack; a count that cannot move is ignored. */
export function chooseCount(sel: Selection, moves: readonly Move[], n: number): Selection {
  if (sel === null || !counts(moves, sel.from).includes(n)) return sel;
  return { from: sel.from, count: n };
}

/** The cell an arrow key leads to, or `cell` at the edge. Rank 1 is the bottom row, so up is +3. */
export function neighbour(cell: number, key: string): number {
  const col = cell % 3;
  switch (key) {
    case 'ArrowUp':
      return cell + 3 <= 8 ? cell + 3 : cell;
    case 'ArrowDown':
      return cell - 3 >= 0 ? cell - 3 : cell;
    case 'ArrowLeft':
      return col > 0 ? cell - 1 : cell;
    case 'ArrowRight':
      return col < 2 ? cell + 1 : cell;
    default:
      return cell;
  }
}

/** Cells in reading order, as they sit on screen: a3 b3 c3, a2 b2 c2, a1 b1 c1. */
export const SCREEN_ORDER: readonly number[] = [6, 7, 8, 3, 4, 5, 0, 1, 2];

export const cellName = (i: number): string => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;

const colourName = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'white' : 'red');

export type CellMark = 'can-lift' | 'selected' | 'target' | null;

/** « a1 : pile de 2, sommet blanc » / "a1: stack of 2, White on top", then what the reader may do there. */
export function describeCell(lang: Lang, s: State, i: number, mark: CellMark): string {
  const stack = s.cells[i]!;
  const top = stack[stack.length - 1];
  const content =
    top === undefined ? t(lang, 'empty') : `${t(lang, 'stackOf')} ${stack.length}, ${t(lang, top === 'White' ? 'topWhite' : 'topRed')}`;
  const markKey = mark === 'can-lift' ? 'canLift' : mark;
  return `${cellName(i)}${colon(lang)} ${content}${markKey ? `, ${t(lang, markKey)}` : ''}`;
}

/** « Rouge joue b3-2-b1 ». */
export const announceMove = (lang: Lang, mover: Colour, m: Triple): string =>
  `${colourName(lang, mover)} ${t(lang, 'plays')} ${moveName(m)}`;

export interface ResultText {
  /** Who wins, for the shout cut: « Blanc gagne ». */
  who: string;
  /** How: every stack, or the repetition rule and who repeated. */
  how: string;
  /** Whether that is the reader or the AI. */
  you: string;
}

export function resultText(lang: Lang, g: GameRecord): ResultText | null {
  if (!g.finished || g.result === null) return null;
  const winner: Colour = g.result === 'W' ? 'White' : 'Red';
  const loser: Colour = winner === 'White' ? 'Red' : 'White';
  return {
    who: `${colourName(lang, winner)} ${t(lang, 'wins')}`,
    how: g.endedByRepetition
      ? `${colourName(lang, loser)} ${t(lang, 'byRepetition')}`
      : t(lang, winner === 'White' ? 'byStacksWhite' : 'byStacksRed'),
    you: t(lang, winner === g.readerColour ? 'youWin' : 'aiWins'),
  };
}

/**
 * The longest result the board can show, line by line, in `lang`: the status area
 * holds an invisible copy of it, so it keeps one height through the game and the
 * board below never moves when the result appears.
 */
export function longestResult(lang: Lang): ResultText {
  const longest = (xs: string[]): string => xs.reduce((a, b) => (b.length > a.length ? b : a));
  const colours: Colour[] = ['White', 'Red'];
  return {
    who: longest(colours.map((c) => `${colourName(lang, c)} ${t(lang, 'wins')}`)),
    how: longest([
      t(lang, 'byStacksWhite'),
      t(lang, 'byStacksRed'),
      ...colours.map((c) => `${colourName(lang, c)} ${t(lang, 'byRepetition')}`),
    ]),
    you: longest([t(lang, 'youWin'), t(lang, 'aiWins')]),
  };
}

/** The net's measured strength at « normal »: v2-results.md, criterion 1 (arena seed 7, 400 games). */
export const NET_STRENGTH = { score: 0.855, ci95: [0.823, 0.887] as const };

/** « 0,855 [0,823 ; 0,887] » in French, "0.855 [0.823, 0.887]" in English. */
export function formatStrength(lang: Lang): string {
  const n = (x: number): string => (lang === 'fr' ? x.toFixed(3).replace('.', ',') : x.toFixed(3));
  const [lo, hi] = NET_STRENGTH.ci95;
  return lang === 'fr' ? `${n(NET_STRENGTH.score)} [${n(lo)} ; ${n(hi)}]` : `${n(NET_STRENGTH.score)} [${n(lo)}, ${n(hi)}]`;
}
