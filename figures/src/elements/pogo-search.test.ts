import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { key, legal, moveName, type State } from '../engine';
import { bestMove, search, type SearchSnapshot, type SimulationTrace } from '../mcts';
import { parseAz, type AzNet } from '../nets';
import { createStore, type Store } from '../store';
import { REDUCED_MOTION, intersect, playState, resetMedia, setMedia, shownText } from '../test-dom';
import { MAX_ROWS, PogoSearch, shownRows } from './pogo-search';
import { signedNote } from './q-steps';
import { frameHold, searchScript } from './search-script';
import { PUZZLE5 } from './search-steps';
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
/** Every snapshot and trace search() emitted in the last run, by simulation. */
let emitted: SearchSnapshot[] = [];
let traced: SimulationTrace[] = [];
type Run = (s: State, net: AzNet, o: { onSnapshot: (x: SearchSnapshot) => void; onTrace?: (t: SimulationTrace) => void; signal: AbortSignal }) => Promise<SearchSnapshot>;
const spySearch: Run = (s, net, o) => {
  emitted = [];
  traced = [];
  return search(s, net, {
    sims: 100,
    signal: o.signal,
    onTrace: (t) => {
      traced.push(t);
      o.onTrace?.(t);
    },
    onSnapshot: (x) => {
      emitted.push(x);
      o.onSnapshot(x);
    },
  });
};

function use(s: Store, searchFn: Run = spySearch): void {
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
  for (let i = 0; i < 400 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
};
const ran = async (el: Element) => {
  role(el, 'run').click();
  await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
};
const frame = (el: Element) => $(el, '.search').dataset.frame;
const toEnd = (el: Element) => {
  for (let i = 0; i < 30; i++) role(el, 'next').click();
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
  it('runs the search by itself once on screen, then plays its frames', async () => {
    setMedia(REDUCED_MOTION, false);
    const el = await mount('puzzle5', 'en');
    expect(el.shadowRoot!.querySelector('[data-role="counter"]')).toBeNull();
    intersect(el);
    await until(() => !!el.shadowRoot!.querySelector('[data-role="counter"]'));
    expect(playState(el)).toBe('pause');
    expect(frame(el)).toBeUndefined();
    el.remove();
  });

  it('under reduced motion it waits for « Lancer », showing the position and the net’s preferences', async () => {
    const el = await mount('puzzle5', 'en');
    intersect(el);
    await flush();
    expect(el.shadowRoot!.querySelector('[data-role="counter"]')).toBeNull();
    expect(role(el, 'run').disabled).toBe(false);
    expect($(el, '.search-table caption').textContent).toBe('The possible moves, before the search');
    expect($(el, '.path').hasAttribute('data-off')).toBe(true);
  });

  it('keeps its controls in the board’s column, under the board, the path and the words they step', async () => {
    const el = await mount('puzzle5', 'fr');
    const col = [...$(el, '.board-col').children].map((c) => c.className);
    expect(col).toEqual(['board-slot', 'path', 'status', 'search-controls']);
    expect($(el, '.table-col > .search-table')).toBeTruthy();
  });

  it('shows puzzle 5 before any simulation, the bars’ and the mean value’s scales under the table', async () => {
    const el = await mount('puzzle5', 'en');
    expect($$(el, '.search .scale-note').map((p) => p.textContent)).toEqual([
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
    rowName.focus();
    expect(el.shadowRoot!.querySelectorAll('.board-slot .mark.picked')).toHaveLength(1);
    expect(el.shadowRoot!.querySelectorAll('.board-slot .mark.target')).toHaveLength(1);
    rowName.blur();
    expect(el.shadowRoot!.querySelectorAll('.board-slot .mark')).toHaveLength(0);
  });

  it('shows every root move of puzzle 5, in the net’s order, with its preference', async () => {
    const el = await mount('puzzle5', 'en');
    const rows = $$(el, '.search-table tbody tr');
    expect(rows).toHaveLength(legal(PUZZLE5).length);
    expect(rows).toHaveLength(15);
    const prefs = rows.map((r) => parseFloat(r.querySelector('.prior .value')!.textContent!));
    expect([...prefs].sort((a, b) => b - a)).toEqual(prefs);
    expect($(el, '.others').hidden).toBe(true);
  });

  it('the visits are red when Red is to move: red is the Red side', async () => {
    const el = await mount('puzzle5');
    expect(PUZZLE5.to_move).toBe('Red');
    expect($(el, '.search').dataset.side).toBe('red');
    const css = readFileSync('src/elements/pogo-search.css', 'utf8');
    expect(css).toMatch(/\.search\[data-side='red'\] \.visits \.bar \{\s*background: var\(--_red\);/);
    expect(css).toMatch(/\.visits \.bar \{\s*background: var\(--_ink\);/);
  });

  it('ends on the fixture’s visits, and plays bestMove on the board', async () => {
    const el = await mount('puzzle5', 'en');
    await ran(el);
    // Reduced motion: the first simulation's path, then the reader steps to the end.
    expect($(el, '[data-role="counter"]').textContent).toBe('1 simulation of 100');
    expect(frame(el)).toBe('path');
    toEnd(el);
    expect(frame(el)).toBe('end');
    expect($(el, '[data-role="counter"]').textContent).toBe('100 simulations of 100');
    const shown = visits(el);
    puzzle.legal.forEach(([a, n, c], i) => expect(shown.get(moveName([a!, n!, c!]))).toBe(puzzle.visits[i]));
    const played = $(el, 'tr.played').dataset.move;
    expect(played).toBe(moveName(bestMove(emitted.at(-1)!)));
    expect(played).toBe('b2-3-b1');
    expect($(el, 'tr.played .tag').textContent).toBe(' played');
    // The board shows the position after it: b2's three pieces landed on b1.
    expect($(el, '.board-slot .to').getAttribute('data-cell')).toBe('1');
    expect(shownText($(el, '.said-now'))).toBe('After 100 simulations, it plays the most visited move: b2-3-b1. The net alone preferred b2-2-a3.');
  });

  it('every frame’s rows are the snapshot search() emitted for it', async () => {
    const el = await mount('puzzle5', 'en');
    await ran(el);
    const frames = searchScript({ sim: 0, root: emitted[0]!.root.map((r) => ({ ...r, visits: 0, meanValue: 0 })) }, emitted, traced);
    role(el, 'previous').click();
    for (let i = 0; i < frames.length; i++) {
      if (i > 0) role(el, 'next').click();
      const f = frames[i]!;
      expect(frame(el)).toBe(f.kind);
      const shown = visits(el);
      for (const r of f.snap.root) expect(shown.get(moveName(r.move))).toBe(r.visits);
    }
  });

  it('a slowed simulation: the root move’s arrow, the path under the board, the note at the leaf, then its row', async () => {
    const el = await mount('puzzle5', 'fr');
    await ran(el);
    const first = traced[0]!;
    // Its path: the arrow on the board, from the root move's square, and its moves named under it.
    expect(frame(el)).toBe('path');
    expect($$(el, '.board-slot .path-arrow')).toHaveLength(1);
    expect($$(el, '.path .step').map((s) => s.textContent)).toEqual(first.moves.map(moveName));
    role(el, 'next').click();
    // Its leaf: the board at the position it stopped on, the note brought back.
    expect(frame(el)).toBe('leaf');
    expect($(el, '.path').dataset.stage).toBe('leaf');
    expect($(el, '.chip .note-value').textContent).toBe(signedNote('fr', first.value));
    expect($(el, '.leaf-tag').textContent).toBe('jamais simulée');
    expect($(el, '.board-slot .to').getAttribute('data-cell')).toBe(String(first.moves.at(-1)!.to_cell));
    role(el, 'next').click();
    // The way back: its root move's row counts the visit, takes the note, and is marked fresh.
    expect(frame(el)).toBe('back');
    const row = $(el, `tr[data-move="${moveName(first.moves[0]!)}"]`);
    expect(row.hasAttribute('data-fresh')).toBe(true);
    expect(row.querySelector('.visits .value')!.textContent).toBe('1');
    expect(row.querySelector('.mean')!.textContent).toBe(signedNote('fr', first.value));
  });

  it('the deep simulation walks a path of several moves to a finished game', async () => {
    const el = await mount('puzzle5', 'fr');
    await ran(el);
    while (!(frame(el) === 'path' && $$(el, '.path .step').length > 1)) role(el, 'next').click();
    expect($(el, '[data-role="counter"]').textContent).toBe('36 simulations sur 100');
    expect($$(el, '.path .step').map((s) => s.textContent)).toEqual(['b2-3-b1', 'c2-1-b2', 'b3-1-a3', 'b2-1-b1', 'a3-3-b1']);
    role(el, 'next').click();
    expect($(el, '.leaf-tag').textContent).toBe('partie finie');
    expect($(el, '.chip .note-value').textContent).toBe('+1,00');
  });

  it('under reduced motion it never advances by itself', async () => {
    const el = await mount('puzzle5', 'en');
    await ran(el);
    await new Promise((r) => setTimeout(r, 1300));
    expect($(el, '[data-role="counter"]').textContent).toBe('1 simulation of 100');
    expect(playState(el)).toBe('play');
  });

  it('plays every frame by itself when motion is allowed, its holds adding up to the whole play', async () => {
    setMedia(REDUCED_MOTION, false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const el = await mount('puzzle5', 'en');
    await ran(el);
    const frames = searchScript({ sim: 0, root: emitted[0]!.root.map((r) => ({ ...r, visits: 0, meanValue: 0 })) }, emitted, traced);
    const total = frames.reduce((a, _, i) => a + frameHold(frames, i), 0);
    await vi.advanceTimersByTimeAsync(total + 500);
    expect($(el, '[data-role="counter"]').textContent).toBe('100 simulations of 100');
    expect(frame(el)).toBe('end');
    expect(playState(el)).toBe('replay');
  });

  it('a search still running at disconnect is aborted', async () => {
    let seen: AbortSignal | undefined;
    let sims = 0;
    use(makeStore(), (s, net, o) => {
      seen = o.signal;
      return search(s, net, { sims: 100, batch: 1, signal: o.signal, onTrace: o.onTrace, onSnapshot: (x) => ((sims = x.sim), o.onSnapshot(x)) });
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

  it('« Jouer cette position » hands the searched position to the store', async () => {
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
    await ran(el);
    toEnd(el);
    const fromRust = await search(s.current()!.states[1]!, az);
    const shown = visits(el);
    for (const r of fromRust.root) if (shown.has(moveName(r.move))) expect(shown.get(moveName(r.move))).toBe(r.visits);
  });
});

describe('shownRows', () => {
  const snap = (n: number, visitsOf: (i: number) => number = () => 0): SearchSnapshot => ({
    sim: 0,
    root: Array.from({ length: n }, (_, i) => ({ move: { from_cell: 0, num_pieces: 1, to_cell: i % 9 }, prior: (n - i) / 1000, visits: visitsOf(i), meanValue: 0 })),
  });

  it('shows every move up to MAX_ROWS, in the net’s order', () => {
    expect(MAX_ROWS).toBe(15);
    expect(shownRows(snap(15), null)).toEqual([...Array(15).keys()]);
  });

  it('past MAX_ROWS, the net’s preferred ones and the move played in the end, however low the net ranked it', () => {
    const before = snap(20);
    const last = snap(20, (i) => (i === 19 ? 90 : 0));
    const rows = shownRows(before, last);
    expect(rows).toHaveLength(MAX_ROWS);
    expect(rows.slice(0, 14)).toEqual([...Array(14).keys()]);
    expect(rows.at(-1)).toBe(19);
    expect(shownRows(before, snap(20, (i) => (i === 3 ? 90 : 0)))).toEqual([...Array(15).keys()]);
  });

  it('the moves left out are summed in one line, in the reader’s language', async () => {
    expect(formatShare('fr', 0.028)).toBe('2,8 %');
  });
});
