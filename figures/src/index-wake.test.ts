import { describe, expect, it, vi } from 'vitest';
import { defineAll } from './index';
import { LOADERS } from './registry';

// A follow board waits for the first game; a figure's pogo:playfrom is what wakes it.
describe('defineAll and a follow board', () => {
  it('a pogo:playfrom on the page asks for the board module, and nothing asked before', async () => {
    sessionStorage.clear();
    const load = vi.spyOn(LOADERS, 'pogo-board').mockResolvedValue(class extends HTMLElement {});
    const board = document.createElement('pogo-board');
    board.setAttribute('mode', 'follow');
    document.body.append(board);
    defineAll();
    await new Promise((r) => setTimeout(r, 0));
    expect(load).not.toHaveBeenCalled();
    const figure = document.createElement('div');
    document.body.append(figure);
    figure.dispatchEvent(new CustomEvent('pogo:playfrom', { bubbles: true, composed: true, detail: null }));
    expect(load).toHaveBeenCalledTimes(1);
    load.mockRestore();
  });
});
