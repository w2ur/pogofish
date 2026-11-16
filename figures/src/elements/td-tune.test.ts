import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { replay, type Triple } from '../engine';
import { parseTd } from '../nets';
import { mulberry32 } from '../players';
import { TD_LR, copyLayers, encode, forward, gradient, loss, sgdStep, type Layer } from './td-tune';

const b = readFileSync(resolve(process.cwd(), 'public/nets/td-s1.pfv'));
const td = parseTd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const states = replay(DEFAULT_GAME as Triple[]);

/** A small net with weights drawn from a seeded generator, far from 0 so that no ReLU sits on its kink. */
function tiny(seed: number, sizes = [5, 4, 3, 1]): Layer[] {
  const rng = mulberry32(seed);
  return sizes.slice(1).map((outputs, k) => {
    const inputs = sizes[k]!;
    return {
      inputs,
      outputs,
      weight: Float64Array.from({ length: inputs * outputs }, () => rng() * 2 - 1),
      bias: Float64Array.from({ length: outputs }, () => rng() * 2 - 1),
    };
  });
}

describe('the adjustment of the value net', () => {
  it('the copy values every position as the net itself does', () => {
    const layers = copyLayers(td);
    for (const s of states) expect(forward(layers, encode(s))).toBeCloseTo(td.value(s), 5);
  });

  it('the learning rate is the run’s', () => {
    expect(TD_LR).toBe(0.1);
  });

  it('the gradient equals the slope of the loss, weight by weight (finite differences)', () => {
    for (const seed of [1, 2, 3]) {
      const layers = tiny(seed);
      const rng = mulberry32(seed + 100);
      const xs = Array.from({ length: 4 }, () => Float64Array.from({ length: 5 }, () => rng() * 2 - 1));
      const ys = xs.map(() => rng() * 2 - 1);
      const grads = gradient(layers, xs, ys);
      const h = 1e-6;
      layers.forEach((l, k) => {
        for (const [name, values] of [['weight', l.weight], ['bias', l.bias]] as const) {
          for (let i = 0; i < values.length; i++) {
            const kept = values[i]!;
            values[i] = kept + h;
            const up = loss(layers, xs, ys);
            values[i] = kept - h;
            const down = loss(layers, xs, ys);
            values[i] = kept;
            expect(grads[k]![name][i], `seed ${seed} layer ${k} ${name} ${i}`).toBeCloseTo((up - down) / (2 * h), 6);
          }
        }
      });
    }
  });

  it('the control: a wrong gradient is seen by the same check', () => {
    const layers = tiny(1);
    const xs = [Float64Array.from([0.3, -0.2, 0.9, 0.1, -0.7])];
    const ys = [0.5];
    // The last bias always has a slope: no ReLU stands between it and the value.
    const last = layers.at(-1)!;
    const g = gradient(layers, xs, ys).at(-1)!.bias[0]!;
    const h = 1e-6;
    last.bias[0]! += h;
    const up = loss(layers, xs, ys);
    last.bias[0]! -= 2 * h;
    const down = loss(layers, xs, ys);
    expect(g).not.toBe(0);
    expect(Math.abs(2 * g - (up - down) / (2 * h))).toBeGreaterThan(1e-6);
  });

  it('one step brings the real net’s values closer to their targets, and never writes to the shared net', () => {
    const before = Float32Array.from(td.layers![0]!.weight);
    const layers = copyLayers(td);
    const xs = states.slice(0, -1).map(encode);
    // Any fixed targets will do here: the step must lower the loss it was made for.
    const ys = xs.map((_, t) => (t % 2 === 0 ? 0.6 : -0.6));
    const was = loss(layers, xs, ys);
    sgdStep(layers, xs, ys);
    expect(loss(layers, xs, ys)).toBeLessThan(was);
    expect(td.layers![0]!.weight).toEqual(before);
  });

  it('refuses a net that does not give its layers', () => {
    expect(() => copyLayers({})).toThrow();
  });
});
