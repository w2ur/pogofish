import fc from 'fast-check';
import type { Colour } from '../engine';
import { BARS, CELLS, PIECES, fromRow, places, toRow, type Row } from './count-row';
import { MAX_LIFT, boardMoves, itemsRow, moveItem, movePieces, rowItems, type Item } from './count-edit';

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
const place = fc.integer({ min: 0, max: PIECES + BARS - 1 });

const start: Row = toRow([['White', 'White'], ['White', 'White'], ['White', 'White'], [], [], [], ['Red', 'Red'], ['Red', 'Red'], ['Red', 'Red']]);
const drawn = (row: Row) => rowItems(row).map((x) => (x === 'bar' ? '|' : x[0])).join('');
const pieceCount = (items: Item[], c: Item) => items.filter((x) => x === c).length;

describe('rowItems / itemsRow: the row as its 20 places', () => {
  it('reads the start position as the essay draws it', () => {
    expect(drawn(start)).toBe('WW|WW|WW||||RR|RR|RR');
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

describe('moveItem: the reader takes one thing of the row and puts it at another place', () => {
  it('a piece dragged over a separator changes square; a separator dragged over a piece cuts elsewhere', () => {
    // The second white piece of a1 goes after the first separator: b1 holds three, bottom first.
    expect(drawn(moveItem(start, 1, 2).row)).toBe('W|WWW|WW||||RR|RR|RR');
    expect(fromRow(moveItem(start, 1, 2).row)[1]).toEqual(['White', 'White', 'White']);
    // The first separator goes to the far right: a1 takes b1's pieces, c3 is empty.
    expect(drawn(moveItem(start, 2, 19).row)).toBe('WWWW|WW||||RR|RR|RR|');
    // Back the other way, the things between move one place right.
    expect(drawn(moveItem(start, 19, 0).row)).toBe('RWW|WW|WW||||RR|RR|R');
  });

  it('keeps twelve pieces, six of each colour, and eight separators; the rest keeps its order', () => {
    fc.assert(
      fc.property(anyRow(), place, place, (row, from, to) => {
        const before = rowItems(row);
        const after = rowItems(moveItem(row, from, to).row);
        for (const c of ['White', 'Red', 'bar'] as const) expect(pieceCount(after, c)).toBe(pieceCount(before, c));
        expect(after[to]).toBe(before[from]);
        expect(after.filter((_, i) => i !== to)).toEqual(before.filter((_, i) => i !== from));
      }),
      { numRuns: 1000 },
    );
  });

  it('says where each piece and each separator went', () => {
    fc.assert(
      fc.property(anyRow(), place, place, (row, from, to) => {
        const edit = moveItem(row, from, to);
        expect([...edit.pieces].sort((a, b) => a - b)).toEqual([...Array(PIECES).keys()]);
        expect([...edit.bars].sort((a, b) => a - b)).toEqual([...Array(BARS).keys()]);
        // A piece keeps its colour where it went.
        row.order.forEach((colour, k) => expect(edit.row.order[edit.pieces[k]!]).toBe(colour));
        // Only the thing taken changes place among its kind's neighbours: every other thing moves by one place at most.
        const [was, now] = [places(row), places(edit.row)];
        was.pieces.forEach((p, k) => {
          const moved = now.pieces[edit.pieces[k]!]!;
          if (p === from) expect(moved).toBe(to);
          else expect(Math.abs(moved - p)).toBeLessThanOrEqual(1);
        });
        was.bars.forEach((p, j) => {
          const moved = now.bars[edit.bars[j]!]!;
          if (p === from) expect(moved).toBe(to);
          else expect(Math.abs(moved - p)).toBeLessThanOrEqual(1);
        });
      }),
      { numRuns: 1000 },
    );
  });

  it('a thing put back where it was changes nothing; a place outside the row is refused', () => {
    expect(moveItem(start, 4, 4)).toEqual({ row: start, pieces: [...Array(PIECES).keys()], bars: [...Array(BARS).keys()] });
    expect(() => moveItem(start, 0, 20)).toThrow(/out of the row/);
    expect(() => moveItem(start, -1, 3)).toThrow(/out of the row/);
  });
});

describe('movePieces: the reader lifts pieces on the board as on every board of the page', () => {
  it('the top pieces of a square land on top of another, in the order they had, and the row follows', () => {
    const cells: Colour[][] = [['White', 'Red', 'White'], [], [], [], ['Red'], [], [], [], []];
    const filled = toRow([...cells.slice(0, 8), ['White', 'White', 'White', 'White', 'Red', 'Red', 'Red', 'Red']]);
    const edit = movePieces(filled, 0, 2, 4);
    expect(fromRow(edit.row)[0]).toEqual(['White']);
    expect(fromRow(edit.row)[4]).toEqual(['Red', 'Red', 'White']);
    // a1's two top pieces had ranks 1 and 2; the piece of b2, rank 3, is now under them.
    expect(edit.pieces.slice(0, 4)).toEqual([0, 2, 3, 1]);
    expect(edit.bars).toEqual([...Array(BARS).keys()]);
  });

  it('keeps every other stack, and every piece its colour', () => {
    fc.assert(
      fc.property(anyRow(), fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 8 }), fc.integer({ min: 1, max: MAX_LIFT }), (row, from, to, n) => {
        const cells = fromRow(row);
        fc.pre(from !== to && cells[from]!.length >= n);
        const edit = movePieces(row, from, n, to);
        const after = fromRow(edit.row);
        expect(after[from]).toEqual(cells[from]!.slice(0, -n));
        expect(after[to]).toEqual([...cells[to]!, ...cells[from]!.slice(-n)]);
        after.forEach((stack, i) => {
          if (i !== from && i !== to) expect(stack).toEqual(cells[i]);
        });
        row.order.forEach((colour, k) => expect(edit.row.order[edit.pieces[k]!]).toBe(colour));
        expect([...edit.pieces].sort((a, b) => a - b)).toEqual([...Array(PIECES).keys()]);
      }),
      { numRuns: 1000 },
    );
  });

  it('refuses more pieces than the square holds, more than three, and a move onto itself', () => {
    expect(() => movePieces(start, 3, 1, 4)).toThrow(/does not hold/);
    expect(() => movePieces(start, 0, 3, 4)).toThrow(/does not hold/);
    expect(() => movePieces(start, 0, 4, 4)).toThrow(/1 to 3/);
    expect(() => movePieces(start, 0, 1, 0)).toThrow(/own square/);
    expect(() => movePieces(start, 0, 1, 9)).toThrow(/off the board/);
  });
});

describe('boardMoves: what the board lets the reader lift', () => {
  it('offers the top 1 to 3 pieces of every square that holds them, onto each of the eight others', () => {
    const cells = fromRow(start);
    const moves = boardMoves(cells);
    // Six squares of two pieces: two counts each, eight landings.
    expect(moves).toHaveLength(6 * 2 * (CELLS - 1));
    expect(moves.some((m) => m.from_cell === 3)).toBe(false);
    expect(moves.every((m) => m.from_cell !== m.to_cell && m.num_pieces <= cells[m.from_cell]!.length)).toBe(true);
    const tall = boardMoves([Array<Colour>(12).fill('White'), [], [], [], [], [], [], [], []]);
    expect(new Set(tall.map((m) => m.num_pieces))).toEqual(new Set([1, 2, 3]));
  });

  it('every move it offers is one movePieces plays', () => {
    fc.assert(
      fc.property(anyRow(), (row) => {
        for (const m of boardMoves(fromRow(row))) expect(() => movePieces(row, m.from_cell, m.num_pieces, m.to_cell)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
});
