import { afterEach, describe, expect, it, vi } from 'vitest';
import { counts, destinations, origins } from '../board-state';
import { legal, type Move, type State, type Triple } from '../engine';
import { takePieces, type TakePiecesOptions } from './take-pieces';

// a1 holds a single White, b1 a stack of three topped by White: counts differ by stack.
const S: State = {
  cells: [['White'], ['Red', 'Red', 'White'], [], ['White', 'Red'], [], ['White'], ['Red'], [], ['White', 'Red']],
  to_move: 'White',
  move_count: 4,
  history: [],
};

afterEach(() => {
  document.body.innerHTML = '';
});

function setup(over: Partial<TakePiecesOptions> = {}, withKeys = true) {
  const root = document.createElement('div');
  document.body.append(root);
  let moves: readonly Move[] = legal(S);
  const played: Triple[] = [];
  const onChange = vi.fn();
  const take = takePieces({
    lang: 'fr',
    id: 'test-counts',
    state: () => S,
    moves: () => moves,
    onPlay: (m) => played.push(m),
    onChange,
    ...(withKeys ? { keys: root } : {}),
    ...over,
  });
  root.append(take.grid, take.counts.element);
  take.sync();
  const key = (k: string) => root.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const shownCounts = () => take.counts.buttons.filter((b) => !b.hidden).map((b) => Number(b.dataset.value));
  const cellsOf = (kind: string) => take.marks().filter((m) => m.kind === kind).map((m) => m.cell).sort((a, b) => a - b);
  return { root, take, played, onChange, key, shownCounts, cellsOf, setMoves: (m: readonly Move[]) => (moves = m) };
}

describe('takePieces: choose the stack, how many pieces, where they land', () => {
  it('at rest marks every stack that may be lifted as a candidate, and says so to assistive tech', () => {
    const { take, cellsOf } = setup();
    const lift = origins(legal(S));
    expect(cellsOf('target')).toEqual(lift);
    expect(cellsOf('picked')).toEqual([]);
    for (const i of lift) {
      expect(take.cells[i]!.hasAttribute('data-actionable')).toBe(true);
      expect(take.cells[i]!.getAttribute('aria-label')).toContain('à vous');
      expect(take.cells[i]!.getAttribute('aria-disabled')).toBe('false');
    }
    expect(take.cells[2]!.getAttribute('aria-label')).toBe('c1 : vide');
    expect(take.cells[2]!.getAttribute('aria-disabled')).toBe('true');
    // The count chooser keeps its line, off, with nothing lifted.
    expect(take.counts.element.hasAttribute('data-off')).toBe(true);
    expect(take.counts.element.classList.contains('counts')).toBe(true);
  });

  it('marks nothing at rest when the figure asks (a board that shows its own last move)', () => {
    const { cellsOf, take } = setup({ markLiftable: false });
    expect(take.marks()).toEqual([]);
    take.cells[1]!.click();
    expect(cellsOf('picked')).toEqual([1]);
  });

  it('a tap lifts a stack with its smallest count: the stack ringed, its landings marked, only the counts that can move offered', () => {
    const { take, onChange, shownCounts, cellsOf } = setup();
    take.cells[1]!.click();
    expect(take.selection()).toEqual({ from: 1, count: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(cellsOf('picked')).toEqual([1]);
    expect(cellsOf('target')).toEqual(destinations(legal(S), 1, 1));
    expect(shownCounts()).toEqual(counts(legal(S), 1));
    expect(take.counts.element.hasAttribute('data-off')).toBe(false);
    expect(take.counts.buttons.find((b) => b.getAttribute('aria-checked') === 'true')!.dataset.value).toBe('1');
    expect(take.cells[1]!.getAttribute('aria-label')).toContain('soulevée');
    expect(take.cells[destinations(legal(S), 1, 1)[0]!]!.getAttribute('aria-label')).toContain('destination possible');
  });

  it('the count is chosen by its button, by 1/2/3, or by the figure; a count that cannot move is ignored', () => {
    const { take, key, onChange, cellsOf } = setup();
    take.cells[1]!.click();
    (take.counts.buttons[1] as HTMLButtonElement).click();
    expect(take.selection()).toEqual({ from: 1, count: 2 });
    expect(cellsOf('target')).toEqual(destinations(legal(S), 1, 2));
    key('3');
    expect(take.selection()).toEqual({ from: 1, count: 3 });
    take.count(1);
    expect(take.selection()).toEqual({ from: 1, count: 1 });
    expect(onChange).toHaveBeenCalledTimes(4);
    // a1 holds one piece: two cannot leave it.
    take.cells[1]!.click();
    take.cells[0]!.click();
    const calls = onChange.mock.calls.length;
    key('2');
    expect(take.selection()).toEqual({ from: 0, count: 1 });
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it('a tap on a landing plays the move, told once, and puts the stack down', () => {
    const { take, played, onChange } = setup();
    take.cells[1]!.click();
    take.count(2);
    const to = destinations(legal(S), 1, 2)[0]!;
    const calls = onChange.mock.calls.length;
    take.cells[to]!.click();
    expect(played).toEqual([[1, 2, to]]);
    expect(take.selection()).toBeNull();
    // A move played is told by onPlay alone.
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it('the lifted stack is put down by a second tap, by Escape, or by the figure; another stack is lifted by a tap on it', () => {
    const { take, key, onChange } = setup();
    take.cells[1]!.click();
    take.cells[1]!.click();
    expect(take.selection()).toBeNull();
    take.cells[1]!.click();
    // c2 is no landing of b1's top piece, and may move: it is lifted instead.
    take.cells[5]!.click();
    expect(take.selection()).toEqual({ from: 5, count: 1 });
    key('Escape');
    expect(take.selection()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(5);
    // By the figure: silent, the figure redraws itself.
    take.cells[5]!.click();
    take.putDown();
    expect(take.selection()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(6);
  });

  it('hears no key at rest, and leaves Escape to the page', () => {
    const { key, onChange } = setup();
    expect(key('Escape')).toBe(true);
    expect(key('2')).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('without `keys` it listens to none: the figure routes them itself', () => {
    const { take, key } = setup({}, false);
    take.cells[1]!.click();
    key('3');
    key('Escape');
    expect(take.selection()).toEqual({ from: 1, count: 1 });
  });

  it('drops a lifted stack that can no longer move (the position changed under it)', () => {
    const { take, setMoves, shownCounts } = setup();
    take.cells[1]!.click();
    setMoves([]);
    expect(take.selection()).toBeNull();
    expect(take.marks()).toEqual([]);
    take.sync();
    expect(shownCounts()).toEqual([]);
    expect(take.counts.element.hasAttribute('data-off')).toBe(true);
  });

  it('takes any list of moves, not only the rules’: a figure that lets the reader move pieces freely gives its own', () => {
    const free: Move[] = [
      { from_cell: 8, num_pieces: 1, to_cell: 2 },
      { from_cell: 8, num_pieces: 2, to_cell: 4 },
    ];
    const { take, played, shownCounts, cellsOf } = setup({ moves: () => free });
    expect(cellsOf('target')).toEqual([8]);
    take.cells[8]!.click();
    expect(shownCounts()).toEqual([1, 2]);
    take.count(2);
    expect(cellsOf('target')).toEqual([4]);
    take.cells[4]!.click();
    expect(played).toEqual([[8, 2, 4]]);
  });

  it('keeps one tab stop, on the square last touched, and gives it focus when asked', () => {
    const { take } = setup();
    take.cells[5]!.click();
    expect(take.cells.filter((b) => b.tabIndex === 0).map((b) => b.dataset.cell)).toEqual(['5']);
    take.focus();
    expect(document.activeElement).toBe(take.cells[5]);
  });
});
