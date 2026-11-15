import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initial } from '../engine';
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

  it('the theme sets the label type at a fixed 12.8px, in the muted ink, never scaled', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');
    const rule = /\.board-labels \.coord \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain('font-size: 12.8px');
    expect(rule).toContain('color: var(--_muted)');
    expect(rule).toContain('font-stretch: 125%');
    expect(css).not.toMatch(/\.board \.label\b/);
  });
});
