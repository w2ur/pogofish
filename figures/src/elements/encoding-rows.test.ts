import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { State } from '../engine';
import { encodingRows, PER_CELL, SLOTS } from './encoding-rows';

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as {
  positions: { state: State; features: number[] }[];
};

describe('the encoding’s rows', () => {
  it('nine rows of 14 then the repetition input, as the fixture’s features', () => {
    const p = fixture.positions[0]!;
    const rows = encodingRows(p.features);
    expect(SLOTS).toBe(12);
    expect(PER_CELL).toBe(14);
    expect(rows.cells).toHaveLength(9);
    rows.cells.forEach((c, i) => {
      expect(c.name).toBe(`${'abc'[i % 3]}${Math.floor(i / 3) + 1}`);
      expect([...c.slots, c.top, c.height]).toEqual(p.features.slice(i * 14, i * 14 + 14));
      // The pieces of the stack, bottom first, as +1 for the mover and −1 for the other side.
      const stack = p.state.cells[i]!;
      expect(c.slots.slice(0, stack.length)).toEqual(stack.map((col) => (col === p.state.to_move ? 1 : -1)));
      expect(c.slots.slice(stack.length).every((x) => x === 0)).toBe(true);
      expect(c.height * 12).toBeCloseTo(stack.length, 5);
    });
    expect(rows.repetition).toBe(p.features[126]);
  });

  it('refuses anything but 127 inputs', () => {
    expect(() => encodingRows(new Array(126).fill(0))).toThrow(/^pogo-figures: /);
  });
});
