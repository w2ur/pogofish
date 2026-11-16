import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAz, parseTd, type NetHeader } from '../nets';
import { azDiagram, tdDiagram, units } from './net-layers';

const bytes = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const az = parseAz(bytes('az-lc1-s1.pfw'));
const td = parseTd(bytes('td-s1.pfv'));

describe('the nets’ diagrams', () => {
  it('layer sizes come from the header: TD 127 → 128 → 64 → 1', () => {
    const d = tdDiagram(td.header);
    expect(units(d.trunk)).toEqual([127, 128, 64, 1]);
    expect(d.trunk.links).toEqual([
      { inputs: 127, outputs: 128 },
      { inputs: 128, outputs: 64 },
      { inputs: 64, outputs: 1 },
    ]);
    expect(d.heads).toEqual([]);
    expect(d.widest).toBe(128);
    expect(d.weights).toBe(td.header.weights);
  });

  it('layer sizes come from the header: AZ trunk 127 → 256 → 128, policy 128 → 128 → 243, value 128 → 128 → 1', () => {
    const d = azDiagram(az.header);
    expect(units(d.trunk)).toEqual([127, 256, 128]);
    expect(d.heads.map((h) => [h.kind, units(h.column), h.column.links])).toEqual([
      ['policy', [128, 128, 243], [{ inputs: 128, outputs: 128 }, { inputs: 128, outputs: 243 }]],
      ['value', [128, 128, 1], [{ inputs: 128, outputs: 128 }, { inputs: 128, outputs: 1 }]],
    ]);
    expect(d.widest).toBe(256);
    expect(d.weights).toBe(130164);
  });

  it('a doctored header changes the diagram', () => {
    const doctored: NetHeader = {
      ...td.header,
      layers: [
        { name: 'td_fc0', inputs: 127, outputs: 200 },
        { name: 'td_fc1', inputs: 200, outputs: 32 },
        { name: 'td_out', inputs: 32, outputs: 1 },
      ],
      weights: 127 * 200 + 200 + 200 * 32 + 32 + 33,
    };
    const d = tdDiagram(doctored);
    expect(units(d.trunk)).toEqual([127, 200, 32, 1]);
    expect(d.widest).toBe(200);
    const deep: NetHeader = {
      ...az.header,
      layers: [{ name: 'trunk_0', inputs: 127, outputs: 64 }, { name: 'trunk_1', inputs: 64, outputs: 64 }, { name: 'trunk_2', inputs: 64, outputs: 32 }, ...az.header.layers.slice(-4).map((l) => ({ ...l, inputs: l.name.endsWith('fc1') ? 32 : l.inputs }))],
    };
    expect(units(azDiagram(deep).trunk)).toEqual([127, 64, 64, 32]);
  });

  it('refuses a header whose layers do not chain', () => {
    const broken: NetHeader = { ...td.header, layers: [{ name: 'td_fc0', inputs: 127, outputs: 128 }, { name: 'td_out', inputs: 64, outputs: 1 }] };
    expect(() => tdDiagram(broken)).toThrow(/^pogo-figures: /);
  });
});
