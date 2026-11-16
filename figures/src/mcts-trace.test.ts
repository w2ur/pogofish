// What search() reports of each simulation when asked (`onTrace`): the moves
// the simulation followed from the root, how it stopped, and the value it
// brought back. <pogo-search> draws the first simulations from it, so each
// fact it states is checked against the snapshots the same search emits.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LC1_2, legal, play, terminal, type Move, type State } from './engine';
import { search, type SearchSnapshot, type SimulationTrace } from './mcts';
import { parseAz } from './nets';
import { PUZZLE5 } from './elements/search-steps';

const b = readFileSync(resolve(process.cwd(), 'public/nets/az-lc1-s1.pfw'));
const az = parseAz(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const same = (a: Move, b: Move): boolean => a.from_cell === b.from_cell && a.num_pieces === b.num_pieces && a.to_cell === b.to_cell;

async function traced(s: State, sims = 100): Promise<{ traces: SimulationTrace[]; snaps: SearchSnapshot[] }> {
  const traces: SimulationTrace[] = [];
  const snaps: SearchSnapshot[] = [];
  await search(s, az, { sims, cPuct: 1.5, onTrace: (t) => traces.push(t), onSnapshot: (x) => snaps.push(x) });
  return { traces, snaps };
}

describe('search() traces', () => {
  it('reports one trace per simulation, numbered, before its snapshot', async () => {
    const order: string[] = [];
    await search(PUZZLE5, az, { sims: 3, onTrace: (t) => order.push(`t${t.sim}`), onSnapshot: (s) => order.push(`s${s.sim}`) });
    expect(order).toEqual(['t1', 's1', 't2', 's2', 't3', 's3']);
  });

  it('each path is legal from the root, and its first move is the root row whose visits went up by one', async () => {
    const { traces, snaps } = await traced(PUZZLE5);
    traces.forEach((t, i) => {
      let s = PUZZLE5;
      for (const m of t.moves) {
        expect(legal(s).some((x) => same(x, m))).toBe(true);
        s = play(s, m);
      }
      const before = i === 0 ? null : snaps[i - 1]!;
      const after = snaps[i]!;
      const grew = after.root.filter((r, k) => r.visits !== (before ? before.root[k]!.visits : 0));
      expect(grew).toHaveLength(1);
      expect(same(grew[0]!.move, t.moves[0]!)).toBe(true);
      expect(t.leaf === 'end').toBe(terminal(s, LC1_2));
    });
  });

  it('the value brought back is what the root move’s mean took in', async () => {
    const { traces, snaps } = await traced(PUZZLE5, 20);
    traces.forEach((t, i) => {
      const k = snaps[i]!.root.findIndex((r) => same(r.move, t.moves[0]!));
      const after = snaps[i]!.root[k]!;
      const before = i === 0 ? { visits: 0, meanValue: 0 } : snaps[i - 1]!.root[k]!;
      const sum = before.meanValue * before.visits + t.value;
      expect(after.meanValue).toBeCloseTo(sum / after.visits, 5);
    });
  });

  it('the first simulation follows the move the net prefers', async () => {
    const { traces, snaps } = await traced(PUZZLE5, 1);
    const top = [...snaps[0]!.root].sort((a, b) => b.prior - a.prior)[0]!;
    expect(same(traces[0]!.moves[0]!, top.move)).toBe(true);
  });

  it('asking for traces leaves the search unchanged', async () => {
    const plain = await search(PUZZLE5, az, { sims: 100 });
    const { snaps } = await traced(PUZZLE5);
    expect(snaps.at(-1)).toEqual(plain);
  });
});
