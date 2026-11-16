// What <pogo-net> draws of a net, read from its file's header and never typed:
// each layer as a count of units, and between two layers the number of
// connections, each with its weight. Nothing here knows 127, 128 or 243: a net
// with other sizes draws other sizes.
import type { NetHeader } from '../nets';

export interface Link {
  inputs: number;
  outputs: number;
}

export interface Column {
  /** Units per layer, the first being what comes in (for a head, the trunk’s last layer). */
  layers: number[];
  /** `links[i]` joins `layers[i]` to `layers[i + 1]`: inputs × outputs connections. */
  links: Link[];
}

export interface NetDiagram {
  trunk: Column;
  /** AlphaZero's two heads, each fed by the trunk's last layer; none for TD. */
  heads: { kind: 'policy' | 'value'; column: Column }[];
  /** The largest layer: every layer is drawn on this one scale. */
  widest: number;
  /** Every weight and bias in the file. */
  weights: number;
}

/** A column's layer sizes, the incoming one first. */
export const units = (c: Column): number[] => c.layers;

/** The column fed by `from` units through `layers`, refused if a layer does not take what the last gave. */
function column(from: number, layers: NetHeader['layers'], what: string): Column {
  const sizes = [from];
  const links: Link[] = [];
  for (const l of layers) {
    if (l.inputs !== sizes.at(-1)) throw new Error(`pogo-figures: ${what}: ${l.name} takes ${l.inputs} inputs, the layer before gives ${sizes.at(-1)}`);
    links.push({ inputs: l.inputs, outputs: l.outputs });
    sizes.push(l.outputs);
  }
  return { layers: sizes, links };
}

const widest = (columns: Column[]): number => Math.max(...columns.flatMap((c) => c.layers));

export function tdDiagram(header: NetHeader): NetDiagram {
  const first = header.layers[0];
  if (!first) throw new Error('pogo-figures: the TD net has no layer');
  const trunk = column(first.inputs, header.layers, 'the TD net');
  return { trunk, heads: [], widest: widest([trunk]), weights: header.weights };
}

/** The trunk is every layer before the four of the heads (policy_fc1, policy_fc2, value_fc1, value_fc2). */
export function azDiagram(header: NetHeader): NetDiagram {
  const layers = header.layers;
  const byName = (name: string) => {
    const l = layers.find((x) => x.name === name);
    if (!l) throw new Error(`pogo-figures: the AlphaZero net has no layer ${name}`);
    return l;
  };
  const heads = ['policy_fc1', 'policy_fc2', 'value_fc1', 'value_fc2'].map(byName);
  const trunkLayers = layers.slice(0, -4);
  const first = trunkLayers[0];
  if (!first || layers.slice(-4).some((l, i) => l !== heads[i])) throw new Error('pogo-figures: the AlphaZero net has no trunk before its heads');
  const trunk = column(first.inputs, trunkLayers, 'the trunk');
  const out = trunk.layers.at(-1)!;
  const policy = column(out, heads.slice(0, 2), 'the policy head');
  const value = column(out, heads.slice(2), 'the value head');
  return {
    trunk,
    heads: [
      { kind: 'policy', column: policy },
      { kind: 'value', column: value },
    ],
    widest: widest([trunk, policy, value]),
    weights: header.weights,
  };
}
