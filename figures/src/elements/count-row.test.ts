import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initial, type Colour } from '../engine';
import { BARS, CELLS, PIECES, fromRow, places, toRow, type Row } from './count-row';

/** Any order of 6 white and 6 red pieces. */
const order = fc.shuffledSubarray([...Array<Colour>(6).fill('White'), ...Array<Colour>(6).fill('Red')], { minLength: PIECES });
/** Any places for the 8 separators: 8 numbers from 0 to 12, in order. */
const bars = fc.array(fc.integer({ min: 0, max: PIECES }), { minLength: BARS, maxLength: BARS }).map((b) => [...b].sort((x, y) => x - y));
const row = fc.record({ order, bars });
/** Any position: a row folded. Every arrangement of the 12 pieces on the 9 squares is reached this way. */
const cells = row.map(fromRow);

describe('a position is a pile of 12 pieces cut by 8 separators', () => {
  it('every row folds into a position and unfolds into itself', () => {
    fc.assert(
      fc.property(row, (r) => {
        const folded = fromRow(r);
        expect(folded).toHaveLength(CELLS);
        expect(folded.flat()).toHaveLength(PIECES);
        expect(toRow(folded)).toEqual(r);
      }),
      { numRuns: 1000 },
    );
  });

  it('every position unfolds into a row and folds into itself', () => {
    fc.assert(
      fc.property(cells, (c) => {
        const r = toRow(c);
        expect(r.order).toHaveLength(PIECES);
        expect(r.bars).toHaveLength(BARS);
        expect(fromRow(r)).toEqual(c);
      }),
      { numRuns: 1000 },
    );
  });

  it('two different rows are two different positions', () => {
    fc.assert(
      fc.property(row, row, (a, b) => {
        const same = JSON.stringify(a) === JSON.stringify(b);
        expect(JSON.stringify(fromRow(a)) === JSON.stringify(fromRow(b))).toBe(same);
      }),
      { numRuns: 1000 },
    );
  });

  it('the row has 20 places, each taken once, the pieces in their order and the separators in theirs', () => {
    fc.assert(
      fc.property(row, (r) => {
        const p = places(r);
        expect([...p.pieces, ...p.bars].sort((a, b) => a - b)).toEqual(Array.from({ length: PIECES + BARS }, (_, i) => i));
        expect(p.pieces).toEqual([...p.pieces].sort((a, b) => a - b));
        expect(p.bars).toEqual([...p.bars].sort((a, b) => a - b));
        // Between two separators lie exactly the pieces of the square between them.
        const folded = fromRow(r);
        const edges = [-1, ...p.bars, PIECES + BARS];
        folded.forEach((stack, i) => expect(p.pieces.filter((x) => x > edges[i]! && x < edges[i + 1]!)).toHaveLength(stack.length));
      }),
      { numRuns: 500 },
    );
  });

  it('the start position reads WW|WW|WW||||RR|RR|RR: square order, and an empty square is two separators side by side', () => {
    const r = toRow(initial().cells);
    expect(r.order.map((c) => c[0]).join('')).toBe('WWWWWWRRRRRR');
    expect(r.bars).toEqual([2, 4, 6, 6, 6, 6, 8, 10]);
    const p = places(r);
    const line = Array<string>(PIECES + BARS).fill('?');
    p.pieces.forEach((x, k) => (line[x] = r.order[k]![0]!));
    p.bars.forEach((x) => (line[x] = '|'));
    expect(line.join('')).toBe('WW|WW|WW||||RR|RR|RR');
  });

  it('a stack is laid bottom first', () => {
    const c: Colour[][] = [['Red', 'White'], [], [], [], [], [], [], [], ['White', 'White', 'White', 'White', 'White', 'Red', 'Red', 'Red', 'Red', 'Red']];
    expect(toRow(c).order.slice(0, 2)).toEqual(['Red', 'White']);
    expect(toRow(c).bars).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it('refuses what is not a row or not a board', () => {
    const ok = toRow(initial().cells);
    expect(() => fromRow({ ...ok, order: ok.order.slice(1) })).toThrow(/12 pieces/);
    expect(() => fromRow({ ...ok, order: Array<Colour>(12).fill('White') })).toThrow(/as many/);
    expect(() => fromRow({ ...ok, bars: ok.bars.slice(1) })).toThrow(/8 separators/);
    expect(() => fromRow({ ...ok, bars: [3, 2, 6, 6, 6, 6, 8, 10] })).toThrow(/comes before/);
    expect(() => fromRow({ ...ok, bars: [2, 4, 6, 6, 6, 6, 8, 13] })).toThrow(/out of the row/);
    expect(() => toRow(initial().cells.slice(1))).toThrow(/9 squares/);
  });
});
