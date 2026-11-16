// What <pogo-greedy> plays, apart from the DOM: one game of the greedy player
// against itself under lc1-2, drawn from a seed as tools/article-visuals/greedy.mjs
// draws it (mulberry32, ties drawn from the moves in engine order). Each move
// comes with what made greedy choose it: the gap it leaves between the mover's
// stacks and the opponent's, how many legal moves there were, and how many of
// them tied for the best. The figure shows one fixed game, GAME_SEED's: short,
// ended by a real win, and with no position met twice.
import { LC1_2, initial, play, terminal, winner, type Colour, type State, type Triple } from '../engine';
import { WIN_SCORE, greedyScores, mulberry32 } from '../players';

/** greedy.mjs stops a game that has not ended after this many moves. */
export const MAX_PLIES = 200;

/**
 * The game the figure shows: the first seed whose game is short, ends with every
 * stack to one colour and never meets a position twice (greedy-game.test.ts looks for it).
 */
export const GAME_SEED = 2;

/** A short game: at most this many moves, so a full play stays under a minute. */
export const SHORT_PLIES = 12;

/** The stacks each colour owns: those whose top piece is its own. */
export interface Stacks {
  white: number;
  red: number;
}

export function stacks(s: State): Stacks {
  const tops = s.cells.filter((c) => c.length > 0).map((c) => c[c.length - 1]);
  return { white: tops.filter((c) => c === 'White').length, red: tops.filter((c) => c === 'Red').length };
}

/** What chose a move. */
export interface GreedyChoice {
  move: Triple;
  mover: Colour;
  /** The mover's stacks minus the opponent's once the move is played: what greedy maximises. */
  gap: number;
  /** The move ends the game in the mover's favour: greedy takes such a move before any gap. */
  wins: boolean;
  /** How many legal moves the mover had. */
  weighed: number;
  /** How many of them were as good as this one, itself included: the move was drawn among them. */
  tied: number;
}

export interface GreedyFrame {
  state: State;
  stacks: Stacks;
  /** The move that led here; absent at the start. */
  choice?: GreedyChoice;
  /** Set on the frame that ends the game. */
  result: { winner: 'W' | 'R'; byRepetition: boolean } | null;
}

export interface GreedyGame {
  seed: number;
  frames: GreedyFrame[];
  /** False when MAX_PLIES moves were played and nothing ended the game. */
  finished: boolean;
}

export function greedyGame(seed: number = GAME_SEED): GreedyGame {
  const rng = mulberry32(seed);
  let s = initial();
  const frames: GreedyFrame[] = [{ state: s, stacks: stacks(s), result: null }];
  while (frames.length <= MAX_PLIES) {
    const scored = greedyScores(s, LC1_2);
    const best = Math.max(...scored.map((x) => x.score));
    const tied = scored.filter((x) => x.score === best);
    // The draw greedyMove makes, kept here to keep the reason with the move.
    const { move } = tied[Math.floor(rng() * tied.length)]!;
    const mover = s.to_move;
    s = play(s, move);
    const owned = stacks(s);
    const over = terminal(s, LC1_2);
    const w = over ? winner(s, LC1_2) : null;
    frames.push({
      state: s,
      stacks: owned,
      choice: {
        move: [move.from_cell, move.num_pieces, move.to_cell],
        mover,
        gap: mover === 'White' ? owned.white - owned.red : owned.red - owned.white,
        wins: best === WIN_SCORE,
        weighed: scored.length,
        tied: tied.length,
      },
      result: w ? { winner: w, byRepetition: !terminal(s, null) } : null,
    });
    if (over) return { seed, frames, finished: true };
  }
  return { seed, frames, finished: false };
}

/** A gap as the reader reads it: signed, with a true minus (« +2 », « −1 », « 0 »). */
export function gapText(gap: number): string {
  if (gap > 0) return `+${gap}`;
  if (gap < 0) return `−${-gap}`;
  return '0';
}

/** A position apart from how the game reached it: the pieces and the side to move. */
export const positionKey = (s: State): string => `${s.to_move}:${JSON.stringify(s.cells)}`;

/** Whether the game suits the figure: short, ended by a real win, no position met twice. */
export function suits(g: GreedyGame): boolean {
  const last = g.frames.at(-1)!;
  if (!g.finished || !last.result || last.result.byRepetition) return false;
  if (g.frames.length - 1 > SHORT_PLIES) return false;
  return new Set(g.frames.map((f) => positionKey(f.state))).size === g.frames.length;
}
