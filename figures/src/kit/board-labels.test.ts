import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initial, play } from '../engine';
import { boardLabels, labelledBoard } from './board-labels';
import { drawBoard } from './board-svg';

describe('boardLabels', () => {
  it('lays a1…c3 over the board in screen order, hidden from assistive tech, letting the pointer through', () => {
    const overlay = boardLabels();
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect([...overlay.children].map((c) => c.textContent)).toEqual(['a3', 'b3', 'c3', 'a2', 'b2', 'c2', 'a1', 'b1', 'c1']);
  });

  it('places each label by percentage at its cell’s top-left corner, a1 bottom-left, c3 top-right', () => {
    const at = (name: string) => {
      const c = [...boardLabels().children].find((x) => x.textContent === name) as HTMLElement;
      return [c.style.left, c.style.top];
    };
    expect(at('a1')).toEqual(['2.667%', '69.333%']);
    expect(at('c3')).toEqual(['69.333%', '2.667%']);
    expect(at('b2')).toEqual(['36.000%', '36.000%']);
  });

  it('labelledBoard wraps the svg and its overlay in one frame', () => {
    const svg = drawBoard(initial(), { labelRoom: true });
    const frame = labelledBoard(svg);
    expect(frame.className).toBe('board-frame');
    expect(frame.firstElementChild).toBe(svg);
    expect(frame.querySelectorAll('.coord')).toHaveLength(9);
  });

  it('a board that shows a move says, at its dashed ring, how many pieces were lifted', () => {
    for (const [from, n, to] of [
      [0, 1, 3],
      [1, 2, 5],
    ] as const) {
      const after = play(initial(), [from, n, to]);
      const frame = labelledBoard(drawBoard(after, { labelRoom: true, from, to, moving: n }));
      const lifted = frame.querySelectorAll<HTMLElement>('.board-labels .lifted');
      expect(lifted).toHaveLength(1);
      expect(lifted[0]!.textContent).toBe(String(n));
      expect(lifted[0]!.dataset.cell).toBe(String(from));
      // On the ring's lower right: cell a1 is the bottom-left one, b1 the bottom middle.
      const [x, y] = [parseFloat(lifted[0]!.style.left), parseFloat(lifted[0]!.style.top)];
      expect(x).toBeGreaterThan(((from % 3) * 100 + 56) / 3);
      expect(x).toBeLessThan(((from % 3) * 100 + 100) / 3);
      expect(y).toBeGreaterThan((200 + 56) / 3);
      expect(y).toBeLessThan(100);
    }
  });

  it('no count without a move, nor without where it came from', () => {
    expect(labelledBoard(drawBoard(initial(), { labelRoom: true })).querySelector('.lifted')).toBeNull();
    const after = play(initial(), [0, 1, 3]);
    expect(labelledBoard(drawBoard(after, { labelRoom: true, to: 3, moving: 1 })).querySelector('.lifted')).toBeNull();
  });

  it('the theme sets the count at the kit’s fixed label size, never scaled with the board', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');
    const rule = /\.board-labels \.lifted \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain('font-size: 12.8px');
    expect(rule).toContain('position: absolute');
  });

  it('the theme sets the label type at a fixed 12.8px, in the muted ink, never scaled', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');
    const rule = /\.board-labels \.coord \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain('font-size: 12.8px');
    expect(rule).toContain('color: var(--_muted)');
    expect(rule).toContain('font-stretch: 125%');
    expect(css).not.toMatch(/\.board \.label\b/);
  });
});
