import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableData } from '../data';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia, shownText } from '../test-dom';
import { PogoRetrograde, STEP_MS, arrowGeometry } from './pogo-retrograde';

if (!customElements.get('pogo-retrograde')) customElements.define('pogo-retrograde', PogoRetrograde);
const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
const NNBSP = ' ';

async function mount(lang: string, reduced = false): Promise<PogoRetrograde> {
  resetMedia();
  if (reduced) setMedia(REDUCED_MOTION, true);
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-retrograde') as PogoRetrograde;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const $ = (el: PogoRetrograde, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoRetrograde, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
/** Which columns are shown, in the order the game is played: « et ainsi de suite », lost in 2, won in 1, lost in 0. */
const shown = (el: PogoRetrograde) => $$(el, '.col').map((s) => !s.hasAttribute('data-off'));
const arrowsShown = (el: PogoRetrograde) => $$(el, '.arrow').map((a) => !a.hasAttribute('data-off'));
const next = (el: PogoRetrograde) => $(el, '[data-role="next"]').click();

beforeEach(() => {
  PogoRetrograde.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(table) };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-retrograde>', () => {
  it('starts by itself once half of it is on screen, pauses when it leaves, and resumes when it comes back', async () => {
    const el = await mount('fr');
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    leave(el);
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    el.parentElement!.removeChild(el);
  });

  it('a reader’s pause holds when it comes back on screen', async () => {
    const el = await mount('fr');
    intersect(el);
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-role="play"]')!.click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
    el.parentElement!.removeChild(el);
  });

  it('lays the tree as the game is played: lost in 2, then won in 1, then lost in 0', async () => {
    const el = await mount('fr');
    expect($$(el, '.col').map((c) => c.dataset.label ?? 'etc')).toEqual(['etc', 'lost-2', 'won-1', 'lost-0']);
    expect($$(el, '.col:not(.etc)').map((c) => c.querySelectorAll('.node').length)).toEqual([1, 2, 2]);
    expect($$(el, '.node .tag').map((x) => x.textContent)).toEqual(['Perdue en 2', 'Gagnée en 1', 'Gagnée en 1', 'Perdue en 0', 'Perdue en 0']);
    expect($$(el, '.node .turn').map((x) => x.textContent)).toEqual(['Blanc au trait', 'Rouge au trait', 'Rouge au trait', 'Blanc au trait', 'Blanc au trait']);
  });

  it('tells it right to left, as the analysis goes: the final positions, one move before, two, and so on', async () => {
    const el = await mount('fr');
    // A column to come is laid out from the first step: its heading, and its boards as empty
    // ruled placeholders, so the figure never looks unloaded and nothing moves as steps land.
    const css = readFileSync('src/elements/pogo-retrograde.css', 'utf8');
    // The column itself is never hidden: only what its step adds waits for it.
    expect(css).not.toMatch(/\.col\[data-off\]\s*[,{]/);
    expect(css).not.toMatch(/display: none/);
    const cols = $$(el, '.col');
    expect(cols.map((c) => c.getAttribute('aria-hidden'))).toEqual(['true', 'true', 'true', null]);
    expect(cols.slice(0, 3).every((c) => c.querySelector('.rule')!.textContent!.length > 0)).toBe(true);
    // Every board still to come is drawn empty: a ruled grid, no disc.
    const boards = $$(el, '.node svg.board');
    expect(boards.map((b) => b.querySelectorAll('.cell').length)).toEqual([9, 9, 9, 9, 9]);
    expect(boards.map((b) => b.querySelectorAll('.disc').length > 0)).toEqual([false, false, false, true, true]);
    expect($(el, '[data-role="counter"]').textContent).toBe('étape 1 sur 4');
    expect(shown(el)).toEqual([false, false, false, true]);
    expect(arrowsShown(el)).toEqual([false, false, false, false, false]);
    expect($(el, '[role="status"]').textContent).toBe(`Toutes les piles appartiennent à l’adversaire${NNBSP}: perdue en 0.`);
    next(el);
    expect(shown(el)).toEqual([false, false, true, true]);
    // The two arrows from the positions won in 1 to the finals.
    expect(arrowsShown(el)).toEqual([true, true, false, false, false]);
    expect($(el, '[role="status"]').textContent).toBe(`Un coup mène à une position perdue pour l’adversaire${NNBSP}: gagnée en 1.`);
    next(el);
    expect(shown(el)).toEqual([false, true, true, true]);
    expect(arrowsShown(el)).toEqual([true, true, true, true, false]);
    expect($(el, '[role="status"]').textContent).toBe(`Tous les coups mènent à une position gagnée pour l’adversaire${NNBSP}: perdue en 2.`);
    next(el);
    expect(shown(el)).toEqual([true, true, true, true]);
    expect(arrowsShown(el)).toEqual([true, true, true, true, true]);
    expect($(el, '[role="status"]').textContent).toBe(`Et ainsi de suite${NNBSP}: gagnée en 3, perdue en 4…`);
    expect($(el, '[data-role="counter"]').textContent).toBe('étape 4 sur 4');
    // And back.
    $(el, '[data-role="previous"]').click();
    expect(shown(el)).toEqual([false, true, true, true]);
  });

  it('each column carries the rule that marks it, the current one told apart', async () => {
    const el = await mount('en');
    expect($$(el, '.col .rule').map((r) => r.textContent)).toEqual([
      'And so on:',
      'Every move leads to a position won for the opponent: lost in 2.',
      'One move leads to a position lost for the opponent: won in 1.',
      'Every stack belongs to the opponent: lost in 0.',
    ]);
    expect($$(el, '.col').map((c) => c.hasAttribute('data-current'))).toEqual([false, false, false, true]);
    next(el);
    expect($$(el, '.col').map((c) => c.hasAttribute('data-current'))).toEqual([false, false, true, false]);
    expect($$(el, '.etc .tag').map((x) => x.textContent)).toEqual(['Won in 3', 'Lost in 4']);
  });

  it('draws an arrow per move, each carrying the move’s name, explained, and who plays it for a screen reader', async () => {
    const el = await mount('fr');
    // Four moves, and the dashed arrow of « et ainsi de suite », which carries none.
    expect($$(el, '.arrow')).toHaveLength(5);
    expect($$(el, '.arrow.more')).toHaveLength(1);
    const labels = $$(el, '.arrow-label');
    expect(labels.map((l) => shownText(l))).toEqual(['Rouge joue b2-3-b1', 'Rouge joue c3-1-c2', 'Blanc joue c1-1-b1', 'Blanc joue c1-1-c2']);
    expect(labels.map((l) => l.querySelector('.sr')!.textContent)).toEqual(['Rouge joue ', 'Rouge joue ', 'Blanc joue ', 'Blanc joue ']);
    expect(labels.map((l) => l.querySelector('.move-name [role="tooltip"]')!.textContent)).toEqual([
      'De b2, 3 pièces, vers b1.',
      'De c3, 1 pièce, vers c2.',
      'De c1, 1 pièce, vers b1.',
      'De c1, 1 pièce, vers c2.',
    ]);
    // A label comes with its arrow.
    expect(labels.map((l) => !l.hasAttribute('data-off'))).toEqual([false, false, false, false]);
    next(el);
    expect(labels.map((l) => !l.hasAttribute('data-off'))).toEqual([true, true, false, false]);
  });

  it('a board shows the move that leads to it once its arrow is drawn, never before', async () => {
    const el = await mount('fr');
    const boards = () => $$(el, '.node svg.board');
    const marked = () => boards().map((b) => b.querySelector('.to')?.getAttribute('data-cell') ?? null);
    expect(marked()).toEqual([null, null, null, null, null]);
    next(el);
    // The finals: b2-3-b1 landed on b1, c3-1-c2 on c2.
    expect(marked()).toEqual([null, null, null, '1', '5']);
    expect(boards()[3]!.querySelector('.from')!.getAttribute('data-cell')).toBe('4');
    expect(boards()[3]!.querySelectorAll('.disc.moved')).toHaveLength(3);
    next(el);
    expect(marked()).toEqual([null, '1', '5', '1', '5']);
    expect(boards()[0]!.querySelector('title')!.textContent).toBe(`Position perdue en 2${NNBSP}: Blanc au trait.`);
  });

  it('holds each step long enough to be read, and ends on the whole tree with replay', async () => {
    expect(STEP_MS).toBeGreaterThanOrEqual(4000);
    const el = await mount('fr');
    vi.useFakeTimers();
    $(el, '[data-role="play"]').click();
    vi.advanceTimersByTime(3999);
    expect(shown(el)).toEqual([false, false, false, true]);
    vi.advanceTimersByTime(STEP_MS - 3999);
    expect(shown(el)).toEqual([false, false, true, true]);
    vi.advanceTimersByTime(2 * STEP_MS);
    expect(shown(el)).toEqual([true, true, true, true]);
    expect(playState(el)).toBe('replay');
    el.parentElement!.removeChild(el);
  });

  it('under reduced motion nothing plays by itself: the whole tree, and the play control', async () => {
    const el = await mount('fr', true);
    intersect(el);
    expect(shown(el)).toEqual([true, true, true, true]);
    expect(arrowsShown(el)).toEqual([true, true, true, true, true]);
    expect(playState(el)).toBe('play');
  });

  it('an arrow stops where its head begins, and the head points at the target', () => {
    const { line, head } = arrowGeometry([0, 0], [100, 0]);
    expect(line).toEqual([
      [0, 0],
      [90, 0],
    ]);
    expect(head).toEqual([
      [100, 0],
      [90, 5],
      [90, -5],
    ]);
    // A zero-length arrow (no layout yet) draws nothing wrong: finite numbers only.
    expect(arrowGeometry([3, 3], [3, 3]).head.flat().every(Number.isFinite)).toBe(true);
  });

  it('a step file that breaks the analysis shows the fallback', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = JSON.parse(JSON.stringify(table)) as TableData;
    broken.retro[2]!.positions[0]!.moves!.pop();
    PogoRetrograde.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(broken) };
    const el = await mount('fr');
    expect(el.hasAttribute('data-failed')).toBe(true);
    error.mockRestore();
  });

  it('an aborted signal stops a running stepper', async () => {
    const el = await mount('fr');
    vi.useFakeTimers();
    $(el, '[data-role="play"]').click();
    const cols = $$(el, '.col');
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(20_000);
    expect(cols.map((s) => !s.hasAttribute('data-off'))).toEqual([false, false, false, true]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
