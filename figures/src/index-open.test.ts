import { describe, expect, it, vi } from 'vitest';
import { defineAll, openBoard } from './index';
import { LOADERS } from './registry';

// A file of its own: a tag defined by another test of the same file could not be asked for again.
describe('openBoard', () => {
  it('asks for the board module a follow board with no game waits for, then calls its open()', async () => {
    sessionStorage.clear();
    const open = vi.fn();
    const load = vi.spyOn(LOADERS, 'pogo-board').mockResolvedValue(
      class extends HTMLElement {
        open = open;
      },
    );
    const board = document.createElement('pogo-board');
    board.setAttribute('mode', 'follow');
    document.body.append(board);
    defineAll();
    await new Promise((r) => setTimeout(r, 0));
    expect(load).not.toHaveBeenCalled();
    await openBoard();
    expect(load).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    load.mockRestore();
  });
});
