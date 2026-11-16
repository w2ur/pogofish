// What the production search path of <pogo-search> hands search(): the
// fixture's simulations, AlphaZero's exploration constant and the board's
// rules. The other tests swap deps.search for a spy that calls search()
// itself, so they cannot see a changed default; this file spies on mcts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LC1_2 } from '../engine';
import { search } from '../mcts';
import { parseAz } from '../nets';
import { createStore } from '../store';
import { intersect, setMedia, REDUCED_MOTION } from '../test-dom';
import { PogoSearch } from './pogo-search';
import { PUZZLE5 } from './search-steps';

vi.mock('../mcts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mcts')>();
  return { ...actual, search: vi.fn(actual.search) };
});

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as { simulations: number; rules: string };
const b = readFileSync(resolve(process.cwd(), 'public/nets/az-lc1-s1.pfw'));
const az = parseAz(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);

customElements.define('pogo-search', PogoSearch);
// The search stays the production one; only the game and the net are given.
PogoSearch.deps = { ...PogoSearch.deps, store: createStore({ storage: null, loadEngine: () => Promise.resolve() }), az: () => Promise.resolve(az) };

describe('<pogo-search>, production search path', () => {
  it('hands search() the fixture’s simulations, cPuct 1.5 and the lc1-2 rules', async () => {
    setMedia(REDUCED_MOTION, true);
    const el = document.createElement('pogo-search');
    el.setAttribute('position', 'puzzle5');
    document.body.append(el);
    intersect(el);
    for (let i = 0; i < 20 && !el.shadowRoot?.querySelector('[data-role="run"]'); i++) await new Promise((r) => setTimeout(r, 0));
    (el.shadowRoot!.querySelector('[data-role="run"]') as HTMLButtonElement).click();
    for (let i = 0; i < 200 && !el.shadowRoot!.querySelector('[data-role="counter"]'); i++) await new Promise((r) => setTimeout(r, 5));
    const spy = vi.mocked(search);
    expect(spy).toHaveBeenCalledTimes(1);
    const [state, net, options] = spy.mock.calls[0]!;
    expect(state).toEqual(PUZZLE5);
    expect(net).toBe(az);
    expect(fixture.rules).toBe('lc1-2');
    expect(options).toMatchObject({ sims: fixture.simulations, cPuct: 1.5, rules: LC1_2 });
  });
});
