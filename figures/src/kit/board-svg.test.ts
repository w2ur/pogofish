import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initial, type State } from '../engine';
import { drawBoard, landing } from './board-svg';

const mid: State = {
  cells: [['White'], [], ['Red', 'White'], [], ['White', 'White', 'Red'], [], ['Red'], ['White', 'Red', 'White'], []],
  to_move: 'Red',
  move_count: 7,
  history: [],
};

const discsIn = (svg: SVGSVGElement, cell: number) =>
  [...svg.querySelectorAll<SVGCircleElement>(`.stack[data-cell="${cell}"] .disc`)];

describe('drawBoard', () => {
  it('carries lifted pieces apart: off their stack, raised over the square they have reached, the squares passed dotted', () => {
    const svg = drawBoard(mid, { carry: { from: 7, count: 2, pieces: ['Red', 'White'], at: 4, trail: [7] } });
    // b3 keeps only what was not lifted.
    expect(discsIn(svg, 7).map((d) => d.dataset.colour)).toEqual(['White']);
    const carried = svg.querySelector<SVGGElement>('.carried')!;
    expect(carried.dataset.cell).toBe('4');
    expect([...carried.querySelectorAll<SVGCircleElement>('.disc')].map((d) => d.dataset.colour)).toEqual(['Red', 'White']);
    // Drawn after every stack, so the stack under it never hides it, and raised above its square.
    expect(svg.lastElementChild!.isSameNode(carried) || carried.compareDocumentPosition(svg.querySelector('.stack[data-cell="4"]')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(carried.getAttribute('transform')).toMatch(/^translate\(0,? ?-\d+\)$/);
    expect([...svg.querySelectorAll('.trail')].map((d) => d.getAttribute('data-cell'))).toEqual(['7']);
    // The square it left keeps the ink ring of a lifted stack.
    expect(svg.querySelector('.mark.picked')!.getAttribute('data-cell')).toBe('7');
  });


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
    const svg = drawBoard(initial(), { labelRoom: true });
    const cellRect = (i: number) => svg.querySelector<SVGRectElement>(`.cell[data-cell="${i}"]`)!;
    const y = (i: number) => Number(cellRect(i).getAttribute('y'));
    const x = (i: number) => Number(cellRect(i).getAttribute('x'));
    expect(y(0)).toBeGreaterThan(y(3));
    expect(y(3)).toBeGreaterThan(y(6));
    expect(x(0)).toBeLessThan(x(1));
    expect(discsIn(svg, 0).every((d) => d.dataset.colour === 'White')).toBe(true);
  });

  it('keeps a tall stack inside its cell', () => {
    const tall: State = { ...mid, cells: [Array(12).fill('Red'), [], [], [], [], [], [], [], []] };
    for (const labelRoom of [false, true]) {
      const discs = discsIn(drawBoard(tall, { labelRoom }), 0);
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

  it('draws no text: the coordinates are HTML (board-labels.ts); labelRoom only moves the stacks off the corner', () => {
    expect(drawBoard(initial(), { labelRoom: true }).querySelectorAll('text')).toHaveLength(0);
    const cx = (labelRoom: boolean) => Number(discsIn(drawBoard(initial(), { labelRoom }), 0)[0]!.getAttribute('cx'));
    expect(cx(true)).toBeGreaterThan(cx(false));
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
    const svg = drawBoard(mid, { from: 1, to: 7, moving: 2, labelRoom: true });
    for (const el of svg.querySelectorAll('*')) {
      expect(el.getAttribute('fill')).toBeNull();
      expect(el.getAttribute('stroke')).toBeNull();
      expect(el.getAttribute('style')).toBeNull();
      expect(el.getAttribute('color')).toBeNull();
    }
  });

  it('draws marks above every stack, so a destination ring is never hidden', () => {
    const svg = drawBoard(mid, { marks: [{ cell: 4, kind: 'target' }, { cell: 2, kind: 'picked' }] });
    const children = [...svg.children];
    const lastStack = Math.max(...children.map((n, i) => (n.classList.contains('stack') ? i : -1)));
    const target = svg.querySelector('.mark.target[data-cell="4"]')!;
    const picked = svg.querySelector('.mark.picked[data-cell="2"]')!;
    expect(children.indexOf(target)).toBeGreaterThan(lastStack);
    expect(children.indexOf(picked)).toBeGreaterThan(lastStack);
    expect(svg.querySelectorAll('.mark')).toHaveLength(2);
  });
});

// Round 5, convention 1: the dashed ring says where a move left from, and nothing else.
describe('drawBoard, the marks of a possible move', () => {
  it('draws a candidate as the four corners of the landing frame, never as a ring', () => {
    const svg = drawBoard(mid, { labelRoom: true, marks: [{ cell: 4, kind: 'target' }] });
    const mark = svg.querySelector('.mark.target[data-cell="4"]')!;
    expect(mark.tagName.toLowerCase()).toBe('path');
    // Four corners, each one stroke of two arms: four subpaths.
    expect(mark.getAttribute('d')!.match(/M/g)).toHaveLength(4);
    expect(svg.querySelectorAll('circle.target')).toHaveLength(0);
  });

  it('keeps the dashed ring for the origin alone: the theme dashes .from and no mark', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');
    const dashed = [...css.matchAll(/([^{}]+)\{[^{}]*stroke-dasharray[^{}]*\}/g)].map((m) => m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim());
    expect(dashed).toEqual(['.board .from']);
  });

  it('shows a possible move landing: its lifted pieces faded on top of the destination, the origin whole', () => {
    // b2 (White, White, Red) could send its top two onto c1 (Red, White).
    const move = landing(mid, [4, 2, 2]);
    expect(move).toEqual({ to: 2, pieces: ['White', 'Red'] });
    const svg = drawBoard(mid, { landings: [move] });
    // Nothing has moved: every stack keeps its pieces, and they are not faded.
    expect(discsIn(svg, 4).map((d) => d.dataset.colour)).toEqual(['White', 'White', 'Red']);
    expect(discsIn(svg, 2).map((d) => d.dataset.colour)).toEqual(['Red', 'White']);
    expect(svg.querySelectorAll('.stack .landing')).toHaveLength(0);
    const ghosts = [...svg.querySelectorAll<SVGCircleElement>('.landings[data-cell="2"] .disc.landing')];
    expect(ghosts.map((d) => d.dataset.colour)).toEqual(['White', 'Red']);
    // On top of the stack, bottom first, in one column with it.
    const ys = [...discsIn(svg, 2), ...ghosts].map((d) => Number(d.getAttribute('cy')));
    for (let k = 1; k < ys.length; k++) expect(ys[k]!).toBeLessThan(ys[k - 1]!);
    expect(new Set([...discsIn(svg, 2), ...ghosts].map((d) => d.getAttribute('cx'))).size).toBe(1);
  });

  it('lands on an empty square too, under the marks', () => {
    const svg = drawBoard(mid, { landings: [landing(mid, [0, 1, 1])], marks: [{ cell: 1, kind: 'target' }] });
    const group = svg.querySelector('.landings[data-cell="1"]')!;
    expect(group.querySelectorAll('.disc.landing')).toHaveLength(1);
    const children = [...svg.children];
    expect(children.indexOf(svg.querySelector('.mark.target')!)).toBeGreaterThan(children.indexOf(group));
    // An empty square holds no stack: a figure counting stacks counts the position's.
    expect(svg.querySelector('.stack[data-cell="1"]')).toBeNull();
  });

  it('refuses a landing of pieces the origin does not hold', () => {
    expect(() => landing(mid, [1, 1, 0])).toThrow(/pogo/);
  });
});
