import { describe, expect, it, vi } from 'vitest';
import { defineAll, openBoard } from './index';
import { LOADERS } from './registry';

/** What openBoard() has settled to within a while, or 'pending'. */
const within = (p: Promise<unknown>) => Promise.race([p, new Promise((r) => setTimeout(() => r('pending'), 200))]);

// A file of its own: the entry's lazy definition is set up once per page, and so once per file here.
describe('openBoard settles when no board can open', () => {
  // Regression: <fix> — it awaited whenDefined('pogo-board') forever when there was no board,
  // defineAll() had not run, or the board's module failed to load.
  it('with no board on the page', async () => {
    expect(await within(openBoard())).toBe(false);
  });

  it('with a board, before defineAll() has run', async () => {
    const board = document.createElement('pogo-board');
    board.setAttribute('mode', 'follow');
    document.body.append(board);
    expect(await within(openBoard())).toBe(false);
  });

  it('with a board whose module failed to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const load = vi.spyOn(LOADERS, 'pogo-board').mockRejectedValue(new Error('offline'));
    defineAll();
    expect(await within(openBoard())).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    expect(customElements.get('pogo-board')).toBeUndefined();
    load.mockRestore();
    warn.mockRestore();
  });
});
