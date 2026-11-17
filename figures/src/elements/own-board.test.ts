import { afterEach, describe, expect, it } from 'vitest';
import { legal, play, type State, type Triple } from '../engine';
import { defaultPosition } from './net-position';
import { ownBoard } from './own-board';

afterEach(() => {
  document.body.innerHTML = '';
});

function setup(start: State = defaultPosition()) {
  const root = document.createElement('div');
  document.body.append(root);
  let shown: { state: State; move?: Triple } = { state: start };
  const played: Triple[] = [];
  const touched: (number | null)[] = [];
  const b = ownBoard({
    lang: 'fr',
    keys: root,
    id: 'test-counts',
    position: () => shown,
    onPlay: (m) => {
      played.push(m);
      shown = { state: play(shown.state, m), move: m };
      b.draw();
    },
    onTouch: (from) => touched.push(from),
  });
  root.append(b.board, b.counts);
  b.draw();
  const cell = (i: number) => b.board.querySelector<HTMLButtonElement>(`.cell-button[data-cell="${i}"]`)!;
  return { b, root, cell, played, touched };
}

describe('ownBoard', () => {
  // Regression: a dashed ring on every stack that may lift read as the dashed ring of the move's origin.
  it('at rest marks nothing; the stacks that may lift are told to assistive tech and take the pointer', () => {
    const { b, cell } = setup();
    const lift = [...new Set(legal(defaultPosition()).map((m) => m.from_cell))];
    expect(b.board.querySelectorAll('.board .mark')).toHaveLength(0);
    for (const i of lift) expect(cell(i).hasAttribute('data-actionable')).toBe(true);
  });

  it('a move played keeps its origin ring and the count it lifted, until a stack is lifted', () => {
    const { b, cell, played, touched } = setup();
    const m = legal(defaultPosition()).find((x) => x.num_pieces === 2)!;
    cell(m.from_cell).click();
    expect(touched).toEqual([m.from_cell]);
    (b.counts.querySelector('[data-value="2"]') as HTMLButtonElement).click();
    cell(m.to_cell).click();
    expect(played).toEqual([[m.from_cell, 2, m.to_cell]]);
    expect(b.board.querySelector('.board .from')!.getAttribute('data-cell')).toBe(String(m.from_cell));
    expect(b.board.querySelector('.board-labels .lifted')!.textContent).toBe('2');
    expect(b.board.querySelectorAll('.board .mark')).toHaveLength(0);
  });

  it('a lifted stack shows itself and where it may land; Escape puts it down', () => {
    const { b, root, cell, touched } = setup();
    const m = legal(defaultPosition())[0]!;
    cell(m.from_cell).click();
    expect(b.lifted()).toBe(m.from_cell);
    expect(b.board.querySelector('.board .mark.picked')!.getAttribute('data-cell')).toBe(String(m.from_cell));
    expect(b.board.querySelectorAll('.board .mark.target').length).toBeGreaterThan(0);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(b.lifted()).toBeNull();
    expect(touched.at(-1)).toBeNull();
    expect(b.board.querySelectorAll('.board .mark')).toHaveLength(0);
  });
});
