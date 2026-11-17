import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Colour, State } from '../engine';
import { drawBoard } from '../kit/board-svg';
import { BARS, CELLS, PIECES, fromRow, places, toRow } from './count-row';
import { BAR_REACH, CELL, LAYOUTS, ORDER_ROOM, RADIUS, boardSpot, layoutFor, orderArrows, pickedRing, rowSpot, runs, scene, targetCorners, type Layout } from './count-view';

const order = fc.shuffledSubarray([...Array<Colour>(6).fill('White'), ...Array<Colour>(6).fill('Red')], { minLength: PIECES });
const bars = fc.array(fc.integer({ min: 0, max: PIECES }), { minLength: BARS, maxLength: BARS }).map((b) => [...b].sort((x, y) => x - y));
const row = fc.record({ order, bars });
const anyLayout = fc.constantFrom(...Object.values(LAYOUTS));
/** A layout whose board starts at the drawing's origin, to read the kit's own board against. */
const atOrigin: Layout = { ...LAYOUTS.mid, board: { x: 0, y: 0 } };
const stateOf = (cells: Colour[][]): State => ({ cells, to_move: 'White', move_count: 0, history: [] });
const numbers = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

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
      fc.property(row, anyLayout, (r, l) => {
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
          expect(s.y + l.row.slot * BAR_REACH).toBeLessThanOrEqual(l.height);
          // A piece fits its place: two neighbours never touch.
          expect(2 * RADIUS * s.scale).toBeLessThan(l.row.slot);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('keeps room for what is laid over the drawing: the arrows, the box under the board, the row’s own lines', () => {
    for (const l of Object.values(LAYOUTS)) {
      expect(l.board.x).toBeGreaterThanOrEqual(ORDER_ROOM);
      expect(l.board.x + 3 * CELL).toBeLessThanOrEqual(l.width);
      expect(l.under.y).toBe(l.board.y + 3 * CELL);
      expect(l.under.x + l.under.width).toBeLessThanOrEqual(l.width);
      expect(l.under.y + l.under.height).toBeLessThanOrEqual(l.height);
      // The chooser is 44px tall, and narrow its label takes a line more: its room holds it at the narrowest width the layout serves.
      const [narrowest, needs] = { narrow: [272, 68], mid: [480, 44], wide: [720, 44] }[l.name];
      expect((l.under.height * narrowest!) / l.width).toBeGreaterThanOrEqual(needs!);
      const rowTop = l.row.y - l.row.slot * BAR_REACH;
      if (l.name !== 'wide') expect(rowTop).toBeGreaterThan(l.under.y + l.under.height);
      expect(l.row.y + l.row.slot * BAR_REACH).toBeLessThan(l.height);
    }
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

  it('draws the board as every board of the page: each piece where drawBoard puts it, with room for the squares’ names', () => {
    fc.assert(
      fc.property(row, (r) => {
        const svg = drawBoard(stateOf(fromRow(r)), { labelRoom: true });
        const discs = [...svg.querySelectorAll('.stack')]
          .sort((a, b) => Number(a.getAttribute('data-cell')) - Number(b.getAttribute('data-cell')))
          .flatMap((g) => [...g.querySelectorAll('.disc')]);
        expect(discs).toHaveLength(PIECES);
        discs.forEach((disc, k) => {
          const spot = boardSpot(atOrigin, r, k);
          expect(spot.x).toBeCloseTo(Number(disc.getAttribute('cx')), 6);
          expect(spot.y).toBeCloseTo(Number(disc.getAttribute('cy')), 6);
          expect(RADIUS).toBe(Number(disc.getAttribute('r')));
        });
      }),
      { numRuns: 200 },
    );
  });

  it('marks a lifted stack and the squares it may land on as the kit does', () => {
    const cells = fromRow(toRow([['White', 'White'], ['White', 'White'], ['White', 'White'], [], [], [], ['Red', 'Red'], ['Red', 'Red'], ['Red', 'Red']]));
    for (let cell = 0; cell < CELLS; cell++) {
      const svg = drawBoard(stateOf(cells), { labelRoom: true, marks: [{ cell, kind: 'picked' }, { cell: (cell + 1) % CELLS, kind: 'target' }] });
      const ring = svg.querySelector('.mark.picked')!;
      expect(pickedRing(atOrigin, cell)).toEqual({ cx: Number(ring.getAttribute('cx')), cy: Number(ring.getAttribute('cy')), r: Number(ring.getAttribute('r')) });
      expect(targetCorners(atOrigin, (cell + 1) % CELLS)).toBe(svg.querySelector('.mark.target')!.getAttribute('d'));
    }
    // Moved with the board, wherever a layout puts it.
    const l = LAYOUTS.wide;
    expect(pickedRing(l, 0).cx - pickedRing(atOrigin, 0).cx).toBe(l.board.x);
    expect(numbers(targetCorners(l, 4))[0]! - numbers(targetCorners(atOrigin, 4))[0]!).toBe(l.board.x);
  });

  it('the same position on the board and in the row: in the row, left to right is the order of the pile', () => {
    fc.assert(
      fc.property(row, anyLayout, (r, l) => {
        const s = scene(l, r);
        expect(s.board.map((b) => b.cell)).toEqual(s.row.map((b) => b.cell));
        const xs = s.row.map((b) => b.x);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        expect(s.bars).toHaveLength(BARS);
        expect(s.row.every((b) => b.x >= l.row.x)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('draws the reading order at the board’s left: along the first rank, up, along the next, up, along the last', () => {
    for (const l of Object.values(LAYOUTS)) {
      const arrows = orderArrows(l);
      expect(arrows).toHaveLength(5);
      for (const d of arrows) {
        // Nothing of an arrow is on the board or off the drawing.
        const xs = (d.match(/[MLH](-?[\d.]+)/g) ?? []).map((m) => Number(m.slice(1)));
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).toBeLessThan(l.board.x);
      }
      // Each rank's arrow runs rightwards at the height of its squares' middle.
      [arrows[0]!, arrows[2]!, arrows[4]!].forEach((d, rank) => {
        const [x0, y0] = numbers(d);
        const x1 = Number(/H(-?[\d.]+)/.exec(d)![1]);
        expect(x1).toBeGreaterThan(x0!);
        expect(y0).toBe(l.board.y + (2 - rank + 0.5) * CELL);
      });
      // Between two ranks, an arrow runs upwards from the lower one to the one above, touching neither.
      [arrows[1]!, arrows[3]!].forEach((d, rank) => {
        const [, from] = numbers(d);
        const to = Number(/V(-?[\d.]+)/.exec(d)![1]);
        const [lower, upper] = [l.board.y + (2 - rank + 0.5) * CELL, l.board.y + (1 - rank + 0.5) * CELL];
        expect(from).toBeLessThan(lower - 6);
        expect(to).toBeGreaterThan(upper + 6);
        expect(to).toBeLessThan(from!);
      });
    }
  });

  it('names each run of pieces by its square, in the middle of the run; an empty square has no run', () => {
    fc.assert(
      fc.property(row, anyLayout, (r, l) => {
        const cells = fromRow(r);
        const found = runs(l, r);
        expect(found.map((x) => x.cell)).toEqual(cells.flatMap((stack, i) => (stack.length > 0 ? [i] : [])));
        const p = places(r);
        let k = 0;
        cells.forEach((stack, cell) => {
          if (stack.length === 0) return;
          const [first, last] = [rowSpot(l, p.pieces[k]!).x, rowSpot(l, p.pieces[k + stack.length - 1]!).x];
          const at = found.find((x) => x.cell === cell)!.x;
          // In the middle of its run, but for a name that would leave the drawing at the row's ends.
          if (at > 16 && at < l.width - 16) expect(at).toBeCloseTo((first + last) / 2, 6);
          else expect(Math.abs(at - (first + last) / 2)).toBeLessThan(l.row.slot);
          k += stack.length;
        });
      }),
      { numRuns: 300 },
    );
  });
});
