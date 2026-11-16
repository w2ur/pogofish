import { afterEach, describe, expect, it } from 'vitest';
import { FOLLOW_OPEN_DEFAULT, escapeAction, followShown, openAtStart, watchInlineBoards, type ObserverCtor } from './follow-panel';

describe('the follow board, open or folded', () => {
  it('starts folded; a game started on a board keeps the reader’s choice, a figure’s « Jouer cette position contre l’ordinateur » opens it', () => {
    expect(FOLLOW_OPEN_DEFAULT).toBe(false);
    expect(openAtStart(FOLLOW_OPEN_DEFAULT, 'board')).toBe(false);
    expect(openAtStart(true, 'board')).toBe(true);
    expect(openAtStart(FOLLOW_OPEN_DEFAULT, 'figure')).toBe(true);
    expect(openAtStart(true, 'figure')).toBe(true);
  });

  it('is shown only with a game, and gives way to an inline board on screen unless it holds focus', () => {
    expect(followShown({ game: false, inlineOnScreen: false, focusInside: false })).toBe(false);
    expect(followShown({ game: true, inlineOnScreen: false, focusInside: false })).toBe(true);
    expect(followShown({ game: true, inlineOnScreen: true, focusInside: false })).toBe(false);
    expect(followShown({ game: true, inlineOnScreen: true, focusInside: true })).toBe(true);
  });

  it('Escape puts the abandon question away first, then a lifted stack, then folds an open follow board', () => {
    const base = { confirming: false, lifted: false, follow: true, open: true };
    expect(escapeAction({ ...base, confirming: true, lifted: true })).toBe('keep-game');
    expect(escapeAction({ ...base, lifted: true })).toBe('put-down');
    expect(escapeAction(base)).toBe('fold');
    expect(escapeAction({ ...base, open: false })).toBe('none');
    // An inline board has nothing to fold.
    expect(escapeAction({ ...base, follow: false })).toBe('none');
  });
});

/** An observer the test drives by hand. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  constructor(readonly cb: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
  }
  unobserve(el: Element): void {
    this.targets.delete(el);
  }
  disconnect(): void {
    this.targets.clear();
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  deliver(target: Element, isIntersecting: boolean): void {
    this.cb([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
const Fake = FakeObserver as unknown as ObserverCtor;

function board(mode?: 'follow'): Element {
  const el = document.createElement('pogo-board');
  if (mode) el.setAttribute('mode', mode);
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  FakeObserver.all = [];
});

describe('watchInlineBoards', () => {
  it('watches the inline boards only, and reports when any comes on screen or leaves it', () => {
    const a = board();
    const b = board();
    board('follow');
    const seen: boolean[] = [];
    const w = watchInlineBoards(document, (on) => seen.push(on), Fake);
    const io = FakeObserver.all[0]!;
    expect([...io.targets]).toEqual([a, b]);
    io.deliver(a, true);
    io.deliver(b, true);
    io.deliver(a, false);
    expect(w.onScreen()).toBe(true);
    io.deliver(b, false);
    expect(seen).toEqual([true, false]);
    expect(w.onScreen()).toBe(false);
  });

  it('picks up an inline board added later, forgets one removed, and lets go at disconnect', () => {
    const seen: boolean[] = [];
    const w = watchInlineBoards(document, (on) => seen.push(on), Fake);
    const io = FakeObserver.all[0]!;
    expect(io.targets.size).toBe(0);
    const a = board();
    w.rescan();
    expect([...io.targets]).toEqual([a]);
    io.deliver(a, true);
    a.remove();
    w.rescan();
    expect(w.onScreen()).toBe(false);
    expect(seen).toEqual([true, false]);
    w.disconnect();
    expect(io.disconnected).toBe(true);
  });

  it('with no inline board on the page, nothing is ever on screen', () => {
    board('follow');
    const w = watchInlineBoards(document, () => {}, Fake);
    expect(FakeObserver.all[0]!.targets.size).toBe(0);
    expect(w.onScreen()).toBe(false);
  });
});
