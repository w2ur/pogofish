import { type GameState, type Move } from "../engine/types";
import { legalMoves } from "../engine/engine";

export function randomMove(state: GameState): Move {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error("No legal moves");
  return moves[Math.floor(Math.random() * moves.length)]!;
}
