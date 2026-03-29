import { type GameState, type Move, W, R, MAX_STACK, NUM_CELLS } from "./types";

export const STATE_SIZE = MAX_STACK * NUM_CELLS + 1; // 109
export const ACTION_SIZE = NUM_CELLS * 3 * NUM_CELLS; // 243

const PIECE_VALUE: Record<string, number> = { [W]: 1.0, [R]: -1.0 };
const PLAYER_VALUE: Record<string, number> = { [W]: 1.0, [R]: -1.0 };

export function stateToTensor(state: GameState): Float32Array {
  const data = new Float32Array(STATE_SIZE);
  for (let cellIdx = 0; cellIdx < NUM_CELLS; cellIdx++) {
    const stack = state.board[cellIdx];
    if (stack === undefined) continue;
    const base = cellIdx * MAX_STACK;
    for (let depth = 0; depth < stack.length; depth++) {
      const piece = stack[depth];
      if (piece !== undefined) {
        data[base + depth] = PIECE_VALUE[piece] ?? 0;
      }
    }
  }
  data[STATE_SIZE - 1] = PLAYER_VALUE[state.currentPlayer] ?? 0;
  return data;
}

export function actionToIndex(move: Move): number {
  return move.fromCell * 27 + (move.numPieces - 1) * 9 + move.toCell;
}

export function indexToAction(index: number): Move {
  const fromCell = Math.floor(index / 27);
  const remainder = index % 27;
  const numPieces = Math.floor(remainder / 9) + 1;
  const toCell = remainder % 9;
  return { fromCell, numPieces, toCell };
}

export function maskedSoftmax(
  logits: Float32Array,
  legalActionIndices: number[],
): Float32Array {
  const probs = new Float32Array(ACTION_SIZE);
  if (legalActionIndices.length === 0) return probs;
  let maxVal = -Infinity;
  for (const idx of legalActionIndices) {
    const v = logits[idx];
    if (v !== undefined && v > maxVal) maxVal = v;
  }
  let sum = 0;
  for (const idx of legalActionIndices) {
    const v = logits[idx] ?? 0;
    const exp = Math.exp(v - maxVal);
    probs[idx] = exp;
    sum += exp;
  }
  if (sum > 0) {
    for (const idx of legalActionIndices) {
      probs[idx] = (probs[idx] ?? 0) / sum;
    }
  }
  return probs;
}
