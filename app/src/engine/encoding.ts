import { type Move, NUM_CELLS } from "./types";

export const ACTION_SIZE = NUM_CELLS * 3 * NUM_CELLS; // 243

// The input encoding lives in the Rust engine only: see encodeFeatures in ./engine.

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
