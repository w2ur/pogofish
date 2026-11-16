import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legal, moveName, type State } from '../engine';
import { parseAz, parseTd, policyIndex } from '../nets';
import { azReadout } from './net-readout';

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as {
  positions: { label: string; state: State; features: number[]; az: { value: number }; td: number; legal: number[][]; priors: number[] }[];
};
const bytes = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const az = parseAz(bytes('az-lc1-s1.pfw'));
const td = parseTd(bytes('td-s1.pfv'));

describe('what <pogo-net kind="az"> reads off the net', () => {
  it('shows the fixture’s priors and value for every fixture position', () => {
    for (const p of fixture.positions) {
      const r = azReadout(az, p.state, policyIndex);
      const byName = new Map(r.rows.map((row) => [row.name, row.prior]));
      expect(r.rows).toHaveLength(p.legal.length);
      // The tolerances of nets.test.ts: the softmax's exp differs from Rust's in the last bits.
      p.legal.forEach((m, i) => expect(Math.abs(byName.get(moveName(m as [number, number, number]))! - p.priors[i]!)).toBeLessThanOrEqual(1e-6));
      expect(Math.abs(r.value - p.az.value)).toBeLessThanOrEqual(1e-5);
      expect(r.actions).toBe(243);
    }
  });

  it('lists the legal moves by preference, the strongest first, ties in engine order', () => {
    const p = fixture.positions.find((x) => x.label === 'openingWin ply 3')!;
    const r = azReadout(az, p.state, policyIndex);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i - 1]!.prior).toBeGreaterThanOrEqual(r.rows[i]!.prior);
    expect(r.rows.reduce((a, row) => a + row.prior, 0)).toBeCloseTo(1, 5);
    expect(new Set(r.rows.map((row) => row.name))).toEqual(new Set(legal(p.state).map(moveName)));
  });

  it('the TD net’s value is the fixture’s', () => {
    for (const p of fixture.positions) expect(Math.abs(td.value(p.state) - p.td)).toBeLessThanOrEqual(1e-5);
  });
});
