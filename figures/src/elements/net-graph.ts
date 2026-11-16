// What <pogo-net> draws of a net, apart from the DOM: its layers as columns of
// nodes, read from the file's header and never typed (a net with other sizes
// draws other sizes), and, for one position, the signal that crosses it: each
// node's real activation (nets.ts, forward()) and, for each neuron, its
// strongest incoming links by |weight × activation| — what that link really
// carried into that neuron for this position. The figure draws those and says
// how many of all the links they are.
import type { Anatomy, NetHeader } from '../nets';

export type ColumnRole = 'input' | 'hidden' | 'policy' | 'value';
/** Where a column stands: the whole height, or one of AlphaZero's two heads. */
export type Band = 'full' | 'policy' | 'value';

export interface GraphColumn {
  role: ColumnRole;
  band: Band;
  units: number;
  /** Its place from left to right: the inputs are 0. */
  rank: number;
  /** Index of its activations in forward(). */
  acts: number;
}

export interface GraphLayer {
  /** Index in the net's `layers`. */
  layer: number;
  /** Columns it joins. */
  from: number;
  to: number;
}

export interface NetGraph {
  columns: GraphColumn[];
  layers: GraphLayer[];
  /** The last rank: the output's. */
  ranks: number;
  /** Every link of the net: the sum of inputs × outputs over its layers. */
  links: number;
}

const HEADS = ['policy_fc1', 'policy_fc2', 'value_fc1', 'value_fc2'];

/**
 * The graph of a TD net (a chain ending on one value) or of an AlphaZero net (a trunk,
 * then the policy head and the value head, both fed by the trunk's last layer).
 */
export function netGraph(header: NetHeader): NetGraph {
  const L = header.layers;
  const first = L[0];
  if (!first) throw new Error('pogo-figures: the net has no layer');
  const az = L.length >= 5 && L.slice(-4).map((l) => l.name).join() === HEADS.join();
  const trunk = az ? L.length - 4 : L.length - 1;
  const columns: GraphColumn[] = [{ role: 'input', band: 'full', units: first.inputs, rank: 0, acts: 0 }];
  const layers: GraphLayer[] = [];
  const add = (layer: number, from: number, role: ColumnRole, band: Band): number => {
    const l = L[layer]!;
    const source = columns[from]!;
    if (l.inputs !== source.units) throw new Error(`pogo-figures: ${l.name} takes ${l.inputs} inputs, the layer before gives ${source.units}`);
    columns.push({ role, band, units: l.outputs, rank: source.rank + 1, acts: layer + 1 });
    layers.push({ layer, from, to: columns.length - 1 });
    return columns.length - 1;
  };
  let last = 0;
  for (let i = 0; i < trunk; i++) last = add(i, last, 'hidden', 'full');
  if (az) {
    const p = add(trunk, last, 'hidden', 'policy');
    add(trunk + 1, p, 'policy', 'policy');
    const v = add(trunk + 2, last, 'hidden', 'value');
    add(trunk + 3, v, 'value', 'value');
  } else {
    add(trunk, last, 'value', 'full');
  }
  return {
    columns,
    layers,
    ranks: Math.max(...columns.map((c) => c.rank)),
    links: L.reduce((n, l) => n + l.inputs * l.outputs, 0),
  };
}

/** The links drawn into one column: `count` of them, link k from node `from[k]` to node `to[k]`, carrying `carried[k]`. */
export interface DrawnLinks {
  count: number;
  from: Uint16Array;
  to: Uint16Array;
  /** weight × the source's activation. */
  carried: Float32Array;
  /** The largest |carried|: the scale of this column's links. */
  max: number;
}

export interface Signal {
  /** Per column, each node's value: an activation, a preference (0–1, 0 for an illegal move), or the value. */
  values: Float32Array[];
  /** Per column, its largest |value|: the scale of its nodes (1 for the inputs, the preferences and the value). */
  scale: number[];
  /** Per layer of the graph, the links drawn. */
  links: DrawnLinks[];
  /** Links drawn in all. */
  drawn: number;
}

/**
 * The `k` strongest links into each node of `targets` (every node when omitted), by
 * |weight × activation|; a link that carried nothing is never drawn.
 */
export function strongestLinks(l: Anatomy['layers'][number], source: ArrayLike<number>, k: number, targets?: readonly number[]): DrawnLinks {
  const nodes = targets ?? Array.from({ length: l.outputs }, (_, i) => i);
  const from = new Uint16Array(nodes.length * k);
  const to = new Uint16Array(nodes.length * k);
  const carried = new Float32Array(nodes.length * k);
  const best = new Int32Array(k);
  const bestAbs = new Float64Array(k);
  let count = 0;
  let max = 0;
  for (const j of nodes) {
    const row = j * l.inputs;
    let held = 0;
    for (let i = 0; i < l.inputs; i++) {
      const a = Math.abs(l.weight[row + i]! * source[i]!);
      if (a === 0) continue;
      // An insertion into the k best so far, strongest first; ties keep the lower input.
      let at = held;
      while (at > 0 && bestAbs[at - 1]! < a) at--;
      if (at >= k) continue;
      for (let m = Math.min(held, k - 1); m > at; m--) {
        best[m] = best[m - 1]!;
        bestAbs[m] = bestAbs[m - 1]!;
      }
      best[at] = i;
      bestAbs[at] = a;
      if (held < k) held++;
    }
    for (let m = 0; m < held; m++) {
      const i = best[m]!;
      from[count] = i;
      to[count] = j;
      carried[count] = l.weight[row + i]! * source[i]!;
      count++;
    }
    if (held > 0 && bestAbs[0]! > max) max = bestAbs[0]!;
  }
  return { count, from: from.subarray(0, count), to: to.subarray(0, count), carried: carried.subarray(0, count), max };
}

/**
 * The signal one position sends through the net. `priors` (AlphaZero): the preference of
 * each legal move by policy index; the policy column then shows those shares, and only
 * the legal moves' links are drawn, since an illegal move counts for nothing.
 */
export function signal(net: Anatomy, graph: NetGraph, acts: readonly Float32Array[], perNode: number, priors?: ReadonlyMap<number, number>): Signal {
  const values = graph.columns.map((c) => {
    if (c.role !== 'policy' || !priors) return acts[c.acts]!;
    const shares = new Float32Array(c.units);
    for (const [index, share] of priors) shares[index] = share;
    return shares;
  });
  const scale = graph.columns.map((c, i) => {
    if (c.role !== 'hidden') return 1;
    let m = 0;
    for (const v of values[i]!) if (v > m) m = v;
    return m || 1;
  });
  const links = graph.layers.map((g) => {
    const to = graph.columns[g.to]!;
    const targets = to.role === 'policy' && priors ? [...priors.keys()].sort((a, b) => a - b) : undefined;
    return strongestLinks(net.layers[g.layer]!, acts[graph.columns[g.from]!.acts]!, perNode, targets);
  });
  return { values, scale, links, drawn: links.reduce((n, l) => n + l.count, 0) };
}
