import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ObserverCtor } from '../follow-panel';
import { REDUCED_MOTION, resetMedia, setMedia } from '../test-dom';
import { MOVE_TEMPO_MS } from './tempo';
import { readingMark, toy, type ToyOptions } from './toy';

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
  /** `ratio` of the figure on screen. */
  deliver(target: Element, ratio: number): void {
    const entry = {
      target,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
      intersectionRect: { height: ratio * 400 } as DOMRectReadOnly,
      boundingClientRect: { height: 400 } as DOMRectReadOnly,
      rootBounds: { height: 800 } as DOMRectReadOnly,
    } as IntersectionObserverEntry;
    this.cb([entry], this as unknown as IntersectionObserver);
  }
}
const Fake = FakeObserver as unknown as ObserverCtor;

let host: HTMLElement;
let root: HTMLElement;
let controller: AbortController;

beforeEach(() => {
  resetMedia();
  vi.useFakeTimers();
  FakeObserver.all = [];
  host = document.createElement('div');
  root = document.createElement('div');
  host.append(root);
  document.body.append(host);
  controller = new AbortController();
});
afterEach(() => {
  controller.abort();
  vi.useRealTimers();
  host.remove();
});

function setup(over: Partial<ToyOptions> = {}) {
  const shown: number[] = [];
  const onReady = vi.fn();
  const play = toy(host, {
    root,
    invite: 'Déplacez une pièce.',
    intro: { steps: 3, show: (i) => shown.push(i) },
    onReady,
    signal: controller.signal,
    Observer: Fake,
    ...over,
  });
  root.append(play.invite);
  const io = FakeObserver.all[0];
  return { play, shown, onReady, io, onScreen: (ratio = 1) => io!.deliver(host, ratio) };
}

describe('toy: an introduction once, then the reader’s', () => {
  it('waits off screen: nothing plays, the invitation is there but not shown', () => {
    const { play, shown, onReady } = setup();
    expect(play.phase()).toBe('waiting');
    expect(root.dataset.toy).toBe('waiting');
    expect(play.invite.textContent).toBe('Déplacez une pièce.');
    expect(play.invite.className).toBe('toy-invite');
    vi.advanceTimersByTime(60_000);
    expect(shown).toEqual([]);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('plays its introduction the first time half of it is on screen, each step held the move tempo, then hands over', () => {
    const { play, shown, onReady, io, onScreen } = setup();
    onScreen(0.3);
    expect(play.phase()).toBe('waiting');
    onScreen(0.6);
    expect(play.phase()).toBe('intro');
    expect(root.dataset.toy).toBe('intro');
    expect(shown).toEqual([0]);
    vi.advanceTimersByTime(MOVE_TEMPO_MS - 1);
    expect(shown).toEqual([0]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([0, 1]);
    vi.advanceTimersByTime(MOVE_TEMPO_MS);
    expect(shown).toEqual([0, 1, 2]);
    // The last step is held too, then the figure is the reader's.
    expect(onReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MOVE_TEMPO_MS);
    expect(play.phase()).toBe('ready');
    expect(root.dataset.toy).toBe('ready');
    expect(onReady).toHaveBeenCalledTimes(1);
    // Once: it is no longer watched, and coming back on screen replays nothing.
    expect(io!.disconnected).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(shown).toEqual([0, 1, 2]);
  });

  it('holds each step as long as the figure says', () => {
    const steps: number[] = [];
    const { onScreen } = setup({ intro: { steps: 2, show: (i) => steps.push(i), interval: (i) => (i === 0 ? 300 : 2000) } });
    onScreen();
    vi.advanceTimersByTime(300);
    expect(steps).toEqual([0, 1]);
    vi.advanceTimersByTime(1999);
    expect(root.dataset.toy).toBe('intro');
    vi.advanceTimersByTime(1);
    expect(root.dataset.toy).toBe('ready');
  });

  it('under reduced motion plays nothing: the figure is the reader’s at once', () => {
    setMedia(REDUCED_MOTION, true);
    const { play, shown, onReady, io } = setup();
    expect(play.phase()).toBe('ready');
    expect(onReady).toHaveBeenCalledTimes(1);
    // Nothing watches the figure: there is nothing to play.
    expect(io).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    expect(shown).toEqual([]);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('the reader’s first press ends the introduction, before the figure hears the press', () => {
    const { play, shown, onReady, onScreen } = setup();
    const button = document.createElement('button');
    root.append(button);
    const heard: string[] = [];
    button.addEventListener('pointerdown', () => heard.push(`press while ${play.phase()}`));
    onScreen();
    vi.advanceTimersByTime(MOVE_TEMPO_MS);
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(heard).toEqual(['press while ready']);
    expect(onReady).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(shown).toEqual([0, 1]);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a key that acts ends it too, even before it has played; Tab and the modifiers alone do not', () => {
    const { play, shown, onReady, io } = setup();
    for (const key of ['Tab', 'Shift', 'Control', 'Alt', 'Meta']) root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    expect(play.phase()).toBe('waiting');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(play.phase()).toBe('ready');
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(io!.disconnected).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(shown).toEqual([]);
  });

  it('an introduction the reader scrolls away from is over: the figure they come back to is theirs', () => {
    const { play, shown, onReady, onScreen } = setup();
    onScreen();
    onScreen(0);
    expect(play.phase()).toBe('ready');
    expect(onReady).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(shown).toEqual([0]);
  });

  it('skip() is the figure’s way to end it; a second call does nothing', () => {
    const { play, onReady, onScreen } = setup();
    onScreen();
    play.skip();
    play.skip();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a figure gone from the page plays nothing more and is never handed over', () => {
    const { shown, onReady, io, onScreen } = setup();
    onScreen();
    controller.abort();
    vi.advanceTimersByTime(60_000);
    expect(shown).toEqual([0]);
    expect(onReady).not.toHaveBeenCalled();
    expect(io!.disconnected).toBe(true);
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onReady).not.toHaveBeenCalled();
  });

  it('the theme shows the invitation only once the figure is the reader’s, its room kept before', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');
    const rule = /\[data-toy\]:not\(\[data-toy='ready'\]\) \.toy-invite \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain('visibility: hidden');
    expect(rule).not.toContain('display');
  });
});

describe('readingMark: which way a toy reads', () => {
  it('is an arrow in the theme’s ink, hidden from assistive tech, pointing the way asked', () => {
    for (const dir of ['right', 'left', 'down', 'up'] as const) {
      const mark = readingMark(dir);
      expect(mark.className).toBe('reads');
      expect(mark.dataset.dir).toBe(dir);
      expect(mark.getAttribute('aria-hidden')).toBe('true');
      const svg = mark.querySelector('svg')!;
      const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      // Long the way it points.
      expect(w! > h!).toBe(dir === 'right' || dir === 'left');
      for (const node of mark.querySelectorAll('*')) {
        expect(node.getAttribute('stroke')).toBeNull();
        expect(node.getAttribute('fill')).toBeNull();
        expect(node.getAttribute('style')).toBeNull();
      }
    }
    // Four arrows, four drawings.
    expect(new Set((['right', 'left', 'down', 'up'] as const).map((d) => readingMark(d).querySelector('path')!.getAttribute('d'))).size).toBe(4);
  });

  it('carries a short label when the direction needs a word, read by all', () => {
    const mark = readingMark('down', 'du bas vers le haut');
    expect(mark.querySelector('.reads-label')!.textContent).toBe('du bas vers le haut');
    expect(mark.hasAttribute('aria-hidden')).toBe(false);
    expect(mark.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
