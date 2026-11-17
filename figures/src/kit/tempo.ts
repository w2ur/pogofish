// The page's one tempo for a game played on a board. Every figure that plays
// moves gives each move this long: the move is played, then nothing else
// happens in the figure until MOVE_TEMPO_MS has passed (the next move, or the
// next beat of what the figure tells about it). A figure may hold longer on a
// step the reader must read, as a hold of its own, named apart; it never plays
// a move faster or slower than the others. How long the pieces take to travel
// is board-svg.ts's MOVE_MS, inside this.

/** How long one move of a game lasts on a board, in ms. */
export const MOVE_TEMPO_MS = 1100;
