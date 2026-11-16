import { describe, expect, it } from 'vitest';
import { titleGlyphs, titleGroups, type Disc, type Glyph } from './title-glyphs';

const FR = 'POOOOOOGOOOOOO' + ' !'.repeat(8);
const EN = 'POOOOOOGOOOOOO' + '!'.repeat(8);
const discs = (g: Glyph[]): Disc[] => g.flatMap((x) => ('disc' in x ? [x.disc] : []));
const colours = (title: string): string => discs(titleGlyphs(title)).map((d) => d.colour[0]).join('');

describe('titleGlyphs', () => {
  it('keeps every character of the title, in order', () => {
    for (const title of [FR, EN, 'POGOOOOOOOOOO ! !', 'Pogo', '']) {
      expect(titleGlyphs(title).map((g) => g.text).join('')).toBe(title);
    }
  });

  it('turns every O into a piece and every « ! » into a red bang, nothing else', () => {
    const g = titleGlyphs(FR);
    expect(discs(g)).toHaveLength(12);
    expect(g.filter((x) => 'bang' in x)).toHaveLength(8);
    for (const x of g) {
      if ('disc' in x) expect(x.text).toBe('O');
      else if ('bang' in x) expect(x.text).toBe('!');
      else expect(x.text).not.toMatch(/[Oo!]/);
    }
    expect(g.filter((x) => !('disc' in x) && !('bang' in x)).map((x) => x.text)).toEqual(['P', 'G', ...Array(8).fill(' ')]);
  });

  it('twelve O’s are the two camps: six White, then six Red', () => {
    expect(colours(FR)).toBe('wwwwwwrrrrrr');
    expect(colours(EN)).toBe('wwwwwwrrrrrr');
  });

  it('another count splits the same way, the odd one out White', () => {
    expect(colours('POGOOOOOOOOOO')).toBe('wwwwwwrrrrr');
    expect(colours('Pogo')).toBe('wr');
    expect(colours('O')).toBe('w');
    expect(colours('!!!')).toBe('');
  });

  it('sets the pieces out of step: distinct phases in [0, 1), lifts in [0.6, 1]', () => {
    const d = discs(titleGlyphs(FR));
    const phases = d.map((x) => x.phase);
    expect(new Set(phases).size).toBe(phases.length);
    for (const x of d) {
      expect(x.phase).toBeGreaterThanOrEqual(0);
      expect(x.phase).toBeLessThan(1);
      expect(x.lift).toBeGreaterThanOrEqual(0.6);
      expect(x.lift).toBeLessThanOrEqual(1);
    }
    // Neighbours are never nearly in step.
    for (let i = 1; i < phases.length; i++) {
      const gap = Math.abs(phases[i]! - phases[i - 1]!);
      expect(Math.min(gap, 1 - gap)).toBeGreaterThan(0.1);
    }
  });

  it('draws the same title the same way every time', () => {
    expect(titleGlyphs(FR)).toEqual(titleGlyphs(FR));
  });
});

describe('titleGroups', () => {
  const FR_PAGE = 'POOOOOOGOOOOOO' + ' !'.repeat(8);
  const shape = (title: string) =>
    titleGroups(title).map((g) => ({ kind: g.kind, text: g.glyphs.map((x) => x.text).join('') }));

  it('the title is three groups: P and six White, G and six Red, the eight bangs', () => {
    for (const title of [FR_PAGE, FR, EN]) {
      const groups = titleGroups(title);
      expect(groups.map((g) => g.kind)).toEqual(['camp', 'camp', 'bangs']);
      expect(groups[0]!.glyphs.map((x) => ('disc' in x ? x.disc.colour : x.text))).toEqual(['P', ...Array(6).fill('white')]);
      expect(groups[1]!.glyphs.map((x) => ('disc' in x ? x.disc.colour : x.text))).toEqual(['G', ...Array(6).fill('red')]);
      expect(groups[2]!.glyphs.filter((x) => 'bang' in x)).toHaveLength(8);
    }
    // The no-break space before each French bang belongs to the bang run, never to the Red camp.
    expect(shape(FR_PAGE)[2]!.text).toBe(' !'.repeat(8));
  });

  it('a letter takes the colour of the camp it leads: G red, P ink', () => {
    const letters = titleGlyphs(FR_PAGE).filter((x) => !('disc' in x) && !('bang' in x) && x.text.trim());
    expect(letters).toEqual([{ text: 'P' }, { text: 'G', red: true }]);
  });

  it('another shape still groups sensibly and does not throw', () => {
    expect(shape('POGOOO !')).toEqual([
      { kind: 'camp', text: 'PO' },
      { kind: 'camp', text: 'GOOO' },
      { kind: 'space', text: ' ' },
      { kind: 'bangs', text: '!' },
    ]);
    // Four O's: two White, two Red. G leads the Red ones in « POOGOO »; in « POGOOO » the O after G is still White.
    expect(titleGlyphs('POOGOO').find((x) => x.text === 'G')).toEqual({ text: 'G', red: true });
    expect(titleGlyphs('POGOOO').find((x) => x.text === 'G')).toEqual({ text: 'G' });
    expect(shape('TD')).toEqual([{ kind: 'camp', text: 'TD' }]);
    expect(shape('OOP')).toEqual([{ kind: 'camp', text: 'OO' }, { kind: 'camp', text: 'P' }]);
    expect(shape('!!')).toEqual([{ kind: 'bangs', text: '!!' }]);
    expect(shape('')).toEqual([]);
    // A letter with no O after it stays ink.
    expect(titleGlyphs('POP').at(-1)).toEqual({ text: 'P' });
  });

  it('keeps every character, whatever the shape', () => {
    for (const title of [FR_PAGE, 'POGOOO !', 'a b c ! !', 'Oo!o']) {
      expect(shape(title).map((g) => g.text).join('')).toBe(title);
    }
  });
});
