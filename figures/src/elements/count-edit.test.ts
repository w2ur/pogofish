import fc from 'fast-check';
import type { Colour } from '../engine';
import { BARS, CELLS, PIECES, fromRow, toRow, type Row } from './count-row';
import { itemsRow, moveTop, rowItems, swapItems, type Item } from './count-edit';

/** Any row: an order of six white and six red pieces, and eight separators in non-decreasing places. */
const anyRow = (): fc.Arbitrary<Row> =>
  fc
    .tuple(
      fc.shuffledSubarray([...Array(PIECES).keys()], { minLength: 6, maxLength: 6 }),
      fc.array(fc.integer({ min: 0, max: PIECES }), { minLength: BARS, maxLength: BARS }),
    )
    .map(([white, bars]) => ({
      order: Array.from({ length: PIECES }, (_, k): Colour => (white.includes(k) ? 'White' : 'Red')),
      bars: [...bars].sort((a, b) => a - b),
    }));

const start: Row = toRow([['White', 'White'], ['White', 'White'], ['White', 'White'], [], [], [], ['Red', 'Red'], ['Red', 'Red'], ['Red', 'Red']]);
const pieceCount = (items: Item[], c: Item) => items.filter((x) => x === c).length;

describe('rowItems / itemsRow: the row as its 20 places', () => {
  it('reads the start position as the essay draws it', () => {
    expect(rowItems(start).map((x) => (x === 'bar' ? '|' : x[0])).join('')).toBe('WW|WW|WW||||RR|RR|RR');
  });

  it('are inverse of each other', () => {
    fc.assert(
      fc.property(anyRow(), (row) => {
        expect(itemsRow(rowItems(row))).toEqual(row);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('swapItems: the reader swaps two things of the row', () => {
  it('keeps twelve pieces, six of each colour, and eight separators, and only those two places change', () => {
    fc.assert(
      fc.property(anyRow(), fc.nat(19), fc.nat(19), (row, a, b) => {
        const before = rowItems(row);
        const after = rowItems(swapItems(row, a, b));
        expect(after).toHaveLength(PIECES + BARS);
        for (const c of ['White', 'Red', 'bar'] as const) expect(pieceCount(after, c)).toBe(pieceCount(before, c));
        expect(after[a]).toBe(before[b]);
        expect(after[b]).toBe(before[a]);
        after.forEach((x, k) => {
          if (k !== a && k !== b) expect(x).toBe(before[k]);
        });
      }),
      { numRuns: 1000 },
    );
  });

  it('a piece swapped with a separator changes square: the board follows', () => {
    // WW|WW|… : the second white piece and the first separator change places.
    const row = swapItems(start, 1, 2);
    expect(fromRow(row).slice(0, 2)).toEqual([['White'], ['White', 'White', 'White']]);
  });

  it('refuses a place outside the row', () => {
    expect(() => swapItems(start, 0, 20)).toThrow();
  });
});

describe('moveTop: the reader moves a piece from one square to another on the board', () => {
  it('takes the top piece of a square and puts it on top of another, the row following', () => {
    const row = moveTop(start, 6, 4);
    const cells = fromRow(row);
    expect(cells[6]).toEqual(['Red']);
    expect(cells[4]).toEqual(['Red']);
    expect(rowItems(row).map((x) => (x === 'bar' ? '|' : x[0])).join('')).toBe('WW|WW|WW||R||R|RR|RR');
  });

  it('keeps every other stack, and the moved piece is the new top', () => {
    fc.assert(
      fc.property(anyRow(), fc.nat(CELLS - 1), fc.nat(CELLS - 1), (row, from, to) => {
        const cells = fromRow(row);
        if (cells[from]!.length === 0 || from === to) return;
        const after = fromRow(moveTop(row, from, to));
        expect(after[from]).toEqual(cells[from]!.slice(0, -1));
        expect(after[to]).toEqual([...cells[to]!, cells[from]!.at(-1)!]);
        after.forEach((s, i) => {
          if (i !== from && i !== to) expect(s).toEqual(cells[i]);
        });
      }),
      { numRuns: 1000 },
    );
  });

  it('refuses an empty square and a move onto itself', () => {
    expect(() => moveTop(start, 4, 1)).toThrow();
    expect(() => moveTop(start, 0, 0)).toThrow();
  });
});
