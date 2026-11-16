import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { key, type State } from '../engine';
import { search, type SearchSnapshot } from '../mcts';
import { parseAz } from '../nets';
import { C_PUCT } from '../search-handler';
import { PUZZLE5, SEARCH_SIMS, STOPS, recordSearch, rowOrder } from './search-steps';

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as {
  simulations: number;
  puzzle: { number: number };
  positions: { label: string; state: State; visits: number[]; priors: number[] }[];
};
const b = readFileSync(resolve(process.cwd(), 'public/nets/az-lc1-s1.pfw'));
const az = parseAz(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const puzzle = fixture.positions.find((p) => p.label === 'puzzle 5')!;

describe('the search, step by step', () => {
  it('puzzle 5 is the fixture’s', () => {
    expect(fixture.puzzle.number).toBe(5);
    expect(PUZZLE5).toEqual(puzzle.state);
    expect(key(PUZZLE5)).toBe(key(puzzle.state));
  });

  it('stops after 1, 2, 3, 5, 10, 20, 50 and 100 simulations, the fixture’s count last', () => {
    expect(STOPS).toEqual([1, 2, 3, 5, 10, 20, 50, 100]);
    expect(SEARCH_SIMS).toBe(fixture.simulations);
  });

  it('the snapshots kept are the ones search() emits at the stops, and puzzle 5 ends on the fixture’s visits', async () => {
    const emitted: SearchSnapshot[] = [];
    const run = (o: { onSnapshot: (s: SearchSnapshot) => void; signal: AbortSignal }) =>
      search(PUZZLE5, az, {
        sims: SEARCH_SIMS,
        cPuct: C_PUCT,
        signal: o.signal,
        onSnapshot: (s) => {
          emitted.push(s);
          o.onSnapshot(s);
        },
      });
    const kept = await recordSearch(run, new AbortController().signal);
    expect(kept.map((s) => s.sim)).toEqual([...STOPS]);
    kept.forEach((s) => expect(s).toEqual(emitted[s.sim - 1]));
    expect(kept.at(-1)!.root.map((r) => r.visits)).toEqual(puzzle.visits);
  });

  it('an aborted signal stops a running search', async () => {
    const controller = new AbortController();
    const seen = vi.fn();
    const run = (o: { onSnapshot: (s: SearchSnapshot) => void; signal: AbortSignal }) =>
      search(PUZZLE5, az, { sims: SEARCH_SIMS, batch: 1, signal: o.signal, onSnapshot: (s) => (seen(s.sim), o.onSnapshot(s)) });
    const pending = recordSearch(run, controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const count = seen.mock.calls.length;
    expect(count).toBeLessThan(SEARCH_SIMS);
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.mock.calls.length).toBe(count);
  });

  it('rows keep one order, the net’s preference first, through every step', () => {
    const snap: SearchSnapshot = { sim: 1, root: puzzle.priors.map((p, i) => ({ move: { from_cell: i, num_pieces: 1, to_cell: 0 }, prior: p, visits: 0, meanValue: 0 })) };
    const order = rowOrder(snap);
    for (let i = 1; i < order.length; i++) expect(puzzle.priors[order[i - 1]!]!).toBeGreaterThanOrEqual(puzzle.priors[order[i]!]!);
    expect([...order].sort((a, b) => a - b)).toEqual(puzzle.priors.map((_, i) => i));
  });
});
