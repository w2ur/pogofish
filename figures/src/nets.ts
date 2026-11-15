// The forward passes of the two nets, read from the files the Rust exports:
// the AlphaZero MLP (.pfw, crates/infer/src/mlp.rs) and the TD(lambda) value
// net (.pfv, crates/infer/src/value.rs). Arithmetic is f32 in the Rust order
// (each product rounded, summed from 0, then the bias added), so the outputs
// match the Rust to the last few bits, not just to the eye.
import { features, legal, type Move, type State } from './engine';

export interface NetHeader {
  features: string;
  layers: { name: string; inputs: number; outputs: number }[];
  /** Every weight and bias in the file. */
  weights: number;
}

export interface AzOut {
  /** One per action, `policyIndex` order. */
  logits: Float32Array;
  /** Policy index of each legal move -> softmax of the logits over the legal moves. */
  priors: Map<number, number>;
  /** In [-1, 1], for the player to move. */
  value: number;
}

export interface AzNet {
  header: NetHeader;
  evaluate(s: State): AzOut;
}

export interface TdNet {
  header: NetHeader;
  /** V(s) in [-1, 1], for the player to move. */
  value(s: State): number;
}

const FEATURES = 'mover-relative-repetition';
const FEATURE_SIZE = 127;
const ACTION_SIZE = 243;
const AZ_HEADS = ['policy_fc1', 'policy_fc2', 'value_fc1', 'value_fc2'];

const f = Math.fround;

interface Linear {
  inputs: number;
  outputs: number;
  /** `outputs` rows of `inputs` values. */
  weight: Float32Array;
  bias: Float32Array;
}

/** from_cell * 27 + (num_pieces - 1) * 9 + to_cell, as crates/infer/src/actions.rs. */
export function policyIndex(m: Move): number {
  return m.from_cell * 27 + (m.num_pieces - 1) * 9 + m.to_cell;
}

function apply(l: Linear, x: Float32Array): Float32Array {
  const out = new Float32Array(l.outputs);
  for (let o = 0; o < l.outputs; o++) {
    const row = o * l.inputs;
    let sum = 0;
    for (let i = 0; i < l.inputs; i++) sum = f(sum + f(l.weight[row + i]! * x[i]!));
    out[o] = f(l.bias[o]! + sum);
  }
  return out;
}

function relu(x: Float32Array): Float32Array {
  return x.map((v) => (v > 0 ? v : 0));
}

const input = (s: State): Float32Array => Float32Array.from(features(s));

/** Magic line, one line of JSON, then each layer's weights then biases, f32 LE. */
function parse(bytes: ArrayBuffer, magic: string): { header: NetHeader; layers: Linear[] } {
  const all = new Uint8Array(bytes);
  const prefix = new TextEncoder().encode(magic);
  if (all.length < prefix.length || prefix.some((b, i) => all[i] !== b)) {
    throw new Error(`pogo-figures: not a ${magic.trim()} file`);
  }
  const nl = all.indexOf(10, prefix.length);
  if (nl < 0) throw new Error(`pogo-figures: ${magic.trim()} header truncated`);
  const json = JSON.parse(new TextDecoder().decode(all.subarray(prefix.length, nl))) as Omit<NetHeader, 'weights'>;
  if (json.features !== FEATURES) {
    throw new Error(`pogo-figures: features "${json.features}", expected "${FEATURES}"`);
  }
  const view = new DataView(bytes);
  let offset = nl + 1;
  let weights = 0;
  const layers = json.layers.map(({ name, inputs, outputs }) => {
    const n = inputs * outputs + outputs;
    const need = 4 * n;
    const have = bytes.byteLength - offset;
    if (have < need) {
      throw new Error(
        `pogo-figures: ${magic.trim()} truncated in ${name}: ${need} bytes needed, ${have} present, ${need - have} bytes missing`,
      );
    }
    const values = new Float32Array(n);
    for (let i = 0; i < n; i++) values[i] = view.getFloat32(offset + 4 * i, true);
    offset += need;
    weights += n;
    return { inputs, outputs, weight: values.subarray(0, inputs * outputs), bias: values.subarray(inputs * outputs) };
  });
  if (offset !== bytes.byteLength) {
    throw new Error(`pogo-figures: ${bytes.byteLength - offset} unexpected bytes after the last layer`);
  }
  return { header: { features: json.features, layers: json.layers, weights }, layers };
}

function chain(layers: Linear[], from: number, what: string): number {
  let width = from;
  for (const l of layers) {
    if (l.inputs !== width) throw new Error(`pogo-figures: ${what} takes ${l.inputs} inputs, expected ${width}`);
    width = l.outputs;
  }
  return width;
}

export function parseAz(bytes: ArrayBuffer): AzNet {
  const { header, layers } = parse(bytes, 'PFW1\n');
  const names = header.layers.map((l) => l.name);
  if (layers.length < 5 || names.slice(-4).join() !== AZ_HEADS.join()) {
    throw new Error(`pogo-figures: unexpected layer order ${names.join(', ')}`);
  }
  const trunk = layers.slice(0, -4);
  const [policy1, policy2, value1, value2] = layers.slice(-4) as [Linear, Linear, Linear, Linear];
  const width = chain(trunk, FEATURE_SIZE, 'the trunk');
  if (chain([policy1, policy2], width, 'the policy head') !== ACTION_SIZE) {
    throw new Error(`pogo-figures: the policy head must have ${ACTION_SIZE} outputs`);
  }
  if (chain([value1, value2], width, 'the value head') !== 1) {
    throw new Error('pogo-figures: the value head must have one output');
  }
  return {
    header,
    evaluate(s) {
      let h = input(s);
      for (const l of trunk) h = relu(apply(l, h));
      const logits = apply(policy2, relu(apply(policy1, h)));
      const value = f(Math.tanh(apply(value2, relu(apply(value1, h)))[0]!));
      // As the Rust evaluator (crates/infer/src/mcts.rs): softmax over the legal moves, in f32.
      const keys = legal(s).map(policyIndex);
      const picked = keys.map((k) => logits[k]!);
      const max = picked.reduce((a, b) => (b > a ? b : a), -Infinity);
      const exp = picked.map((l) => f(Math.exp(f(l - max))));
      const total = exp.reduce((a, b) => f(a + b), 0);
      const priors = new Map(keys.map((k, i) => [k, f(exp[i]! / total)]));
      return { logits, priors, value };
    },
  };
}

export function parseTd(bytes: ArrayBuffer): TdNet {
  const { header, layers } = parse(bytes, 'PFV1\n');
  const names = header.layers.map((l) => l.name);
  const expected = layers.map((_, i) => (i === layers.length - 1 ? 'td_out' : `td_fc${i}`));
  if (layers.length === 0 || names.join() !== expected.join()) {
    throw new Error(`pogo-figures: unexpected layer names ${names.join(', ')}`);
  }
  if (chain(layers, FEATURE_SIZE, 'the value net') !== 1) {
    throw new Error('pogo-figures: the output layer must have one unit');
  }
  const last = layers.length - 1;
  return {
    header,
    value(s) {
      let h = input(s);
      layers.forEach((l, i) => {
        h = i < last ? relu(apply(l, h)) : apply(l, h);
      });
      return f(Math.tanh(h[0]!));
    },
  };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`pogo-figures: could not fetch ${url} (${response.status})`);
  return response.arrayBuffer();
}

export async function loadAz(url: string): Promise<AzNet> {
  return parseAz(await fetchBytes(url));
}

export async function loadTd(url: string): Promise<TdNet> {
  return parseTd(await fetchBytes(url));
}
