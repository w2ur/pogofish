import { initial, type State } from '../engine';
import { drawBoard } from './board-svg';

const mid: State = {
  cells: [['White'], [], ['Red', 'White'], [], ['White', 'White', 'Red'], [], ['Red'], ['White', 'Red', 'White'], []],
  to_move: 'Red',
  move_count: 7,
  history: [],
};

const discsIn = (svg: SVGSVGElement, cell: number) =>
  [...svg.querySelectorAll<SVGCircleElement>(`.stack[data-cell="${cell}"] .disc`)];

describe('drawBoard', () => {
  it('renders 9 cells and one disc per piece, bottom first', () => {
    const svg = drawBoard(mid);
    expect(svg.querySelectorAll('.cell')).toHaveLength(9);
    expect(svg.querySelectorAll('.disc')).toHaveLength(10);
    for (const [i, stack] of mid.cells.entries()) {
      const discs = discsIn(svg, i);
      expect(discs.map((d) => d.dataset.colour)).toEqual(stack);
      // Bottom first: each disc sits above (smaller y) the one before it.
      const ys = discs.map((d) => Number(d.getAttribute('cy')));
      for (let k = 1; k < ys.length; k++) expect(ys[k]!).toBeLessThan(ys[k - 1]!);
    }
  });

  it("puts White's back row (a1–c1, cells 0–2) at the bottom, a1 on the left", () => {
    const svg = drawBoard(initial(), { labels: true });
    const cellRect = (i: number) => svg.querySelector<SVGRectElement>(`.cell[data-cell="${i}"]`)!;
    const y = (i: number) => Number(cellRect(i).getAttribute('y'));
    const x = (i: number) => Number(cellRect(i).getAttribute('x'));
    expect(y(0)).toBeGreaterThan(y(3));
    expect(y(3)).toBeGreaterThan(y(6));
    expect(x(0)).toBeLessThan(x(1));
    expect(discsIn(svg, 0).every((d) => d.dataset.colour === 'White')).toBe(true);
    const labels = [...svg.querySelectorAll('.label')].map((l) => l.textContent);
    expect(labels).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3']);
  });

  it('keeps a tall stack inside its cell', () => {
    const tall: State = { ...mid, cells: [Array(12).fill('Red'), [], [], [], [], [], [], [], []] };
    for (const labels of [false, true]) {
      const discs = discsIn(drawBoard(tall, { labels }), 0);
      expect(discs).toHaveLength(12);
      for (const d of discs) {
        const cy = Number(d.getAttribute('cy'));
        const r = Number(d.getAttribute('r'));
        // Cell 0 (a1) spans y 200..300 in the 300-unit viewBox.
        expect(cy - r).toBeGreaterThanOrEqual(200);
        expect(cy + r).toBeLessThanOrEqual(300);
      }
    }
  });

  it('sizes labels in viewBox units, so they follow the rendered width rather than the size option', () => {
    const font = (size: number) =>
      drawBoard(initial(), { size, labels: true }).querySelector('.label')!.getAttribute('font-size');
    expect(font(160)).toBe(font(320));
  });

  it('draws no labels unless asked', () => {
    expect(drawBoard(initial()).querySelectorAll('.label')).toHaveLength(0);
  });

  it('marks a move: dashed ring on the origin, the moved pieces on the destination', () => {
    // After b2-2-b3... here: 2 pieces moved from cell 1 onto cell 7 (top two of its stack).
    const svg = drawBoard(mid, { from: 1, to: 7, moving: 2 });
    expect(svg.querySelector('.from')?.getAttribute('data-cell')).toBe('1');
    expect(svg.querySelector('.to')?.getAttribute('data-cell')).toBe('7');
    const moved = discsIn(svg, 7).map((d) => d.classList.contains('moved'));
    expect(moved).toEqual([false, true, true]);
    expect(svg.querySelectorAll('.moved')).toHaveLength(2);
  });

  it('sizes the drawing and carries an optional text alternative', () => {
    const plain = drawBoard(initial(), { size: 160 });
    expect(plain.getAttribute('width')).toBe('160');
    expect(plain.getAttribute('aria-hidden')).toBe('true');
    expect(plain.querySelector('title')).toBeNull();

    const titled = drawBoard(initial(), { title: 'Position initiale' });
    expect(titled.getAttribute('role')).toBe('img');
    const title = titled.querySelector('title')!;
    expect(title.textContent).toBe('Position initiale');
    expect(titled.getAttribute('aria-labelledby')).toBe(title.id);
    expect(titled.firstElementChild).toBe(title);
  });

  it('hard-codes no colour: every fill comes from the stylesheet', () => {
    const svg = drawBoard(mid, { from: 1, to: 7, moving: 2, labels: true });
    for (const el of svg.querySelectorAll('*')) {
      expect(el.getAttribute('fill')).toBeNull();
      expect(el.getAttribute('stroke')).toBeNull();
      expect(el.getAttribute('style')).toBeNull();
      expect(el.getAttribute('color')).toBeNull();
    }
  });
});
