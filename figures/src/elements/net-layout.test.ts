import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { NetHeader } from '../nets';
import { netGraph } from './net-graph';
import { MIN_PITCH, layoutNet, nodeAt } from './net-layout';

const TD: NetHeader = {
  features: 'x',
  weights: 0,
  layers: [
    { name: 'td_fc0', inputs: 127, outputs: 128 },
    { name: 'td_fc1', inputs: 128, outputs: 64 },
    { name: 'td_out', inputs: 64, outputs: 1 },
  ],
};
const AZ: NetHeader = {
  features: 'x',
  weights: 0,
  layers: [
    { name: 'fc0', inputs: 127, outputs: 256 },
    { name: 'fc1', inputs: 256, outputs: 128 },
    { name: 'policy_fc1', inputs: 128, outputs: 128 },
    { name: 'policy_fc2', inputs: 128, outputs: 243 },
    { name: 'value_fc1', inputs: 128, outputs: 128 },
    { name: 'value_fc2', inputs: 128, outputs: 1 },
  ],
};

describe('the net’s layout', () => {
  it('gives every unit of every layer a place of its own, inside the canvas', () => {
    for (const [header, w, h] of [[TD, 600, 440], [AZ, 600, 440], [AZ, 288, 400], [TD, 288, 400]] as const) {
      const g = netGraph(header);
      const l = layoutNet(g, w, h);
      l.columns.forEach((c, k) => {
        expect(c.x).toHaveLength(g.columns[k]!.units);
        const seen = new Set<string>();
        for (let i = 0; i < c.x.length; i++) {
          expect(c.x[i]).toBeGreaterThanOrEqual(0);
          expect(c.x[i]).toBeLessThanOrEqual(w);
          expect(c.y[i]).toBeGreaterThanOrEqual(c.top);
          expect(c.y[i]).toBeLessThanOrEqual(c.bottom);
          seen.add(`${c.x[i]!.toFixed(2)} ${c.y[i]!.toFixed(2)}`);
        }
        expect(seen.size).toBe(c.x.length);
      });
    }
  });

  it('folds a column too long for its height into sub-columns, never closer than the least pitch', () => {
    const l = layoutNet(netGraph(AZ), 600, 440);
    const wide = l.columns[1]!;
    expect(wide.sub).toBeGreaterThan(1);
    expect(wide.rows * wide.sub).toBeGreaterThanOrEqual(256);
    for (const c of l.columns) if (c.x.length > 1) expect(c.pitch).toBeGreaterThanOrEqual(MIN_PITCH);
    expect(l.columns[0]!.sub).toBe(1);
  });

  it('ranks run left to right, and the two heads share the last ranks: preferences above, value below', () => {
    const g = netGraph(AZ);
    const l = layoutNet(g, 600, 440);
    expect(l.columns[0]!.cx).toBeLessThan(l.columns[1]!.cx);
    expect(l.columns[3]!.cx).toBe(l.columns[5]!.cx);
    expect(l.columns[4]!.cx).toBe(l.columns[6]!.cx);
    expect(l.columns[3]!.bottom).toBeLessThan(l.columns[5]!.top);
    // The one output sits in the middle of its band.
    const out = l.columns[6]!;
    expect(out.y[0]).toBeCloseTo((out.top + out.bottom) / 2, 4);
  });

  it('finds the node under a point: each node answers at its own centre (property), and empty room answers nothing', () => {
    const g = netGraph(AZ);
    const l = layoutNet(g, 640, 440);
    fc.assert(
      fc.property(fc.nat(g.columns.length - 1), fc.nat(), (column, pick) => {
        const node = pick % g.columns[column]!.units;
        const c = l.columns[column]!;
        expect(nodeAt(l, c.x[node]!, c.y[node]!)).toEqual({ column, node });
      }),
      { numRuns: 200 },
    );
    const between = (l.columns[0]!.cx + l.columns[1]!.cx) / 2;
    expect(nodeAt(l, between, 200)).toBeNull();
  });
});
