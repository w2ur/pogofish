import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia, shownText } from '../test-dom';
import { greedyGame, nextSeed } from './greedy-game';
import { PogoGreedy } from './pogo-greedy';

if (!customElements.get('pogo-greedy')) customElements.define('pogo-greedy', PogoGreedy);
PogoGreedy.deps = { engine: () => Promise.resolve() };

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(lang = 'fr', seed?: string): Promise<PogoGreedy> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-greedy') as PogoGreedy;
  if (seed) el.setAttribute('seed', seed);
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: PogoGreedy, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const role = (el: PogoGreedy, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
const currentBlock = (el: PogoGreedy) => el.shadowRoot!.querySelector('.said:not([data-off]):not(.sizer)')!;
const current = (el: PogoGreedy) => shownText(currentBlock(el));
/** The words under the board, after the transport: the score that chose the move. */
const below = (el: PogoGreedy) => shownText(el.shadowRoot!.querySelector('.status.after .said:not([data-off]):not(.sizer)')!);
const counter = (el: PogoGreedy) => role(el, 'counter').textContent;
const toEnd = (el: PogoGreedy) => {
  while (!role(el, 'next').disabled) role(el, 'next').click();
};

beforeEach(() => resetMedia());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-greedy>', () => {
  it('starts by itself once half of it is on screen, pauses when it leaves, and resumes when it comes back', async () => {
    const el = await mount('fr');
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    leave(el);
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    el.remove();
  });

  it('a reader’s pause holds when it comes back on screen', async () => {
    const el = await mount('fr');
    intersect(el);
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-role="play"]')!.click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
    el.remove();
  });

  it('steps through its game, each move with its score', async () => {
    const el = await mount('fr', '17');
    expect(el.shadowRoot!.querySelector('.head')).toBeNull();
    const plies = greedyGame(17).frames.length - 1;
    expect(counter(el)).toBe(`0 / ${plies}`);
    expect(current(el)).toBe('Position de départ');
    role(el, 'next').click();
    expect(currentBlock(el).querySelector('.move-name [role="tooltip"]')!.textContent).toMatch(/^De [abc][123], [123] pièces?, vers [abc][123]\.$/);
    expect(current(el)).toMatch(/^Blanc joue [abc][123]-[123]-[abc][123]$/);
    expect(below(el)).toMatch(/^Score du coup\u202f: [+−]?\d+, le meilleur des 16 coups/);
    // Under the board, after the transport.
    expect(el.shadowRoot!.querySelector('.controls')!.nextElementSibling!.classList.contains('after')).toBe(true);
  });

  it('the winning move’s score is the word « gagne », never the sentinel', async () => {
    const el = await mount('fr', '1');
    toEnd(el);
    expect(below(el)).toContain('Score du coup\u202f: gagne');
    expect(current(el)).toContain('Blanc gagne');
    expect(el.shadowRoot!.textContent).not.toMatch(/2147483647|2147483646/);
    const en = await mount('en', '2');
    toEnd(en);
    expect(below(en)).toContain('Score of the move: wins');
  });

  it('« Nouvelle partie » draws the next seed and plays it; under reduced motion it waits for the reader', async () => {
    const el = await mount('fr', '1');
    vi.useFakeTimers();
    role(el, 'action').click();
    const seed = nextSeed(1);
    expect(counter(el)).toBe(`0 / ${greedyGame(seed).frames.length - 1}`);
    vi.advanceTimersByTime(1100);
    expect(counter(el)).toMatch(/^1 \//);

    setMedia(REDUCED_MOTION, true);
    role(el, 'action').click();
    vi.advanceTimersByTime(1100 * 5);
    expect(counter(el)).toMatch(/^0 \//);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new game leaves no timer of the old one running', async () => {
    const el = await mount('fr', '1');
    vi.useFakeTimers();
    role(el, 'play').click();
    role(el, 'action').click();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('an aborted signal stops a running replay', async () => {
    const el = await mount('fr', '1');
    vi.useFakeTimers();
    role(el, 'play').click();
    vi.advanceTimersByTime(1100);
    const shown = role(el, 'counter');
    expect(shown.textContent).toMatch(/^1 \//);
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(1100 * 10);
    expect(shown.textContent).toMatch(/^1 \//);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a bad seed shows the fallback', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await mount('fr', 'x');
    expect(el.hasAttribute('data-failed')).toBe(true);
    error.mockRestore();
  });
});
