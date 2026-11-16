// What <pogo-title> draws, apart from the DOM: the title cut into runs of text,
// the O's that become pieces and the « ! » set in the Red side's red. The O's
// are the two camps facing each other: the first half White, the second half
// Red (an odd one out is White). Each piece gets its place in the jump, so the
// discs move out of step, and the same title always draws the same way.

export interface Disc {
  /** The side the piece belongs to. */
  colour: 'white' | 'red';
  /** Where in its jump the disc starts, 0 ≤ phase < 1 of one up-and-down. */
  phase: number;
  /** How high it jumps, as a share of the highest jump, 0.6 ≤ lift ≤ 1. */
  lift: number;
}

/** A run of plain text, one O drawn as a piece, or one « ! » set in red. */
export type Glyph = { text: string } | { text: string; disc: Disc } | { text: string; bang: true };

/** The golden ratio's fractional part: successive multiples spread evenly over [0, 1). */
const SPREAD = 0.6180339887;
const frac = (x: number): number => x - Math.floor(x);

const isO = (ch: string): boolean => ch === 'O' || ch === 'o';

export function titleGlyphs(title: string): Glyph[] {
  const chars = [...title];
  const white = Math.ceil(chars.filter(isO).length / 2);
  const glyphs: Glyph[] = [];
  let run = '';
  let n = 0;
  const flush = (): void => {
    if (run) glyphs.push({ text: run });
    run = '';
  };
  for (const ch of chars) {
    if (ch === '!') {
      flush();
      glyphs.push({ text: ch, bang: true });
    } else if (isO(ch)) {
      flush();
      glyphs.push({
        text: ch,
        disc: {
          colour: n < white ? 'white' : 'red',
          phase: frac((n + 1) * SPREAD),
          lift: 0.6 + 0.4 * frac((n + 1) * SPREAD * SPREAD),
        },
      });
      n++;
    } else {
      run += ch;
    }
  }
  flush();
  return glyphs;
}
