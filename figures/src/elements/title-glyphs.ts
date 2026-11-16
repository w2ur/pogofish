// What <pogo-title> draws, apart from the DOM: the title cut into runs of text
// and the O's that become pieces. Each piece gets its colour and its place in
// the jump, so the discs move out of step, and the same title always draws the
// same way.

export interface Disc {
  /** `red` is a Red piece; the others are drawn in ink. */
  colour: 'ink' | 'red';
  /** Where in its jump the disc starts, 0 ≤ phase < 1 of one up-and-down. */
  phase: number;
  /** How high it jumps, as a share of the highest jump, 0.6 ≤ lift ≤ 1. */
  lift: number;
}

/** A run of plain text, or one O drawn as a piece. */
export type Glyph = { text: string } | { text: string; disc: Disc };

/** The golden ratio's fractional part: successive multiples spread evenly over [0, 1). */
const SPREAD = 0.6180339887;
const frac = (x: number): number => x - Math.floor(x);

/** Every third O is red, from the third: a minority, never two side by side. */
const isRed = (n: number): boolean => n % 3 === 2;

export function titleGlyphs(title: string): Glyph[] {
  const glyphs: Glyph[] = [];
  let run = '';
  let n = 0;
  for (const ch of title) {
    if (ch !== 'O' && ch !== 'o') {
      run += ch;
      continue;
    }
    if (run) glyphs.push({ text: run });
    run = '';
    glyphs.push({
      text: ch,
      disc: {
        colour: isRed(n) ? 'red' : 'ink',
        phase: frac((n + 1) * SPREAD),
        lift: 0.6 + 0.4 * frac((n + 1) * SPREAD * SPREAD),
      },
    });
    n++;
  }
  if (run) glyphs.push({ text: run });
  return glyphs;
}
