// The sweep of <pogo-mosaic>, apart from the DOM: a stage's hundred squares
// fill one by one in the order of its games, square k at k × SWEEP_STEP_MS, so
// the three programs' mosaics of one stage run in step. A square is in one
// state or the other: it changes at once, at its own delay, which the element
// hands it as a CSS custom property and lets a zero-length transition time.
// Under reduced motion the sheet drops every delay.

/** Milliseconds between one game's square and the next: 100 squares sweep in under a third of a second. */
export const SWEEP_STEP_MS = 3;

/** Games per mosaic. */
const GAMES = 100;

/** How long a whole stage takes to fill: the delay of its last square. */
export const SWEEP_MS = (GAMES - 1) * SWEEP_STEP_MS;

/** When the square of game `index` fills, in ms after its stage is shown. */
export function sweepDelay(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= GAMES) throw new Error(`pogo-mosaic: no game ${index} in a mosaic of ${GAMES}`);
  return index * SWEEP_STEP_MS;
}

/** Which stages are shown at step `k` of the figure: every stage up to it. */
export function shownStages(stages: number, k: number): boolean[] {
  return Array.from({ length: stages }, (_, i) => i <= k);
}
