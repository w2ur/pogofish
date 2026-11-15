import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LC1_2, features, legal, replay, terminal, winner, type State, type Triple } from './engine';
import { parseAz, parseTd, policyIndex } from './nets';

// Paths anchor on the working directory (figures/), as in test-setup.ts.
const read = (path: string): Buffer => readFileSync(resolve(process.cwd(), path));
const bytes = (path: string): ArrayBuffer => {
  const b = read(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

interface Position {
  label: string;
  state: State;
  features: number[];
  az: { logits: number[]; value: number };
  td: number;
  legal: Triple[];
  priors: number[];
}

interface Reference {
  positions: Position[];
  openingWin: { first: number; outcome: number; lambda: number; returns: number[] };
}

const reference = JSON.parse(read('fixtures/reference.json').toString()) as Reference;
const lines = JSON.parse(read('fixtures/lines.json').toString()) as { openingWin: Triple[] };
const az = parseAz(bytes('public/nets/az-lc1-s1.pfw'));
const td = parseTd(bytes('public/nets/td-s1.pfv'));

const TOLERANCE = 1e-5;

describe('nets against the Rust reference', () => {
  it('the fixture covers playouts, the openingWin line and the puzzle', () => {
    const labels = reference.positions.map((p) => p.label);
    expect(labels.filter((l) => l.startsWith('playout'))).toHaveLength(40);
    expect(labels.filter((l) => l.startsWith('openingWin'))).toHaveLength(10);
    expect(labels).toContain('puzzle 5');
  });

  it('no position appears twice', () => {
    const states = reference.positions.map((p) => JSON.stringify(p.state));
    expect(new Set(states).size).toBe(states.length);
  });

  it('features(state) equal the Rust features exactly on every fixture position', () => {
    for (const p of reference.positions) {
      // The fixture writes each f32 in its shortest form; fround recovers it exactly.
      expect(Array.from(features(p.state)), p.label).toEqual(p.features.map(Math.fround));
    }
  });

  it('the engine lists the same legal moves as the fixture, in the same order', () => {
    for (const p of reference.positions) {
      expect(legal(p.state).map((m) => [m.from_cell, m.num_pieces, m.to_cell]), p.label).toEqual(p.legal);
    }
  });

  it('az logits equal Rust within 1e-5 on every fixture position', () => {
    for (const p of reference.positions) {
      const { logits } = az.evaluate(p.state);
      expect(logits).toHaveLength(243);
      logits.forEach((x, i) => expect(Math.abs(x - p.az.logits[i]!), `${p.label} [${i}]`).toBeLessThanOrEqual(TOLERANCE));
    }
  });

  it('az value equal within 1e-5', () => {
    for (const p of reference.positions) {
      expect(Math.abs(az.evaluate(p.state).value - p.az.value), p.label).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it('td value equal within 1e-5', () => {
    for (const p of reference.positions) {
      expect(Math.abs(td.value(p.state) - p.td), p.label).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it('az priors equal the Rust priors within 1e-6, keyed by policy index', () => {
    for (const p of reference.positions) {
      const { priors } = az.evaluate(p.state);
      const keys = p.legal.map(([from_cell, n, to_cell]) =>
        policyIndex({ from_cell, num_pieces: n as 1 | 2 | 3, to_cell }),
      );
      expect([...priors.keys()].sort((a, b) => a - b), p.label).toEqual([...keys].sort((a, b) => a - b));
      expect(p.priors, p.label).toHaveLength(keys.length);
      keys.forEach((k, i) =>
        expect(Math.abs(priors.get(k)! - p.priors[i]!), `${p.label} [${i}]`).toBeLessThanOrEqual(1e-6),
      );
    }
  });

  it('header weight counts are 130164 (az) and 24705 (td)', () => {
    expect(az.header.weights).toBe(130164);
    expect(td.header.weights).toBe(24705);
    expect(az.header.features).toBe('mover-relative-repetition');
    expect(td.header.layers.map((l) => l.name)).toEqual(['td_fc0', 'td_fc1', 'td_out']);
  });

  it('a truncated file is refused with an error naming the missing bytes', () => {
    const full = bytes('public/nets/td-s1.pfv');
    expect(() => parseTd(full.slice(0, full.byteLength - 4))).toThrow(/td_out.*4 bytes missing/);
    const pfw = bytes('public/nets/az-lc1-s1.pfw');
    expect(() => parseAz(pfw.slice(0, pfw.byteLength - 10))).toThrow(/value_fc2.*10 bytes missing/);
  });

  it('a header without a layers array is refused', () => {
    const header = (magic: string): ArrayBuffer =>
      new TextEncoder().encode(`${magic}\n{"features":"mover-relative-repetition"}\n`).buffer as ArrayBuffer;
    expect(() => parseAz(header('PFW1'))).toThrow(/^pogo-figures: .*layers/);
    expect(() => parseTd(header('PFV1'))).toThrow(/^pogo-figures: .*layers/);
  });

  it('a file of the other kind, or with trailing bytes, is refused', () => {
    const pfw = bytes('public/nets/az-lc1-s1.pfw');
    expect(() => parseTd(pfw)).toThrow(/PFV1/);
    const longer = new Uint8Array(pfw.byteLength + 4);
    longer.set(new Uint8Array(pfw));
    expect(() => parseAz(longer.buffer)).toThrow(/4 unexpected bytes/);
  });

  it('policyIndex is from*27 + (n-1)*9 + to', () => {
    expect(policyIndex({ from_cell: 0, num_pieces: 1, to_cell: 0 })).toBe(0);
    expect(policyIndex({ from_cell: 8, num_pieces: 3, to_cell: 8 })).toBe(242);
    expect(policyIndex({ from_cell: 2, num_pieces: 2, to_cell: 1 })).toBe(64);
  });
});

describe('the openingWin line', () => {
  const states = replay(lines.openingWin);

  it('is 9 plies, ends the game and nothing earlier does, White wins in game A', () => {
    expect(lines.openingWin).toHaveLength(9);
    states.slice(0, -1).forEach((s, i) => expect(terminal(s, null), `ply ${i}`).toBe(false));
    expect(terminal(states[9]!, null)).toBe(true);
    expect(winner(states[9]!, null)).toBe('W');
  });

  it('gives the same verdict under lc1-2', () => {
    states.slice(0, -1).forEach((s, i) => expect(terminal(s, LC1_2), `ply ${i}`).toBe(false));
    expect(winner(states[9]!, LC1_2)).toBe('W');
  });

  it('the Rust lambda-returns follow from the positions\' TD values and the outcome', () => {
    const { first, outcome, lambda, returns } = reference.openingWin;
    const values = states.map((_, i) => reference.positions[first + i]!.td);
    values[values.length - 1] = outcome;
    expect(outcome).toBe(-1); // Red, to move at the end, has lost.
    expect(returns).toHaveLength(9);
    let next = values[9]!;
    for (let t = 8; t >= 0; t--) {
      const g = -((1 - lambda) * values[t + 1]! + lambda * next);
      expect(Math.abs(g - returns[t]!), `G_${t}`).toBeLessThanOrEqual(1e-6);
      next = returns[t]!;
    }
  });

  it('replays to the fixture states', () => {
    states.forEach((s, i) => expect(s, `ply ${i}`).toEqual(reference.positions[reference.openingWin.first + i]!.state));
  });
});
