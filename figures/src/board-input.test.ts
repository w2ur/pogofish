import { describe, expect, it, vi } from 'vitest';
import { boardInput } from './board-input';

function setup(lifted = false) {
  const root = document.createElement('div');
  const onCell = vi.fn();
  const onCount = vi.fn();
  const onDrop = vi.fn();
  const input = boardInput({ label: 'Plateau', onCell, keys: root, lifted: () => lifted, onCount, onDrop });
  root.append(input.grid);
  document.body.append(root);
  const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const stops = () => input.cells.filter((b) => b.tabIndex === 0).map((b) => b.dataset.cell);
  return { root, input, onCell, onCount, onDrop, key, stops };
}

describe('boardInput', () => {
  it('lays nine buttons in screen order, a3 first, each knowing its cell', () => {
    const { input } = setup();
    expect([...input.grid.children].map((b) => (b as HTMLElement).dataset.cell)).toEqual(['6', '7', '8', '3', '4', '5', '0', '1', '2']);
    expect(input.grid.getAttribute('role')).toBe('group');
    expect(input.grid.getAttribute('aria-label')).toBe('Plateau');
  });

  it('keeps one tab stop, moved by the arrows and by a tap', () => {
    const { input, onCell, key, stops } = setup();
    expect(stops()).toEqual(['0']);
    key(input.cells[0]!, 'ArrowUp');
    expect(stops()).toEqual(['3']);
    key(input.cells[3]!, 'ArrowLeft');
    expect(stops()).toEqual(['3']);
    input.cells[8]!.click();
    expect(onCell).toHaveBeenCalledWith(8);
    input.syncFocus();
    expect(stops()).toEqual(['8']);
  });

  it('hears 1/2/3 and Escape only while a stack is lifted', () => {
    const idle = setup(false);
    idle.key(idle.root, '2');
    idle.key(idle.root, 'Escape');
    expect(idle.onCount).not.toHaveBeenCalled();
    expect(idle.onDrop).not.toHaveBeenCalled();
    const held = setup(true);
    held.key(held.root, '2');
    held.key(held.root, 'Escape');
    held.key(held.root, '4');
    expect(held.onCount.mock.calls).toEqual([[2]]);
    expect(held.onDrop).toHaveBeenCalledTimes(1);
  });
});
