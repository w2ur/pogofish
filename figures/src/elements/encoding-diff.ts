// What a move does to the 127 inputs (encoding-rows.ts), input by input. The
// encoding is relative to the player to move: when the turn passes, a piece
// that has not moved goes from +1 to −1 or back. So a move changes the inputs
// in two ways, which <pogo-encoding> draws apart: `flipped`, the same piece
// seen from the other side (its sign alone changed), and `changed`, an input
// that says something new about the board (a slot filled or emptied, a top
// that changed hands, a height, the repetition count).
import type { Colour } from '../engine';
import { CELLS, INPUTS, PER_CELL, SLOTS } from './encoding-rows';

export type InputChange = 'same' | 'flipped' | 'changed';

/** An encoding and who was to move when it was taken. */
export interface Encoded {
  x: ArrayLike<number>;
  toMove: Colour;
}

/** Whether input `i` is a sign (a slot or a top's owner) rather than a quantity. */
export const isSign = (i: number): boolean => i < CELLS * PER_CELL && i % PER_CELL <= SLOTS;

/** The colour of the piece a sign input stands for: +1 is the mover's, −1 the opponent's, 0 none. */
export function pieceColour(v: number, toMove: Colour): Colour | null {
  if (v === 0) return null;
  const other: Colour = toMove === 'White' ? 'Red' : 'White';
  return v > 0 ? toMove : other;
}

export function encodingDiff(before: Encoded, after: Encoded): InputChange[] {
  if (before.x.length !== INPUTS || after.x.length !== INPUTS) throw new Error(`pogo-figures: an encoding has ${INPUTS} inputs`);
  return Array.from({ length: INPUTS }, (_, i): InputChange => {
    const b = before.x[i]!;
    const a = after.x[i]!;
    if (!isSign(i)) return a === b ? 'same' : 'changed';
    if (pieceColour(b, before.toMove) !== pieceColour(a, after.toMove)) return 'changed';
    return a === b ? 'same' : 'flipped';
  });
}
