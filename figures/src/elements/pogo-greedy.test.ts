import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia, shownText } from '../test-dom';
import { greedyGame } from './greedy-game';
import { BEATS, MOVE_MS, PogoGreedy, spoken, whyText } from './pogo-greedy';

if (!customElements.get('pogo-greedy')) customElements.define('pogo-greedy', PogoGreedy);
PogoGreedy.deps = { engine: () => Promise.resolve() };

const flush = () => new Promise((r) => setTimeout(r, 0));
const NNBSP = ' ';
const game = greedyGame();
const last = game.frames.length - 1;

async function mount(lang = 'fr'): Promise<PogoGreedy> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-greedy') as PogoGreedy;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: PogoGreedy, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const role = (el: PogoGreedy, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
const counter = (el: PogoGreedy) => role(el, 'counter').textContent;
/** A line's words when it is shown, null while it keeps its room unseen. */
const line = (el: PogoGreedy, s: string) => ($(el, s).hasAttribute('data-off') ? null : shownText($(el, s)));
const numbers = (el: PogoGreedy) => [...el.shadowRoot!.querySelectorAll('.count .number')].map((n) => n.textContent);
const pieces = (el: PogoGreedy) => [...el.shadowRoot!.querySelectorAll('.count')].map((c) => c.querySelectorAll('.piece').length);
const changed = (el: PogoGreedy) => [...el.shadowRoot!.querySelectorAll('.count')].map((c) => c.hasAttribute('data-changed'));
const moved = (el: PogoGreedy) => el.shadowRoot!.querySelectorAll('.board .disc.moved').length;
const remove = (el: PogoGreedy) => el.parentElement!.removeChild(el);

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
    remove(el);
  });

  it('a reader’s pause holds when it comes back on screen', async () => {
    const el = await mount('fr');
    intersect(el);
    role(el, 'play').click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
    remove(el);
  });

  it('opens on the start: three stacks each, no move and no gap yet', async () => {
    const el = await mount();
    expect(counter(el)).toBe(`coup 0 sur ${last}`);
    expect(line(el, '.turn')).toBe('Position de départ');
    expect(line(el, '.move')).toBeNull();
    expect(numbers(el)).toEqual(['3', '3']);
    expect(pieces(el)).toEqual([3, 3]);
    expect([...el.shadowRoot!.querySelectorAll('.count .what')].map((n) => n.textContent)).toEqual(['Piles blanches', 'Piles rouges']);
    expect(line(el, '.lead')).toBeNull();
    expect(line(el, '.why')).toBeNull();
    expect(line(el, '.result')).toBeNull();
    // One fixed game: nothing draws another, and no attribute chooses one.
    expect(el.shadowRoot!.querySelector('[data-role="action"]')).toBeNull();
  });

  it('tells a move as a cause, in order: whose turn, the move, the scoreboard, then the gap', async () => {
    const el = await mount();
    vi.useFakeTimers();
    // The second move: Red lands on a white stack, and both counts change.
    role(el, 'next').click();
    role(el, 'next').click();
    const f = game.frames[2]!;
    expect(f.choice!.mover).toBe('Red');
    expect(game.frames[1]!.stacks).toEqual({ white: 4, red: 3 });
    expect(f.stacks).toEqual({ white: 3, red: 4 });
    // Beat 1: whose turn; the board, the count and the gap are still those before the move.
    expect(line(el, '.turn')).toBe('Aux Rouges de jouer');
    expect(line(el, '.move')).toBeNull();
    expect(moved(el)).toBe(1);
    expect(numbers(el)).toEqual(['4', '3']);
    expect(line(el, '.lead')).toBeNull();
    // Beat 2: the move.
    vi.advanceTimersByTime(BEATS.move);
    expect(line(el, '.move')).toBe('Rouge joue c3-1-c2');
    expect(el.shadowRoot!.querySelector('.board .to')!.getAttribute('data-cell')).toBe('5');
    expect(numbers(el)).toEqual(['4', '3']);
    expect(line(el, '.lead')).toBeNull();
    // Beat 3: the scoreboard changes, and says which count did.
    vi.advanceTimersByTime(BEATS.score - BEATS.move);
    expect(numbers(el)).toEqual(['3', '4']);
    expect(pieces(el)).toEqual([3, 4]);
    expect(changed(el)).toEqual([true, true]);
    expect(line(el, '.lead')).toBeNull();
    // Beat 4: the gap, from the mover's side, and how many moves did as well.
    vi.advanceTimersByTime(BEATS.gap - BEATS.score);
    expect(line(el, '.lead')).toBe('Écart pour les Rouges+1');
    expect(line(el, '.why')).toBe('Le seul coup à +1, sur 16 possibles.');
    expect(line(el, '.result')).toBeNull();
    remove(el);
  });

  it('holds each move at least three seconds, its last beat well before the next move', () => {
    expect(MOVE_MS).toBeGreaterThanOrEqual(3000);
    expect(BEATS.move).toBeLessThan(BEATS.score);
    expect(BEATS.score).toBeLessThan(BEATS.gap);
    expect(MOVE_MS - BEATS.gap).toBeGreaterThanOrEqual(1000);
  });

  it('a step back, or a jump, shows the step settled at once, and drops the beats under way', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'next').click();
    role(el, 'next').click();
    role(el, 'next').click();
    expect(vi.getTimerCount()).toBe(3);
    role(el, 'previous').click();
    expect(vi.getTimerCount()).toBe(0);
    expect(counter(el)).toBe(`coup 2 sur ${last}`);
    expect(line(el, '.move')).toBe('Rouge joue c3-1-c2');
    expect(numbers(el)).toEqual(['3', '4']);
    expect(changed(el)).toEqual([false, false]);
    expect(line(el, '.lead')).toBe('Écart pour les Rouges+1');
    remove(el);
  });

  it('does not pretend a tie was a choice: « un des N coups », counted from the game', async () => {
    const first = game.frames[1]!.choice!;
    expect(first.tied).toBeGreaterThan(1);
    expect(whyText('fr', first)).toBe(`Un des ${first.tied} coups à +1, sur ${first.weighed} possibles.`);
    expect(whyText('en', first)).toBe(`One of the ${first.tied} moves at +1, of ${first.weighed} possible.`);
    expect(whyText('fr', { ...first, tied: 1, gap: -2 })).toBe(`Le seul coup à −2, sur ${first.weighed} possibles.`);
    expect(whyText('fr', { ...first, weighed: 1, tied: 1 })).toBe('Le seul coup possible.');
    expect(whyText('fr', { ...first, wins: true, tied: 2 })).toBe(`Un des 2 coups qui gagnent, sur ${first.weighed} possibles.`);
    expect(whyText('fr', { ...first, wins: true, tied: 1 })).toBe(`Le seul coup qui gagne, sur ${first.weighed} possibles.`);
  });

  it('every step’s words are the game’s own numbers', async () => {
    // Reduced motion: every step is shown settled.
    setMedia(REDUCED_MOTION, true);
    const el = await mount();
    for (let i = 0; i < last; i++) role(el, 'previous').click();
    for (let i = 1; i <= last; i++) role(el, 'next').click();
    // Walk back through the settled steps and compare each with its frame.
    for (let i = last; i >= 1; i--) {
      const f = game.frames[i]!;
      expect(numbers(el), `move ${i}`).toEqual([String(f.stacks.white), String(f.stacks.red)]);
      expect($(el, '.lead .value').textContent).toBe(f.choice!.gap > 0 ? `+${f.choice!.gap}` : f.choice!.gap < 0 ? `−${-f.choice!.gap}` : '0');
      expect(line(el, '.why')).toBe(whyText('fr', f.choice!));
      role(el, 'previous').click();
    }
    expect(counter(el)).toBe(`coup 0 sur ${last}`);
  });

  it('ends on the result, as the stamp and how, and the play control replays', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'play').click();
    vi.advanceTimersByTime(MOVE_MS * last + BEATS.gap);
    expect(counter(el)).toBe(`coup ${last} sur ${last}`);
    expect(playState(el)).toBe('replay');
    expect(line(el, '.result')).toBe('Rouge gagneToutes les piles ont un sommet rouge.');
    expect(numbers(el)).toEqual(['0', '3']);
    expect(line(el, '.why')).toBe('Le seul coup qui gagne, sur 16 possibles.');
    role(el, 'play').click();
    expect(counter(el)).toBe(`coup 0 sur ${last}`);
    expect(line(el, '.result')).toBeNull();
    remove(el);
  });

  // Regression: the turn line kept « Aux Rouges de jouer » beside the result once the game was over.
  it('once the game is over, the turn line no longer says whose turn it is', async () => {
    const el = await mount();
    vi.useFakeTimers();
    for (let i = 0; i < last - 1; i++) role(el, 'previous').click();
    for (let i = 1; i < last; i++) role(el, 'next').click();
    vi.advanceTimersByTime(BEATS.gap);
    role(el, 'next').click();
    // The winning move is not played yet: it is still Red to play.
    expect(line(el, '.turn')).toBe('Aux Rouges de jouer');
    vi.advanceTimersByTime(BEATS.gap);
    expect(line(el, '.result')).toBe('Rouge gagneToutes les piles ont un sommet rouge.');
    expect(line(el, '.turn')).toBeNull();
    // A step back shows the turn again; the end, reached by a jump, settled, has none.
    role(el, 'previous').click();
    expect(line(el, '.turn')).not.toBeNull();
    role(el, 'previous').click();
    role(el, 'next').click();
    role(el, 'next').click();
    vi.advanceTimersByTime(BEATS.gap);
    expect(line(el, '.turn')).toBeNull();
    role(el, 'play').click();
    expect(line(el, '.turn')).toBe('Position de départ');
    remove(el);
  });

  it('reads each step whole to a screen reader, and titles the board with it', async () => {
    const el = await mount();
    expect($(el, '[role="status"]').textContent).toBe(`Position de départ. Piles blanches${NNBSP}: 3, piles rouges${NNBSP}: 3.`);
    role(el, 'next').click();
    role(el, 'next').click();
    const said = `Rouge joue c3-1-c2. Piles blanches${NNBSP}: 3, piles rouges${NNBSP}: 4. Écart pour les Rouges${NNBSP}: +1. Le seul coup à +1, sur 16 possibles.`;
    expect($(el, '[role="status"]').textContent).toBe(said);
    expect(spoken('fr', game.frames[2]!)).toBe(said);
    expect(spoken('en', game.frames[last]!)).toMatch(/Red wins\. Every stack has Red on top\.$/);
  });

  it('under reduced motion nothing plays by itself: the end of the game, settled, and a step shows at once', async () => {
    setMedia(REDUCED_MOTION, true);
    const el = await mount();
    intersect(el);
    expect(playState(el)).toBe('play');
    expect(counter(el)).toBe(`coup ${last} sur ${last}`);
    expect(line(el, '.result')).toBe('Rouge gagneToutes les piles ont un sommet rouge.');
    vi.useFakeTimers();
    role(el, 'previous').click();
    role(el, 'next').click();
    expect(vi.getTimerCount()).toBe(0);
    expect(line(el, '.lead')).toBe('Écart pour les Rouges+3');
    remove(el);
  });

  it('the move’s name carries its explanation', async () => {
    const el = await mount('en');
    role(el, 'next').click();
    role(el, 'previous').click();
    role(el, 'next').click();
    vi.useFakeTimers();
    role(el, 'next').click();
    role(el, 'previous').click();
    const name = $(el, '.move .move-name');
    expect(name.textContent!.startsWith('c1-1-c2')).toBe(true);
    expect(el.shadowRoot!.getElementById(name.getAttribute('aria-describedby')!)!.textContent).toBe('From c1, 1 piece, to c2.');
    remove(el);
  });

  it('stops its beats and its stepper once disconnected', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'play').click();
    role(el, 'next').click();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    remove(el);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('<pogo-greedy> transport', () => {
  it('names its step buttons by the move, since each step is a move of a game', async () => {
    const el = await mount();
    const name = (r: string) => el.shadowRoot!.querySelector(`[data-role="${r}"]`)!.getAttribute('aria-label');
    expect([name('previous'), name('next')]).toEqual(['Revenir au coup précédent', 'Passer au coup suivant']);
  });
});

describe('<pogo-greedy> scoreboard', () => {
  // Regression: the inverted block behind a count that had just changed was the 2ch of the body font,
  // 17px, for a 34px digit about 15px wide: the « 4 » touched its edges and read as clipped.
  it('sizes a count’s block from its digit, with room on each side', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-greedy.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.number \{[^}]*padding: 0\.08em 0\.14em 0\.04em;/);
    expect(css).toMatch(/\.count \{[^}]*grid-template-columns: auto minmax\(2ch, auto\) minmax\(0, 1fr\);/);
  });
});
