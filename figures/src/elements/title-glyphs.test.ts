import { describe, expect, it } from 'vitest';
import { titleGlyphs, type Disc, type Glyph } from './title-glyphs';

const FR = 'POGOOOOOOOOOO' + ' !'.repeat(11);
const EN = 'POGOOOOOOOOOO' + '!'.repeat(11);
const discs = (g: Glyph[]): Disc[] => g.flatMap((x) => ('disc' in x ? [x.disc] : []));

describe('titleGlyphs', () => {
  it('keeps every character of the title, in order', () => {
    for (const title of [FR, EN, 'Pogo', '']) {
      expect(titleGlyphs(title).map((g) => g.text).join('')).toBe(title);
    }
  });

  it('turns every O into a piece and nothing else', () => {
    const g = titleGlyphs(FR);
    expect(discs(g)).toHaveLength(11);
    for (const x of g) {
      if ('disc' in x) expect(x.text).toBe('O');
      else expect(x.text).not.toMatch(/[Oo]/);
    }
    expect(g.filter((x) => !('disc' in x)).map((x) => x.text)).toEqual(['P', 'G', ' !'.repeat(11)]);
    expect(discs(titleGlyphs('Pogo'))).toHaveLength(2);
  });

  it('draws most pieces in ink, a few red, never two red side by side', () => {
    const colours = discs(titleGlyphs(EN)).map((d) => d.colour);
    const red = colours.filter((c) => c === 'red').length;
    expect(red).toBeGreaterThan(0);
    expect(red).toBeLessThan(colours.length / 2);
    expect(colours.join(' ')).not.toContain('red red');
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
