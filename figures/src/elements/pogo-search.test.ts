import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { key, moveName, type State } from '../engine';
import { bestMove, search, type SearchSnapshot } from '../mcts';
import { parseAz, type AzNet } from '../nets';
import { createStore, type Store } from '../store';
import { REDUCED_MOTION, intersect, playState, resetMedia, setMedia, shownText } from '../test-dom';
import { PogoSearch } from './pogo-search';
import { PUZZLE5, STOPS } from './search-steps';
import { formatShare } from '../kit/score';

if (!customElements.get('pogo-search')) customElements.define('pogo-search', PogoSearch);

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as {
  positions: { label: string; state: State; visits: number[]; legal: number[][] }[];
};
const b = readFileSync(resolve(process.cwd(), 'public/nets/az-lc1-s1.pfw'));
const az = parseAz(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const puzzle = fixture.positions.find((p) => p.label === 'puzzle 5')!;
const flush = () => new Promise((r) => setTimeout(r, 0));
const makeStore = () => createStore({ storage: null, loadEngine: () => Promise.resolve() });
/** Every snapshot search() emitted in the last run, by simulation. */
let emitted: SearchSnapshot[] = [];
const spySearch = (s: State, net: AzNet, o: { onSnapshot: (x: SearchSnapshot) => void; signal: AbortSignal }) => {
  emitted = [];
  return search(s, net, {
    sims: 100,
    signal: o.signal,
    onSnapshot: (x) => {
      emitted.push(x);
      o.onSnapshot(x);
    },
  });
};

function use(s: Store, searchFn = spySearch): void {
  PogoSearch.deps = { store: s, az: () => Promise.resolve(az), search: searchFn };
}

async function mount(position: string, lang = 'fr'): Promise<PogoSearch> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-search') as PogoSearch;
  el.setAttribute('position', position);
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: Element, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const role = (el: Element, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
/** Visits shown, by move name. */
const visits = (el: Element) => new Map($$(el, '.search-table tbody tr').map((r) => [r.dataset.move, Number(r.querySelector('.visits .value')!.textContent)]));
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
};

beforeEach(() => {
  resetMedia();
  setMedia(REDUCED_MOTION, true);
  use(makeStore());
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-search>', () => {
  it('runs the search by itself once on screen, then plays its steps', async () => {
    setMedia(REDUCED_MOTION, false);
    const el = await mount('puzzle5', 'en');
    expect(el.shadowRoot!.querySelector('[data-role="counter"]')).toBeNull();
    intersect(el);
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    expect(playState(el)).toBe('pause');
    el.remove();
  });

  it('under reduced motion it waits for « Lancer »', async () => {
    setMedia(REDUCED_MOTION, true);
    const el = await mount('puzzle5', 'en');
    intersect(el);
    await flush();
    expect(el.shadowRoot!.querySelector('[data-role="counter"]')).toBeNull();
    expect(role(el, 'run').disabled).toBe(false);
  });

  it('keeps its controls right under the table of moves they step', async () => {
    const el = await mount('puzzle5', 'fr');
    const table = el.shadowRoot!.querySelector('.search > .ranked')!;
    expect(table.nextElementSibling!.classList.contains('search-controls')).toBe(true);
  });

  it('shows puzzle 5 before any simulation, the bars’ and the mean value’s scales under the table', async () => {
    const el = await mount('puzzle5', 'en');
    expect([...el.shadowRoot!.querySelectorAll('.search .scale-note')].map((p) => p.textContent)).toEqual([
      'Bars: the preference from 0 to 100%, the visits from 0 to 100.',
      'Mean value: from −1, a loss, to +1, a win, for the player to move (Red).',
    ]);
    expect(el.shadowRoot!.textContent).not.toMatch(/az-lc1-s1|puzzle 5|bench/);
    expect($(el, '.search').dataset.position).toBe(key(PUZZLE5));
    expect($(el, '.where-from').textContent).toBe('Position: a test problem, Red to move.');
    expect([...visits(el).values()].every((v) => v === 0)).toBe(true);
    expect(shownText($(el, '.said-now'))).toBe('Before the search: the net’s preferences alone. The net alone prefers b2-2-a3.');
    // Every move name explains itself, in the words and in the table, and marks itself on the board.
    expect($(el, '.said-now .move-name [role="tooltip"]').textContent).toBe('From b2, 2 pieces, to a3.');
    const rowName = $(el, '.search-table tbody th .move-name');
    expect(rowName.querySelector('[role="tooltip"]')!.textContent).toMatch(/^From [abc][123], [123] pieces?, to [abc][123]\.$/);
    rowName.focus();
    expect(el.shadowRoot!.querySelectorAll('.board-slot .mark.picked')).toHaveLength(1);
    expect(el.shadowRoot!.querySelectorAll('.board-slot .mark.target')).toHaveLength(1);
    rowName.blur();
    expect(el.shadowRoot!.querySelectorAll('.board-slot .mark')).toHaveLength(0);
  });

  it('pogo-search on puzzle 5 ends on the fixture’s visits, and plays bestMove', async () => {
    const el = await mount('puzzle5', 'en');
    role(el, 'run').click();
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    // Reduced motion: the first snapshot, then the reader steps to the last.
    expect($(el, '[data-role="counter"]').textContent).toBe('1 simulation of 100');
    for (let i = 0; i < STOPS.length; i++) role(el, 'next').click();
    expect($(el, '[data-role="counter"]').textContent).toBe('100 simulations of 100');
    const shown = visits(el);
    puzzle.legal.forEach(([a, n, c], i) => expect(shown.get(moveName([a!, n!, c!]))).toBe(puzzle.visits[i]));
    const played = $(el, 'tr.played').dataset.move;
    expect(played).toBe(moveName(bestMove(emitted.at(-1)!)));
    expect(played).toBe('b2-3-b1');
    expect($(el, 'tr.played .tag').textContent).toBe('played');
  });

  it('the snapshots shown are the ones search() emits at 1, 2, 3, 5, 10, 20, 50, 100', async () => {
    const el = await mount('puzzle5', 'en');
    role(el, 'run').click();
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    for (const [k, n] of STOPS.entries()) {
      if (k > 0) role(el, 'next').click();
      const snap = emitted[n - 1]!;
      expect(snap.sim).toBe(n);
      const shown = visits(el);
      for (const r of snap.root) expect(shown.get(moveName(r.move))).toBe(r.visits);
      expect($(el, '.search-table caption').textContent).toBe(`The possible moves, after ${n} simulation${n === 1 ? '' : 's'}`);
    }
  });

  it('under reduced motion it never advances by itself', async () => {
    const el = await mount('puzzle5', 'en');
    role(el, 'run').click();
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    await new Promise((r) => setTimeout(r, 1300));
    expect($(el, '[data-role="counter"]').textContent).toBe('1 simulation of 100');
    expect(playState(el)).toBe('play');
  });

  it('plays the steps by itself when motion is allowed', async () => {
    setMedia(REDUCED_MOTION, false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const el = await mount('puzzle5', 'en');
    role(el, 'run').click();
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    await vi.advanceTimersByTimeAsync(1100 * STOPS.length);
    expect($(el, '[data-role="counter"]').textContent).toBe('100 simulations of 100');
  });

  it('a search still running at disconnect is aborted', async () => {
    let seen: AbortSignal | undefined;
    let sims = 0;
    use(makeStore(), (s, net, o) => {
      seen = o.signal;
      return search(s, net, { sims: 100, batch: 1, signal: o.signal, onSnapshot: (x) => ((sims = x.sim), o.onSnapshot(x)) });
    });
    const el = await mount('puzzle5');
    role(el, 'run').click();
    await new Promise((r) => setTimeout(r, 0));
    el.parentElement!.removeChild(el);
    expect(seen!.aborted).toBe(true);
    const at = sims;
    await new Promise((r) => setTimeout(r, 30));
    expect(sims).toBe(at);
    expect(at).toBeLessThan(100);
  });

  it('« Jouer cette position contre l’ordinateur » hands the searched position to the store', async () => {
    const el = await mount('puzzle5');
    const heard = vi.fn();
    document.addEventListener('pogo:playfrom', heard);
    role(el, 'play-from').click();
    document.removeEventListener('pogo:playfrom', heard);
    expect(heard).toHaveBeenCalledTimes(1);
    const detail = (heard.mock.calls[0]![0] as CustomEvent).detail;
    expect(key(detail.state)).toBe(key(PUZZLE5));
    expect(detail.label).toBe('la recherche d’AlphaZero');
  });

  it('position="reader" searches the position the net figures show, and follows the store', async () => {
    const s = makeStore();
    use(s);
    const el = await mount('reader', 'en');
    const def = fixture.positions.find((p) => p.label === 'openingWin ply 3')!;
    expect($(el, '.search').dataset.position).toBe(key(def.state));
    expect($(el, '.where-from').textContent).toBe('Position: the opening mistake, after 3 moves.');
    s.newGame('White', 'normal');
    s.play(DEFAULT_GAME[0]!);
    await flush();
    expect($(el, '.search').dataset.position).toBe(key(s.current()!.states[1]!));
    role(el, 'run').click();
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    for (let i = 0; i < STOPS.length; i++) role(el, 'next').click();
    const fromRust = await search(s.current()!.states[1]!, az);
    const shown = visits(el);
    for (const r of fromRust.root) expect(shown.get(moveName(r.move))).toBe(r.visits);
  });

  it('puzzle 5 shows ten moves by the net’s preference, the five others behind the disclosure with their share', async () => {
    const el = await mount('puzzle5');
    const shown = $$(el, '.ranked > table > tbody > tr');
    expect(shown).toHaveLength(10);
    const hidden = $$(el, '.others tbody tr').map((r) => r.dataset.move);
    expect(hidden).toEqual(['b2-2-c1', 'b2-3-b3', 'b3-1-a3', 'b3-1-b2', 'b3-1-c3']);
    const fx = fixture.positions.find((p) => p.label === 'puzzle 5')! as unknown as { priors: number[]; legal: number[][] };
    const share = fx.legal.reduce((a, [x, n, y], i) => (hidden.includes(moveName([x!, n!, y!])) ? a + fx.priors[i]! : a), 0);
    expect($(el, '.others-summary').textContent).toBe(`Les 5 autres coups, ${formatShare('fr', share)} de la préférence du réseau`);
    expect(($(el, '.others') as HTMLDetailsElement).open).toBe(false);
  });

  it('the move the search would play stays visible, in the last place, even when the net ranks it below tenth', async () => {
    // A stand-in search whose visits all go to the net's least preferred move.
    const fake = async (st: State, net: AzNet, o: { onSnapshot: (x: SearchSnapshot) => void; signal: AbortSignal }) => {
      const base = (await search(st, net, { sims: 1 })).root;
      const order = base.map((_, i) => i).sort((a, b) => base[a]!.prior - base[b]!.prior);
      const last = order[0]!;
      let snap: SearchSnapshot = { sim: 0, root: base };
      for (let n = 1; n <= 100; n++) {
        snap = { sim: n, root: base.map((r, i) => ({ ...r, visits: i === last ? n : 0, meanValue: i === last ? 0.5 : 0 })) };
        o.onSnapshot(snap);
      }
      return snap;
    };
    use(makeStore(), fake);
    const el = await mount('puzzle5', 'en');
    role(el, 'run').click();
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    const shown = $$(el, '.ranked > table > tbody > tr').map((r) => r.dataset.move);
    expect(shown).toHaveLength(10);
    expect(shown.at(-1)).toBe('b3-1-c3');
    expect($(el, 'tr.played').dataset.move).toBe('b3-1-c3');
    // The tenth by preference gives up its place; the disclosure holds it and the four after it, not the move played.
    const hidden = $$(el, '.others tbody tr').map((r) => r.dataset.move);
    expect(hidden).toEqual(['b2-2-c3', 'b2-2-c1', 'b2-3-b3', 'b3-1-a3', 'b3-1-b2']);
    // Their combined preference, from the fixture's priors: the move played is not counted.
    const fx = fixture.positions.find((p) => p.label === 'puzzle 5')! as unknown as { priors: number[]; legal: number[][] };
    const share = fx.legal.reduce((a, [x, n, y], i) => (hidden.includes(moveName([x!, n!, y!])) ? a + fx.priors[i]! : a), 0);
    expect($(el, '.others-summary').textContent).toBe(`The other 5 moves, ${formatShare('en', share)} of the net’s preference`);
  });

  it('exactly ten moves: all shown, the least preferred one played in its own place, no disclosure', async () => {
    const fake = async (st: State, net: AzNet, o: { onSnapshot: (x: SearchSnapshot) => void; signal: AbortSignal }) => {
      const base = (await search(st, net, { sims: 1 })).root;
      const last = base.map((_, i) => i).sort((a, b) => base[a]!.prior - base[b]!.prior)[0]!;
      let snap: SearchSnapshot = { sim: 0, root: base };
      for (let n = 1; n <= 100; n++) {
        snap = { sim: n, root: base.map((r, i) => ({ ...r, visits: i === last ? n : 0 })) };
        o.onSnapshot(snap);
      }
      return snap;
    };
    use(makeStore(), fake);
    // The default position has ten legal moves.
    const el = await mount('reader', 'en');
    const def = fixture.positions.find((p) => p.label === 'openingWin ply 3')!;
    expect(def.legal).toHaveLength(10);
    role(el, 'run').click();
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    const rows = $$(el, '.ranked > table > tbody > tr');
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.classList.contains('blank'))).toHaveLength(0);
    expect(rows.at(-1)!.classList.contains('played')).toBe(true);
    expect($$(el, '.others tbody tr')).toHaveLength(0);
    expect($(el, '.others').hasAttribute('data-none')).toBe(true);
  });
});
