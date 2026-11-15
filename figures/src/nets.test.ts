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
}

interface Reference {
  positions: Position[];
  openingWin: { moves: Triple[]; first: number };
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
    expect(reference.openingWin.moves).toEqual(lines.openingWin);
  });

  it('features(state) equal the Rust features on every fixture position', () => {
    for (const p of reference.positions) {
      const got = features(p.state);
      expect(got.length, p.label).toBe(p.features.length);
      got.forEach((x, i) => expect(Math.abs(x - p.features[i]!), `${p.label} [${i}]`).toBeLessThanOrEqual(1e-6));
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

  it('az priors are a softmax over the legal moves, keyed by policy index', () => {
    for (const p of reference.positions) {
      const { priors } = az.evaluate(p.state);
      const keys = p.legal.map(([from_cell, n, to_cell]) =>
        policyIndex({ from_cell, num_pieces: n as 1 | 2 | 3, to_cell }),
      );
      expect([...priors.keys()].sort((a, b) => a - b), p.label).toEqual([...keys].sort((a, b) => a - b));
      if (keys.length > 0) {
        const total = [...priors.values()].reduce((a, b) => a + b, 0);
        expect(Math.abs(total - 1), p.label).toBeLessThanOrEqual(1e-6);
      }
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

  it('replays to the fixture states', () => {
    states.forEach((s, i) => expect(s, `ply ${i}`).toEqual(reference.positions[reference.openingWin.first + i]!.state));
  });
});
