// The 127 inputs of features() (mover-relative-repetition, crates/infer/src/
// features.rs) cut into what they stand for: per cell, row-major from a1, 12
// slots of the stack bottom to top (+1 a piece of the player to move, −1 one of
// the opponent, 0 none), the top's owner (+1, −1, 0) and the height ÷ 12; then
// one input, the number of times the position occurred earlier in the game ÷ 2.

/** Stack slots per cell: the game has 12 pieces (MAX_STACK). */
export const SLOTS = 12;
/** Inputs per cell: the slots, the top's owner, the height. */
export const PER_CELL = SLOTS + 2;
export const CELLS = 9;
/** The repetition input divides the count by this (features.rs: `occurrences_before() / 2`). */
export const REPETITION_DIVISOR = 2;
/** The height input divides the stack's height by this. */
export const HEIGHT_DIVISOR = SLOTS;
export const INPUTS = CELLS * PER_CELL + 1;

export interface EncodedCell {
  cell: number;
  /** a1…c3. */
  name: string;
  slots: number[];
  top: number;
  height: number;
}

export interface Encoding {
  cells: EncodedCell[];
  /** The last input: earlier occurrences of the position ÷ 2. */
  repetition: number;
}

const cellName = (i: number): string => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;

export function encodingRows(x: ArrayLike<number>): Encoding {
  if (x.length !== INPUTS) throw new Error(`pogo-figures: an encoding has ${INPUTS} inputs, not ${x.length}`);
  const all = Array.from(x);
  const cells = Array.from({ length: CELLS }, (_, cell) => {
    const row = all.slice(cell * PER_CELL, (cell + 1) * PER_CELL);
    return { cell, name: cellName(cell), slots: row.slice(0, SLOTS), top: row[SLOTS]!, height: row[SLOTS + 1]! };
  });
  return { cells, repetition: all[INPUTS - 1]! };
}
