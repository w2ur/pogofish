// When <pogo-title>'s pieces are in their jump, apart from the DOM. Free-running,
// each disc keeps today's own phase over one period. With a clock (a media
// element of the page), every piece is on the beat: it tops its jump at
// beat-at + k × beat of the media's time, plus a few hundredths of a second of
// its own, so the row reads as a crowd. The letters and the bangs rock from one
// side to the other once per beat, so a full rock is two beats. Everything here
// is a function of the media's time: a loop, a seek or a stall re-phases by
// itself.
//
// What runs in the page is pogo-title.css: paused animations whose
// animation-delay is these formulas written in CSS terms. jumpPhase and
// swayPhase run only in the tests, where title-clock.test.ts reads the sheet's
// delays and checks that they place every piece where these say, so the two
// cannot drift apart silently. pogo-title.ts uses ownDelay, freeRunning and the
// parsers.

/** One up-and-down of a disc when no beat is given: 2 × 0.62 s, the title's period before a clock. */
export const FREE_PERIOD = 1.24;
/** The most a piece's own delay strays from the beat, in seconds, either way. */
export const OWN_SPREAD = 0.03;
/** The most a bang's rock strays from the beat, in seconds, either way. */
export const SWAY_SPREAD = 0.05;

export interface Beat {
  /** Seconds per jump. */
  beat: number;
  /** A moment of the media's time, in seconds, at which the pieces top a jump. */
  beatAt: number;
}

const frac = (x: number): number => x - Math.floor(x);

/** `beat`: a positive number of seconds, else none. */
export function parseBeat(attr: string | null): number | undefined {
  const n = attr === null ? NaN : Number(attr);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** `beat-at`: a number of seconds, 0 when absent or not a number. */
export function parseBeatAt(attr: string | null): number {
  const n = attr === null ? NaN : Number(attr);
  return Number.isFinite(n) ? n : 0;
}

/** A disc's own delay, in seconds, from its place in the row (its free phase, 0 ≤ phase < 1): within ±OWN_SPREAD. */
export function ownDelay(phase: number): number {
  return (phase - 0.5) * 2 * OWN_SPREAD;
}

/**
 * Where a disc is in its jump at media time `t`: 0 on the ground going up, 0.5 at
 * the top, back to the ground at 1. Tops at beatAt + own + k × beat, for every k.
 */
export function jumpPhase(t: number, b: Beat, own = 0): number {
  return frac((t - b.beatAt - own) / b.beat + 0.5);
}

/**
 * Where a rocking letter is at media time `t`, over two beats: 0 leaning one way,
 * 0.5 the other. At beatAt + own + k × beat it is at one side, the side changing each beat.
 */
export function swayPhase(t: number, b: Beat, own = 0): number {
  return frac((t - b.beatAt - own) / (2 * b.beat));
}

/** Without a clock: one period for every disc (the beat if given, else FREE_PERIOD), each at its own phase. */
export function freeRunning(beat: number | undefined): { period: number } {
  return { period: beat ?? FREE_PERIOD };
}
