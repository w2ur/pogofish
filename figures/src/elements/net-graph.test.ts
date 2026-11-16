import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAz, parseTd, policyIndex } from '../nets';
import { legal } from '../engine';
import { defaultPosition } from './net-position';
import { netGraph, signal, strongestLinks } from './net-graph';

const bytes = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const az = parseAz(bytes('az-lc1-s1.pfw'));
const td = parseTd(bytes('td-s1.pfv'));

describe('the net as a graph', () => {
  it('TD: a chain of columns read from the header, 127 → 128 → 64 → 1', () => {
    const g = netGraph(td.header);
    expect(g.columns.map((c) => [c.role, c.units, c.rank])).toEqual([
      ['input', 127, 0],
      ['hidden', 128, 1],
      ['hidden', 64, 2],
      ['value', 1, 3],
    ]);
    expect(g.layers).toEqual([
      { layer: 0, from: 0, to: 1 },
      { layer: 1, from: 1, to: 2 },
      { layer: 2, from: 2, to: 3 },
    ]);
    expect(g.ranks).toBe(3);
    expect(g.links).toBe(127 * 128 + 128 * 64 + 64);
  });

  it('AlphaZero: a trunk, then two heads fed by its last layer: 243 preferences and one value', () => {
    const g = netGraph(az.header);
    expect(g.columns.map((c) => [c.role, c.band, c.units, c.rank])).toEqual([
      ['input', 'full', 127, 0],
      ['hidden', 'full', 256, 1],
      ['hidden', 'full', 128, 2],
      ['hidden', 'policy', 128, 3],
      ['policy', 'policy', 243, 4],
      ['hidden', 'value', 128, 3],
      ['value', 'value', 1, 4],
    ]);
    // Both heads start from the trunk's last column.
    expect(g.layers.filter((l) => l.from === 2).map((l) => l.to)).toEqual([3, 5]);
    expect(g.links).toBe(az.header.layers.reduce((n, l) => n + l.inputs * l.outputs, 0));
  });

  it('a doctored header draws other sizes, and one that does not chain is refused', () => {
    const g = netGraph({ features: 'x', weights: 0, layers: [{ name: 'td_fc0', inputs: 127, outputs: 200 }, { name: 'td_out', inputs: 200, outputs: 1 }] });
    expect(g.columns.map((c) => c.units)).toEqual([127, 200, 1]);
    expect(() => netGraph({ features: 'x', weights: 0, layers: [{ name: 'td_fc0', inputs: 127, outputs: 200 }, { name: 'td_out', inputs: 64, outputs: 1 }] })).toThrow(/takes 64 inputs/);
  });
});

describe('the strongest links', () => {
  const layer = { name: 'l', inputs: 4, outputs: 2, weight: Float32Array.of(1, -3, 2, 0.5, 0, 0, 5, 1), bias: Float32Array.of(0, 0) };

  it('keeps, for each neuron, the k links that carried most, by |weight × activation|, strongest first', () => {
    const d = strongestLinks(layer, [1, 1, 0, 4], 2);
    // Neuron 0: −3×1, 0.5×4 = 2, then 1×1; the input at 0 carries nothing. Neuron 1: 1×4 only.
    expect([...d.from]).toEqual([1, 3, 3]);
    expect([...d.to]).toEqual([0, 0, 1]);
    expect([...d.carried]).toEqual([-3, 2, 4]);
    expect(d.count).toBe(3);
    expect(d.max).toBe(4);
  });

  it('draws only the neurons asked for', () => {
    const d = strongestLinks(layer, [1, 1, 1, 1], 1, [1]);
    expect([[...d.from], [...d.to], [...d.carried]]).toEqual([[2], [1], [5]]);
  });

  it('on the real net, each neuron’s drawn links are exactly its strongest (checked against a full sort)', () => {
    const acts = td.forward(defaultPosition());
    const k = 6;
    const l = td.layers[1]!;
    const d = strongestLinks(l, acts[1]!, k);
    for (let j = 0; j < l.outputs; j++) {
      const all = Array.from({ length: l.inputs }, (_, i) => ({ i, c: l.weight[j * l.inputs + i]! * acts[1]![i]! }))
        .filter((x) => x.c !== 0)
        .sort((a, b) => Math.abs(b.c) - Math.abs(a.c) || a.i - b.i)
        .slice(0, k);
      const mine = [...d.to].flatMap((to, n) => (to === j ? [{ i: d.from[n]!, c: d.carried[n]! }] : []));
      expect(mine.map((x) => x.i)).toEqual(all.map((x) => x.i));
      mine.forEach((x, n) => expect(x.c).toBeCloseTo(all[n]!.c, 6));
    }
  });
});

describe('the signal of one position', () => {
  it('TD: each column carries its real activations, the last the value, and the links drawn are counted', () => {
    const s = defaultPosition();
    const g = netGraph(td.header);
    const acts = td.forward(s);
    const sig = signal(td, g, acts, 6);
    expect(sig.values.map((v) => v.length)).toEqual([127, 128, 64, 1]);
    expect(sig.values[3]![0]).toBe(td.value(s));
    expect(sig.drawn).toBe(sig.links.reduce((n, l) => n + l.count, 0));
    expect(sig.drawn).toBeLessThanOrEqual((128 + 64 + 1) * 6);
    expect(sig.drawn).toBeGreaterThan(0);
    // A hidden column's scale is its strongest neuron.
    expect(sig.scale[1]).toBe(Math.max(...acts[1]!));
    expect([sig.scale[0], sig.scale[3]]).toEqual([1, 1]);
  });

  it('AlphaZero: the policy column shows each legal move’s share and nothing for an illegal one; only legal moves get links', () => {
    const s = defaultPosition();
    const g = netGraph(az.header);
    const out = az.evaluate(s);
    const sig = signal(az, g, az.forward(s), 6, out.priors);
    const policy = sig.values[4]!;
    const legalIndexes = legal(s).map(policyIndex);
    expect(policy).toHaveLength(243);
    let sum = 0;
    policy.forEach((share, i) => {
      if (legalIndexes.includes(i)) expect(share).toBe(out.priors.get(i));
      else expect(share).toBe(0);
      sum += share;
    });
    expect(sum).toBeCloseTo(1, 5);
    const intoPolicy = sig.links[g.layers.findIndex((l) => l.to === 4)]!;
    expect([...new Set(intoPolicy.to)].sort((a, b) => a - b)).toEqual([...legalIndexes].sort((a, b) => a - b));
    expect(sig.values[6]![0]).toBe(out.value);
  });
});
