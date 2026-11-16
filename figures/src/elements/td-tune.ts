// The adjustment <pogo-td-targets> shows after the targets: the trainer's own
// step (crates/train/src/td.rs, `train_td`), on one game. The loss is the mean
// of (V(s_t) − G_t)² over the game's positions, each value and target for its
// mover; the weights move against its gradient by the run's learning rate
// (plain SGD). The net is the real one, copied: the shared net is never
// written to. The trainer makes this step on batches of 64 positions drawn
// from 50 games; here the batch is the positions of the one game shown.
//
// Arithmetic is f64: after zero steps the values equal the f32 forward pass of
// nets.ts to about 1e-6, far under what the figure prints.
import { features, type State } from '../engine';
import type { TdNet } from '../nets';

/** The learning rate the TD net was trained with: models/v4-td-lc1-s1/config.json, `"lr": 0.1`. */
export const TD_LR = 0.1;

export interface Layer {
  inputs: number;
  outputs: number;
  /** `outputs` rows of `inputs` values. */
  weight: Float64Array;
  bias: Float64Array;
}

/** A copy of the net's layers that may be adjusted. */
export function copyLayers(net: Pick<TdNet, 'layers'>): Layer[] {
  if (!net.layers) throw new Error('pogo-figures: this value net does not give its layers');
  return net.layers.map((l) => ({ inputs: l.inputs, outputs: l.outputs, weight: Float64Array.from(l.weight), bias: Float64Array.from(l.bias) }));
}

/** Every layer's output for input `x`: ReLU on the hidden layers, tanh on the last, as TdNet. */
function activations(layers: readonly Layer[], x: Float64Array): Float64Array[] {
  const acts = [x];
  let h = x;
  layers.forEach((l, k) => {
    const out = new Float64Array(l.outputs);
    for (let o = 0; o < l.outputs; o++) {
      let sum = l.bias[o]!;
      const row = o * l.inputs;
      for (let i = 0; i < l.inputs; i++) sum += l.weight[row + i]! * h[i]!;
      out[o] = k < layers.length - 1 ? Math.max(0, sum) : Math.tanh(sum);
    }
    acts.push(out);
    h = out;
  });
  return acts;
}

/** V(x) in [−1, 1]. */
export function forward(layers: readonly Layer[], x: Float64Array): number {
  return activations(layers, x).at(-1)![0]!;
}

/** The mean of (V(x_n) − y_n)². */
export function loss(layers: readonly Layer[], xs: readonly Float64Array[], ys: readonly number[]): number {
  return xs.reduce((sum, x, n) => sum + (forward(layers, x) - ys[n]!) ** 2, 0) / xs.length;
}

/** The gradient of `loss` for every weight and bias, by backpropagation. */
export function gradient(layers: readonly Layer[], xs: readonly Float64Array[], ys: readonly number[]): { weight: Float64Array; bias: Float64Array }[] {
  const grads = layers.map((l) => ({ weight: new Float64Array(l.weight.length), bias: new Float64Array(l.bias.length) }));
  xs.forEach((x, n) => {
    const acts = activations(layers, x);
    const v = acts.at(-1)![0]!;
    // d loss / d (the last layer's sum): the squared error's slope, through tanh.
    let delta = new Float64Array([((2 * (v - ys[n]!)) / xs.length) * (1 - v * v)]);
    for (let k = layers.length - 1; k >= 0; k--) {
      const l = layers[k]!;
      const input = acts[k]!;
      const g = grads[k]!;
      const back = new Float64Array(l.inputs);
      for (let o = 0; o < l.outputs; o++) {
        const d = delta[o]!;
        if (d === 0) continue;
        g.bias[o]! += d;
        const row = o * l.inputs;
        for (let i = 0; i < l.inputs; i++) {
          g.weight[row + i]! += d * input[i]!;
          back[i]! += d * l.weight[row + i]!;
        }
      }
      // Through the ReLU of the layer before: a unit at 0 passes nothing back.
      if (k > 0) for (let i = 0; i < l.inputs; i++) if (input[i]! <= 0) back[i] = 0;
      delta = back;
    }
  });
  return grads;
}

/** One step of plain SGD on `layers`, in place: every weight moves against its gradient by `lr`. */
export function sgdStep(layers: Layer[], xs: readonly Float64Array[], ys: readonly number[], lr = TD_LR): void {
  const grads = gradient(layers, xs, ys);
  layers.forEach((l, k) => {
    const g = grads[k]!;
    for (let i = 0; i < l.weight.length; i++) l.weight[i]! -= lr * g.weight[i]!;
    for (let i = 0; i < l.bias.length; i++) l.bias[i]! -= lr * g.bias[i]!;
  });
}

/** A position as the net reads it. */
export const encode = (s: State): Float64Array => Float64Array.from(features(s));
