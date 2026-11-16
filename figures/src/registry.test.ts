import { afterEach, describe, expect, it } from 'vitest';
import { when } from './registry';
import { STORAGE_KEY } from './saved';

const el = (tag: string, mode?: string): Element => {
  const e = document.createElement(tag);
  if (mode) e.setAttribute('mode', mode);
  return e;
};

afterEach(() => sessionStorage.clear());

describe('when an instance is imported', () => {
  it('the title at once, figures on approach, an inline board on approach', () => {
    expect(when(el('pogo-title'))).toBe('now');
    expect(when(el('pogo-reach'))).toBe('approach');
    expect(when(el('pogo-board'))).toBe('approach');
  });

  it('a follow board waits for the first game, unless one is saved', () => {
    expect(when(el('pogo-board', 'follow'))).toBe('wait');
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, current: null, prefs: {} }));
    expect(when(el('pogo-board', 'follow'))).toBe('wait');
    sessionStorage.setItem(STORAGE_KEY, 'not json');
    expect(when(el('pogo-board', 'follow'))).toBe('wait');
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, current: { moves: [] } }));
    expect(when(el('pogo-board', 'follow'))).toBe('now');
  });
});
