// What <pogo-title> draws, apart from the DOM: the title cut into groups, then
// runs of text, the O's that become pieces and the « ! » set in the Red side's
// red. The O's are the two camps facing each other: the first half White, the
// second half Red (an odd one out is White). A letter takes the colour of the
// camp it leads: red when the next O after it is a Red piece, ink otherwise.
// Each piece gets its place in the jump, so the discs move out of step, and
// the same title always draws the same way.
//
// Groups say where the title may break. A letter and the O's that follow it
// are one group that never breaks (« POOOOOO », « GOOOOOO »); the run of
// bangs, with the no-break spaces glued to them, is another, broken only as a
// last resort; a breakable space stands alone between groups.

export interface Disc {
  /** The side the piece belongs to. */
  colour: 'white' | 'red';
  /** Where in its jump the disc starts, 0 ≤ phase < 1 of one up-and-down. */
  phase: number;
  /** How high it jumps, as a share of the highest jump, 0.6 ≤ lift ≤ 1. */
  lift: number;
}

/** A run of plain text (`red` when it leads the Red camp), one O drawn as a piece, or one « ! » set in red. */
export type Glyph = { text: string; red?: true } | { text: string; disc: Disc } | { text: string; bang: true };

export interface TitleGroup {
  /** `camp`: a letter and its O's, never broken. `bangs`: broken only as a last resort. `space`: a break. */
  kind: 'camp' | 'bangs' | 'space';
  glyphs: Glyph[];
}

/** The golden ratio's fractional part: successive multiples spread evenly over [0, 1). */
const SPREAD = 0.6180339887;
const frac = (x: number): number => x - Math.floor(x);

const isO = (ch: string): boolean => ch === 'O' || ch === 'o';
/** No-break spaces: U+00A0 and the narrow U+202F French sets before « ! ». */
const isGlue = (ch: string): boolean => ch === ' ' || ch === ' ';
const isBreakSpace = (ch: string): boolean => /\s/.test(ch) && !isGlue(ch);

export function titleGroups(title: string): TitleGroup[] {
  const chars = [...title];
  const total = chars.filter(isO).length;
  const white = Math.ceil(total / 2);
  /** The colour of the n-th O, counted from 0. */
  const side = (n: number): 'white' | 'red' => (n < white ? 'white' : 'red');

  const groups: TitleGroup[] = [];
  let cur: TitleGroup | undefined;
  const open = (kind: TitleGroup['kind']): TitleGroup => {
    const g: TitleGroup = { kind, glyphs: [] };
    groups.push(g);
    cur = g;
    return g;
  };
  /** Appends plain text, joining it to the run before when that run has the same colour. */
  const text = (g: TitleGroup, ch: string, red: boolean): void => {
    const last = g.glyphs[g.glyphs.length - 1];
    if (last && !('disc' in last) && !('bang' in last) && (last.red === true) === red) last.text += ch;
    else g.glyphs.push(red ? { text: ch, red: true } : { text: ch });
  };

  let n = 0;
  chars.forEach((ch, i) => {
    if (isO(ch)) {
      const g = cur?.kind === 'camp' ? cur : open('camp');
      g.glyphs.push({
        text: ch,
        disc: { colour: side(n), phase: frac((n + 1) * SPREAD), lift: 0.6 + 0.4 * frac((n + 1) * SPREAD * SPREAD) },
      });
      n++;
      return;
    }
    // A bang, or a no-break space that glues the bang after it: the bang run.
    const next = chars.slice(i).find((c) => !isGlue(c));
    if (ch === '!' || (isGlue(ch) && next === '!')) {
      const g = cur?.kind === 'bangs' ? cur : open('bangs');
      if (ch === '!') g.glyphs.push({ text: ch, bang: true });
      else text(g, ch, false);
      return;
    }
    if (isBreakSpace(ch)) {
      text(cur?.kind === 'space' ? cur : open('space'), ch, false);
      return;
    }
    // A letter leads a camp: a new one after any O or bang, the same one after another letter.
    const leading = cur !== undefined && cur.kind === 'camp' && cur.glyphs.every((g) => !('disc' in g));
    const g = leading && cur ? cur : open('camp');
    const nextO = chars.slice(i + 1).some(isO) ? side(n) : null;
    text(g, ch, nextO === 'red');
  });
  return groups;
}

/** The glyphs of every group, in order. */
export function titleGlyphs(title: string): Glyph[] {
  return titleGroups(title).flatMap((g) => g.glyphs);
}
