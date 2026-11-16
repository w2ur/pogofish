// The demonstration <pogo-encoding> plays by itself: from the essay's position
// (net-position.ts: the default game after DEFAULT_PLY moves), the next moves
// of that same game, so the grid is seen following a board that changes. Every
// position comes from the engine.
import { DEFAULT_GAME } from '../default-game';
import { replay, type State, type Triple } from '../engine';
import { DEFAULT_PLY, defaultPosition } from './net-position';

/** Moves the demonstration plays. */
export const DEMO_MOVES = 4;

export interface EncodingDemo {
  /** The essay's position, then one position per move played. */
  states: State[];
  moves: Triple[];
}

export function encodingDemo(): EncodingDemo {
  const moves = DEFAULT_GAME.slice(DEFAULT_PLY, DEFAULT_PLY + DEMO_MOVES) as Triple[];
  if (moves.length !== DEMO_MOVES) throw new Error(`pogo-encoding: the default game has no ${DEMO_MOVES} moves after its move ${DEFAULT_PLY}`);
  return { states: replay(moves, defaultPosition()), moves };
}
