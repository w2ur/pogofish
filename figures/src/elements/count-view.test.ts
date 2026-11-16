import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initial, type Colour } from '../engine';
import { BARS, PIECES, countFrames, fromRow, toRow } from './count-row';
import { CELL, LAYOUTS, RADIUS, boardSpot, layoutFor, rowSpot, scene } from './count-view';

const order = fc.shuffledSubarray([...Array<Colour>(6).fill('White'), ...Array<Colour>(6).fill('Red')], { minLength: PIECES });
const bars = fc.array(fc.integer({ min: 0, max: PIECES }), { minLength: BARS, maxLength: BARS }).map((b) => [...b].sort((x, y) => x - y));
const row = fc.record({ order, bars });

describe('the layouts of <pogo-count>', () => {
  it('picks the row under the board below 720px, beside it from there', () => {
    expect(layoutFor(272).name).toBe('narrow');
    expect(layoutFor(479).name).toBe('narrow');
    expect(layoutFor(566).name).toBe('mid');
    expect(layoutFor(720).name).toBe('wide');
    expect(layoutFor(1100).name).toBe('wide');
    expect(LAYOUTS.wide.row.x).toBeGreaterThanOrEqual(LAYOUTS.wide.board.x + 3 * CELL);
    for (const l of [LAYOUTS.narrow, LAYOUTS.mid]) expect(l.row.y).toBeGreaterThan(l.board.y + 3 * CELL);
  });

  it('everything drawn stays inside the drawing, in every layout', () => {
    fc.assert(
      fc.property(row, fc.constantFrom(...Object.values(LAYOUTS)), (r, l) => {
        for (let k = 0; k < PIECES; k++) {
          const b = boardSpot(l, r, k);
          expect(b.x - RADIUS).toBeGreaterThanOrEqual(l.board.x);
          expect(b.x + RADIUS).toBeLessThanOrEqual(l.board.x + 3 * CELL);
          expect(b.y - RADIUS).toBeGreaterThanOrEqual(l.board.y);
          expect(b.y + RADIUS).toBeLessThanOrEqual(l.board.y + 3 * CELL);
        }
        for (let place = 0; place < PIECES + BARS; place++) {
          const s = rowSpot(l, place);
          expect(s.x - RADIUS * s.scale).toBeGreaterThanOrEqual(0);
          expect(s.x + RADIUS * s.scale).toBeLessThanOrEqual(l.width);
          expect(s.y + RADIUS * s.scale).toBeLessThanOrEqual(l.height);
          // A piece fits its place: two neighbours never touch.
          expect(2 * RADIUS * s.scale).toBeLessThan(l.row.slot);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('a piece stands on the square its row says, the bottom of a stack lowest', () => {
    fc.assert(
      fc.property(row, (r) => {
        const cells = fromRow(r);
        const l = LAYOUTS.mid;
        let k = 0;
        cells.forEach((stack, cell) => {
          let below = Infinity;
          for (let level = 0; level < stack.length; level++, k++) {
            const s = boardSpot(l, r, k);
            expect(s.cell).toBe(cell);
            expect(Math.floor((s.x - l.board.x) / CELL)).toBe(cell % 3);
            expect(2 - Math.floor((s.y - l.board.y) / CELL)).toBe(Math.floor(cell / 3));
            expect(s.y).toBeLessThan(below);
            below = s.y;
          }
        });
        expect(k).toBe(PIECES);
      }),
      { numRuns: 300 },
    );
  });

  it('draws the pieces in full where the frame says, and their trace in the other place', () => {
    const frames = countFrames([initial(), { cells: fromRow({ order: toRow(initial().cells).order, bars: [0, 0, 3, 3, 5, 9, 12, 12] }), to_move: 'Red' }]);
    const l = LAYOUTS.wide;
    const [board, unfold] = [scene(l, frames[0]!), scene(l, frames[1]!)];
    // The same position: what is solid in one is the trace of the other.
    expect(board.solid.map(({ x, y }) => [x, y])).toEqual(unfold.trace.map(({ x, y }) => [x, y]));
    expect(unfold.solid.map(({ x, y }) => [x, y])).toEqual(board.trace.map(({ x, y }) => [x, y]));
    expect(board.solid.every((s) => s.x <= 3 * CELL)).toBe(true);
    expect(unfold.solid.every((s) => s.x >= l.row.x)).toBe(true);
    expect(unfold.bars).toHaveLength(BARS);
    // In the row, left to right is the order of the pile.
    const xs = unfold.solid.map((s) => s.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});
