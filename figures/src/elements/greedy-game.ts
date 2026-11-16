// What <pogo-greedy> plays, apart from the DOM: a game of the greedy player
// against itself under lc1-2, drawn from a seed as tools/article-visuals/greedy.mjs
// draws it (mulberry32, ties drawn from the moves in engine order), each move
// with the score that chose it.
import { LC1_2, initial, play, terminal, winner, type Colour, type State, type Triple } from '../engine';
import { LOSS_SCORE, WIN_SCORE, greedyScores, mulberry32 } from '../players';
import { t, type Lang } from '../kit/strings';

/** greedy.mjs stops a game that has not ended after this many moves. */
export const MAX_PLIES = 200;

export interface GreedyFrame {
  state: State;
  /** The move that led here, who made it, its score, how many moves were weighed and how many tied; absent at the start. */
  move?: Triple;
  mover?: Colour;
  score?: number;
  weighed?: number;
  tied?: number;
  /** Set on the frame that ends the game. */
  result: { winner: 'W' | 'R'; byRepetition: boolean } | null;
}

export interface GreedyGame {
  seed: number;
  frames: GreedyFrame[];
  /** False when MAX_PLIES moves were played and nothing ended the game. */
  finished: boolean;
}

export function greedyGame(seed: number): GreedyGame {
  const rng = mulberry32(seed);
  let s = initial();
  const frames: GreedyFrame[] = [{ state: s, result: null }];
  while (frames.length <= MAX_PLIES) {
    const scored = greedyScores(s, LC1_2);
    const best = Math.max(...scored.map((x) => x.score));
    const tied = scored.filter((x) => x.score === best);
    // The draw greedyMove makes, kept here to keep the score with the move.
    const { move } = tied[Math.floor(rng() * tied.length)]!;
    const mover = s.to_move;
    s = play(s, move);
    const over = terminal(s, LC1_2);
    const w = over ? winner(s, LC1_2) : null;
    frames.push({
      state: s,
      move: [move.from_cell, move.num_pieces, move.to_cell],
      mover,
      score: best,
      weighed: scored.length,
      tied: tied.length,
      result: w ? { winner: w, byRepetition: !terminal(s, null) } : null,
    });
    if (over) return { seed, frames, finished: true };
  }
  return { seed, frames, finished: false };
}

/** The score as the reader reads it: the sentinels as « gagne » / « perd », a difference signed with a true minus. */
export function scoreText(lang: Lang, score: number): string {
  if (score === WIN_SCORE) return t(lang, 'wins');
  if (score === LOSS_SCORE) return t(lang, 'loses');
  if (score > 0) return `+${score}`;
  if (score < 0) return `−${-score}`;
  return '0';
}

/** The seed « Nouvelle partie » draws after `seed`: from mulberry32(seed), 1 to 9999, never `seed` itself. */
export function nextSeed(seed: number): number {
  const n = 1 + Math.floor(mulberry32(seed)() * 9999);
  return n === seed ? (n % 9999) + 1 : n;
}

/** The `seed` attribute: a positive integer, 1 when absent. */
export function parseSeed(attr: string | null): number {
  if (attr === null) return 1;
  const n = Number(attr);
  if (!Number.isInteger(n) || n < 1) throw new Error(`pogo-greedy: seed must be a positive integer, not ${JSON.stringify(attr)}`);
  return n;
}
