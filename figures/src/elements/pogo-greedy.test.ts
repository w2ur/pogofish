import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia, shownText } from '../test-dom';
import { moveName } from '../engine';
import { moveWords } from '../kit/move-tip';
import { LOSS_SCORE, WIN_SCORE } from '../players';
import { candidateRows, gapText, greedyGame, valueRows, type GreedyChoice } from './greedy-game';
import type { Lang } from '../kit/strings';
import { MOVE_TEMPO_MS } from '../kit/tempo';
import { BEATS, PogoGreedy, STEP_MS, spoken, valueText, whyText } from './pogo-greedy';

if (!customElements.get('pogo-greedy')) customElements.define('pogo-greedy', PogoGreedy);
PogoGreedy.deps = { engine: () => Promise.resolve() };

const flush = () => new Promise((r) => setTimeout(r, 0));
const NNBSP = '\u202f';
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
/** The candidates' table on screen, one [move, red stacks, white stacks, gap] per row, or null when none is shown. */
const cands = (el: PogoGreedy): string[][] | null => {
  const table = el.shadowRoot!.querySelector('.cands:not([data-off])');
  if (!table) return null;
  return [...table.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c, k) => (k === 0 ? c.querySelector('.chip')!.firstChild!.textContent! : c.textContent!)));
};
/** What the table must show for a choice, from the game: every move weighed, the greatest value first. */
const want = (c: GreedyChoice, lang: Lang = 'fr') => candidateRows(c).map((r) => [moveName(r.move), String(r.stacks.red), String(r.stacks.white), valueText(lang, r.score)]);
/** The move marked as the one played among those weighed. */
const chosen = (el: PogoGreedy) => el.shadowRoot!.querySelector('.cands:not([data-off])[data-chosen] tr[data-chosen] .chip')?.firstChild?.textContent ?? null;
const bestRows = (el: PogoGreedy) => el.shadowRoot!.querySelectorAll('.cands:not([data-off]) tr[data-best]');
const remove = (el: PogoGreedy) => el.parentElement!.removeChild(el);

beforeEach(() => resetMedia());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-greedy>', () => {
  // Round 7: the transport sits under the board, and the result on its row, in the table's column: both are cells of the one grid.
  it('lays the board, the panel, the transport and the result as the four cells of one grid, the result outside the panel', async () => {
    const el = await mount();
    const game = $(el, '.game');
    expect([...game.children].map((c) => c.className.split(' ')[0])).toEqual(['board-slot', 'panel', 'controls', 'result']);
    expect($(el, '.panel .result')).toBeNull();
    remove(el);
  });

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

  it('opens on the start: no move weighed and no move yet; the table’s four columns named, and no pile counter', async () => {
    const el = await mount();
    expect(counter(el)).toBe(`coup 0 sur ${last}`);
    expect(line(el, '.turn')).toBe('Position de départ');
    expect(line(el, '.move')).toBeNull();
    expect(cands(el)).toBeNull();
    expect(line(el, '.why')).toBeNull();
    expect(line(el, '.result')).toBeNull();
    // Round 5, the owner's columns, and what « Écart » is said over them.
    expect([...el.shadowRoot!.querySelectorAll('.cands-head th')].map((th) => th.textContent)).toEqual(['Coup', 'Piles rouges', 'Piles blanches', 'Écart']);
    expect(line(el, '.weigh-unit')).toBe(`écart${NNBSP}: piles du joueur moins piles de l’adversaire, après le coup`);
    // The counter of piles is gone: the table carries the counts.
    expect(el.shadowRoot!.querySelector('.scoreboard, .count')).toBeNull();
    // One fixed game: nothing draws another, and no attribute chooses one.
    expect(el.shadowRoot!.querySelector('[data-role="action"]')).toBeNull();
  });

  it('tells a move as greedy makes it, in order: whose turn, every move weighed, the greatest, the move', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'next').click();
    role(el, 'next').click();
    const c = game.frames[2]!.choice!;
    expect(c.mover).toBe('Red');
    // Beat 1: whose turn; nothing weighed yet.
    expect(line(el, '.turn')).toBe('Aux Rouges de jouer');
    expect(cands(el)).toBeNull();
    expect(line(el, '.move')).toBeNull();
    // Beat 2: every legal move, its two counts and its gap, the greatest first; none chosen yet.
    vi.advanceTimersByTime(BEATS.weigh);
    expect(cands(el)).toEqual(want(c));
    expect(cands(el)).toHaveLength(c.weighed);
    expect($(el, '.cands:not([data-off])').hasAttribute('data-chosen')).toBe(false);
    expect(line(el, '.why')).toBeNull();
    // Beat 3: the greatest marked, its ties with it, and the move drawn among them.
    vi.advanceTimersByTime(BEATS.best - BEATS.weigh);
    expect($(el, '.cands:not([data-off])').hasAttribute('data-chosen')).toBe(true);
    expect(bestRows(el)).toHaveLength(c.tied);
    for (const r of bestRows(el)) expect(r.lastElementChild!.textContent).toBe(gapText(c.gap));
    expect(chosen(el)).toBe(moveName(c.move));
    expect(line(el, '.why')).toBe(whyText('fr', c));
    expect(line(el, '.move')).toBeNull();
    // Beat 4: the move.
    vi.advanceTimersByTime(BEATS.move - BEATS.best);
    expect(line(el, '.move')).toBe(`Rouge joue ${moveName(c.move)}`);
    expect(el.shadowRoot!.querySelector('.board .to')!.getAttribute('data-cell')).toBe(String(c.move[2]));
    expect(line(el, '.result')).toBeNull();
    remove(el);
  });

  it('holds what is weighed long enough to be read, the move at the kit’s tempo, and the whole game under a minute', () => {
    expect(BEATS.weigh).toBeLessThan(BEATS.best);
    expect(BEATS.best - BEATS.weigh).toBeGreaterThanOrEqual(2500);
    expect(BEATS.best).toBeLessThan(BEATS.move);
    expect(BEATS.score - BEATS.move).toBe(MOVE_TEMPO_MS);
    expect(STEP_MS - BEATS.score).toBeGreaterThanOrEqual(1000);
    expect(STEP_MS * last).toBeLessThan(60_000);
  });

  it('a step back, or a jump, shows the step settled at once, and drops the beats under way', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'next').click();
    role(el, 'next').click();
    role(el, 'next').click();
    expect(vi.getTimerCount()).toBe(4);
    role(el, 'previous').click();
    expect(vi.getTimerCount()).toBe(0);
    const c = game.frames[2]!.choice!;
    expect(counter(el)).toBe(`coup 2 sur ${last}`);
    expect(line(el, '.move')).toBe(`Rouge joue ${moveName(c.move)}`);
    expect(cands(el)).toEqual(want(c));
    expect(chosen(el)).toBe(moveName(c.move));
    expect(line(el, '.why')).toBe(whyText('fr', c));
    remove(el);
  });

  it('does not pretend a tie was a choice: « un des N coups », counted from the game', async () => {
    const first = game.frames[1]!.choice!;
    expect(first.tied).toBeGreaterThan(1);
    expect(first.gap).toBe(1);
    expect(whyText('fr', first)).toBe(`Un des ${first.tied} coups à +1, sur ${first.weighed} possibles.`);
    expect(whyText('en', first)).toBe(`One of the ${first.tied} moves at +1, of ${first.weighed} possible.`);
    expect(whyText('fr', { ...first, tied: 1, gap: -2 })).toBe(`Le seul coup à −2, sur ${first.weighed} possibles.`);
    expect(whyText('fr', { ...first, weighed: 1, tied: 1 })).toBe('Le seul coup possible.');
    expect(whyText('fr', { ...first, wins: true, tied: 2 })).toBe(`Un des 2 coups qui gagnent, sur ${first.weighed} possibles.`);
    expect(whyText('fr', { ...first, wins: true, tied: 1 })).toBe(`Le seul coup qui gagne, sur ${first.weighed} possibles.`);
  });

  it('a value is a signed gap, or the end the move brings', () => {
    expect(valueText('fr', 2)).toBe('+2');
    expect(valueText('fr', -1)).toBe('−1');
    expect(valueText('fr', WIN_SCORE)).toBe('gagne');
    expect(valueText('en', LOSS_SCORE)).toBe('loses');
  });

  it('every step’s words and rows are the game’s own numbers', async () => {
    // Reduced motion: every step is shown settled.
    setMedia(REDUCED_MOTION, true);
    const el = await mount();
    for (let i = 0; i < last; i++) role(el, 'previous').click();
    for (let i = 1; i <= last; i++) role(el, 'next').click();
    // Walk back through the settled steps and compare each with its frame.
    for (let i = last; i >= 1; i--) {
      const f = game.frames[i]!;
      expect(cands(el), `move ${i}`).toEqual(want(f.choice!));
      expect(chosen(el)).toBe(moveName(f.choice!.move));
      expect(line(el, '.why')).toBe(whyText('fr', f.choice!));
      role(el, 'previous').click();
    }
    expect(counter(el)).toBe(`coup 0 sur ${last}`);
    // Greedy's best can still leave it behind: a step whose greatest value is negative.
    expect(game.frames.slice(1).some((f) => valueRows(f.choice!)[0]!.score < 0)).toBe(true);
  });

  it('a row hovered or focused shows its move on the position it is weighed from, landing; leaving it restores the board', async () => {
    setMedia(REDUCED_MOTION, true);
    const el = await mount();
    const f = game.frames[last]!;
    const other = candidateRows(f.choice!).find((r) => !r.best)!.move;
    const row = [...el.shadowRoot!.querySelectorAll<HTMLElement>('.cands:not([data-off]) tbody tr')].find((r) => r.querySelector('.chip')!.textContent!.startsWith(moveName(other)))!;
    row.dispatchEvent(new Event('pointerenter'));
    expect(row.hasAttribute('data-shown')).toBe(true);
    expect(el.shadowRoot!.querySelector('.board .mark.picked')!.getAttribute('data-cell')).toBe(String(other[0]));
    expect(el.shadowRoot!.querySelector('.board .mark.target')!.getAttribute('data-cell')).toBe(String(other[2]));
    expect(el.shadowRoot!.querySelector('.board .landings')!.getAttribute('data-cell')).toBe(String(other[2]));
    row.dispatchEvent(new Event('pointerleave'));
    expect(row.hasAttribute('data-shown')).toBe(false);
    expect(el.shadowRoot!.querySelector('.board .mark')).toBeNull();
    expect(el.shadowRoot!.querySelector('.board .to')!.getAttribute('data-cell')).toBe(String(f.choice!.move[2]));
    // The keyboard: the move's name is the row's tab stop.
    const chip = row.querySelector<HTMLElement>('.chip')!;
    expect(chip.tabIndex).toBe(0);
    chip.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(el.shadowRoot!.querySelector('.board .mark.picked')!.getAttribute('data-cell')).toBe(String(other[0]));
    chip.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(el.shadowRoot!.querySelector('.board .mark')).toBeNull();
    remove(el);
  });

  it('ends on the result, as the stamp and how, and the play control replays', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'play').click();
    vi.advanceTimersByTime(STEP_MS * last + BEATS.score);
    const end = game.frames[last]!;
    expect(counter(el)).toBe(`coup ${last} sur ${last}`);
    expect(playState(el)).toBe('replay');
    expect(line(el, '.result')).toBe('Rouge gagneToutes les piles ont un sommet rouge.');
    expect(line(el, '.why')).toBe(`Le seul coup qui gagne, sur ${end.choice!.weighed} possibles.`);
    expect(bestRows(el)).toHaveLength(1);
    expect(bestRows(el)[0]!.lastElementChild!.textContent).toBe('gagne');
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
    vi.advanceTimersByTime(BEATS.score);
    role(el, 'next').click();
    // The winning move is not played yet: it is still Red to play.
    expect(line(el, '.turn')).toBe('Aux Rouges de jouer');
    vi.advanceTimersByTime(BEATS.score);
    expect(line(el, '.result')).toBe('Rouge gagneToutes les piles ont un sommet rouge.');
    expect(line(el, '.turn')).toBeNull();
    // A step back shows the turn again; the end, reached by a jump, settled, has none.
    role(el, 'previous').click();
    expect(line(el, '.turn')).not.toBeNull();
    role(el, 'previous').click();
    role(el, 'next').click();
    role(el, 'next').click();
    vi.advanceTimersByTime(BEATS.score);
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
    const f = game.frames[2]!;
    const c = f.choice!;
    const weighed = valueRows(c).map((r) => `${valueText('fr', r.score)} (${r.moves.length} ${r.moves.length === 1 ? 'coup' : 'coups'})`).join(', ');
    const said = `Rouge joue ${moveName(c.move)}. Les coups possibles et leur écart${NNBSP}: ${weighed}. Piles blanches${NNBSP}: ${f.stacks.white}, piles rouges${NNBSP}: ${f.stacks.red}. Écart pour les Rouges${NNBSP}: ${gapText(c.gap)}. ${whyText('fr', c)}`;
    expect($(el, '[role="status"]').textContent).toBe(said);
    expect(spoken('fr', f)).toBe(said);
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
    expect(chosen(el)).toBe(moveName(game.frames[last]!.choice!.move));
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
    const m = game.frames[1]!.choice!.move;
    const name = $(el, '.move .move-name');
    expect(name.textContent!.startsWith(moveName(m))).toBe(true);
    expect(el.shadowRoot!.getElementById(name.getAttribute('aria-describedby')!)!.textContent).toBe(moveWords('en', m));
    // The table in English: the same four columns.
    expect([...el.shadowRoot!.querySelectorAll('.cands-head th')].map((th) => th.textContent)).toEqual(['Move', 'Red stacks', 'White stacks', 'Gap']);
    expect(cands(el)).toEqual(want(game.frames[1]!.choice!, 'en'));
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
