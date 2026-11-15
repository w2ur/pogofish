import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legal, type State, type Triple } from './engine';
import { search, type SearchSnapshot } from './mcts';
import { parseAz, policyIndex, type AzNet } from './nets';

// Paths anchor on the working directory (figures/), as in test-setup.ts.
const read = (path: string): Buffer => readFileSync(resolve(process.cwd(), path));
const bytes = (path: string): ArrayBuffer => {
  const b = read(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

interface Position {
  label: string;
  state: State;
  legal: Triple[];
  /** Rust visits after 100 simulations, no noise, lc1-2; empty when no move is legal. */
  visits: number[];
}

const reference = JSON.parse(read('fixtures/reference.json').toString()) as {
  simulations: number;
  rules: string;
  positions: Position[];
};
const az = parseAz(bytes('public/nets/az-lc1-s1.pfw'));
const triple = (m: { from_cell: number; num_pieces: number; to_cell: number }): Triple => [
  m.from_cell,
  m.num_pieces,
  m.to_cell,
];
const visitsOf = (snap: SearchSnapshot): number[] => snap.root.map((r) => r.visits);
const puzzle = reference.positions.find((p) => p.label === 'puzzle 5')!;

describe('search against the Rust reference', () => {
  it('the fixture was searched with 100 simulations under lc1-2', () => {
    expect(reference.simulations).toBe(100);
    expect(reference.rules).toBe('lc1-2');
    expect(reference.positions).toHaveLength(51);
  });

  it('visits equal Rust on every fixture position', async () => {
    for (const p of reference.positions) {
      const snap = await search(p.state, az);
      expect(snap.sim, p.label).toBe(100);
      expect(visitsOf(snap), p.label).toEqual(p.visits);
    }
  }, 60_000);

  it('puzzle 5 visits equal the Rust fixture', async () => {
    expect(puzzle.visits.reduce((a, b) => a + b, 0)).toBe(100);
    const snap = await search(puzzle.state, az);
    expect(visitsOf(snap)).toEqual(puzzle.visits);
  });

  it('root rows follow the order of legal(s), with the net priors', async () => {
    const snap = await search(puzzle.state, az, { sims: 20 });
    const moves = legal(puzzle.state);
    expect(snap.root.map((r) => triple(r.move))).toEqual(moves.map(triple));
    const total = snap.root.reduce((a, r) => a + r.prior, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-5);
  });

  it('meanValue is in [-1, 1], and 0 for an unvisited move', async () => {
    const snap = await search(puzzle.state, az, { sims: 20 });
    for (const r of snap.root) {
      expect(Math.abs(r.meanValue)).toBeLessThanOrEqual(1);
      if (r.visits === 0) expect(r.meanValue).toBe(0);
    }
  });

  it('among equal scores the first move in legal order is chosen, as mcts.rs', async () => {
    // Uniform priors and a value of 0 tie every edge at the first simulation.
    const flat: AzNet = {
      header: az.header,
      evaluate: (s) => {
        const keys = legal(s).map(policyIndex);
        return {
          logits: new Float32Array(243),
          priors: new Map(keys.map((k) => [k, Math.fround(1 / keys.length)])),
          value: 0,
        };
      },
    };
    const snap = await search(puzzle.state, flat, { sims: 1 });
    expect(visitsOf(snap)).toEqual(snap.root.map((_, i) => (i === 0 ? 1 : 0)));
  });

  it('a position with no legal move has an empty root', async () => {
    const end = reference.positions.find((p) => p.visits.length === 0)!;
    const snap = await search(end.state, az, { sims: 5 });
    expect(snap).toEqual({ sim: 5, root: [] });
  });
});

describe('search as a process', () => {
  it('onSnapshot sees sim 1, 2, … , 100 in order', async () => {
    const seen: number[] = [];
    const totals: number[] = [];
    const final = await search(puzzle.state, az, {
      onSnapshot: (s) => {
        seen.push(s.sim);
        totals.push(s.root.reduce((a, r) => a + r.visits, 0));
      },
    });
    expect(seen).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(totals).toEqual(seen);
    expect(final.sim).toBe(100);
  });

  it('search yields between batches', async () => {
    let ranAt: number | undefined;
    let sim = 0;
    setTimeout(() => {
      ranAt = sim;
    }, 0);
    await search(puzzle.state, az, { sims: 30, batch: 10, onSnapshot: (s) => (sim = s.sim) });
    expect(ranAt).toBe(10);
  });

  it('aborting stops before the next batch', async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    const run = search(puzzle.state, az, {
      batch: 10,
      signal: controller.signal,
      onSnapshot: (s) => {
        seen.push(s.sim);
        if (s.sim === 3) controller.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen.at(-1)).toBe(10);
  });

  it('a signal aborted before the search rejects without simulating', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const run = search(puzzle.state, az, { signal: controller.signal, onSnapshot: () => calls++ });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(0);
  });
});
