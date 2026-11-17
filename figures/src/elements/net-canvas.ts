// The drawing of <pogo-net>: one canvas, one call per frame, nothing laid out
// here (net-layout.ts placed the nodes once per size). The signal crosses the
// net from left to right in `tau`, counted in ranks: at tau = r the nodes of
// rank r light up, then their links grow towards rank r + 1 and reach it at
// tau = r + 1. A link is drawn in the page's red when what it carried
// (weight × activation) is positive and in ink when negative, the stronger the
// plainer; a node likewise by its value. Under the lit links the same links
// stand as hairlines, so the net is there before the signal is.
import type { NetGraph, Signal } from './net-graph';
import type { NetLayout } from './net-layout';

export interface Palette {
  red: string;
  ink: string;
  ground: string;
  rule: string;
  edge: string;
}

export interface Probe {
  column: number;
  node: number;
}

/** Share of a rank's time its nodes take to light up; the links travel in the rest. */
export const NODE_SHARE = 0.2;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** How lit the nodes of `rank` are at `tau`, 0–1. */
export const nodeProgress = (tau: number, rank: number): number => clamp01((tau - rank) / NODE_SHARE);

/** How far the links leaving `rank` have travelled at `tau`, 0–1. */
export const linkProgress = (tau: number, rank: number): number => clamp01((tau - rank - NODE_SHARE) / (1 - NODE_SHARE));

/** The `tau` at which the whole net is lit: the last rank's nodes included. */
export const flowEnd = (ranks: number): number => ranks + NODE_SHARE;

/** Three strengths, by the square root of the share of the scale: weak, middling, strong. */
export function strength(share: number): 0 | 1 | 2 {
  const m = Math.sqrt(clamp01(share));
  return m < 0.4 ? 0 : m < 0.7 ? 1 : 2;
}

/** A link's strength, by its plain share of the layer's strongest: most links are weak, a few carry the signal. */
export function linkStrength(share: number): 0 | 1 | 2 {
  return share < 0.22 ? 0 : share < 0.55 ? 1 : 2;
}

const LINK_ALPHA = [0.16, 0.45, 1] as const;
const LINK_WIDTH = [0.5, 0.8, 1.3] as const;
const NODE_ALPHA = [0.45, 0.75, 1] as const;
const TAU = Math.PI * 2;

export interface NetView {
  layout: NetLayout;
  graph: NetGraph;
  signal: Signal;
  tau: number;
  palette: Palette;
  probe?: Probe | null;
  /**
   * The pass drawn before this one: where the new signal has not reached yet (a layer's links before
   * they leave, a rank's nodes before they light), the previous pass stays drawn, lit, so the net never
   * blanks between two positions; the new one replaces it as it crosses.
   */
  previous?: Signal | null;
}

export function drawNet(ctx: CanvasRenderingContext2D, v: NetView): void {
  const { layout, graph, tau, palette } = v;
  const probe = v.probe ?? null;
  const previous = v.previous ?? null;
  // With a node under the pointer, the rest steps back and its own links come forward.
  const dim = probe ? 0.3 : 1;
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.lineCap = 'butt';

  graph.layers.forEach((g, n) => {
    const a = layout.columns[g.from]!;
    const b = layout.columns[g.to]!;
    const travelled = linkProgress(tau, graph.columns[g.from]!.rank);
    // Links the new signal has not left on yet: the previous pass's, whole.
    const held = travelled <= 0 && previous !== null;
    const d = (held ? previous : v.signal).links[n]!;
    ctx.beginPath();
    for (let k = 0; k < d.count; k++) {
      ctx.moveTo(a.x[d.from[k]!]!, a.y[d.from[k]!]!);
      ctx.lineTo(b.x[d.to[k]!]!, b.y[d.to[k]!]!);
    }
    ctx.globalAlpha = dim;
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    const linear = held ? 1 : travelled;
    if (linear <= 0 || d.max === 0) return;
    const p = 1 - (1 - linear) * (1 - linear);
    for (const positive of [false, true]) {
      for (const lv of [0, 1, 2] as const) {
        ctx.beginPath();
        let any = false;
        for (let k = 0; k < d.count; k++) {
          const c = d.carried[k]!;
          if (c > 0 !== positive || linkStrength(Math.abs(c) / d.max) !== lv) continue;
          const x0 = a.x[d.from[k]!]!;
          const y0 = a.y[d.from[k]!]!;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + (b.x[d.to[k]!]! - x0) * p, y0 + (b.y[d.to[k]!]! - y0) * p);
          any = true;
        }
        if (!any) continue;
        ctx.globalAlpha = LINK_ALPHA[lv] * dim;
        ctx.strokeStyle = positive ? palette.red : palette.ink;
        ctx.lineWidth = LINK_WIDTH[lv];
        ctx.stroke();
      }
    }
  });

  graph.columns.forEach((c, i) => {
    const L = layout.columns[i]!;
    const reached = nodeProgress(tau, c.rank);
    // A rank the new signal has not lit yet keeps the previous pass's values, lit.
    const sig = reached <= 0 && previous !== null ? previous : v.signal;
    const lit = sig === previous ? 1 : reached;
    const values = sig.values[i]!;
    if (c.units === 1) {
      const value = values[0]!;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(L.x[0]!, L.y[0]!, L.r, 0, TAU);
      ctx.fillStyle = palette.ground;
      ctx.fill();
      if (lit > 0 && value !== 0) {
        ctx.globalAlpha = (0.3 + 0.7 * Math.min(1, Math.abs(value))) * lit;
        ctx.fillStyle = value > 0 ? palette.red : palette.ink;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }
    // Every node at rest: a dot when small, a ring when there is room for one.
    ctx.beginPath();
    for (let k = 0; k < c.units; k++) {
      ctx.moveTo(L.x[k]! + L.r, L.y[k]!);
      ctx.arc(L.x[k]!, L.y[k]!, L.r, 0, TAU);
    }
    if (L.r < 1.8) {
      ctx.globalAlpha = 0.7 * dim;
      ctx.fillStyle = palette.edge;
      ctx.fill();
    } else {
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.ground;
      ctx.fill();
      ctx.globalAlpha = dim;
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (lit <= 0) return;
    const scale = sig.scale[i]!;
    for (const positive of [false, true]) {
      for (const lv of [0, 1, 2] as const) {
        ctx.beginPath();
        let any = false;
        for (let k = 0; k < c.units; k++) {
          const value = values[k]!;
          if (value === 0 || value > 0 !== positive) continue;
          const share = Math.abs(value) / scale;
          if (strength(share) !== lv || share < 0.002) continue;
          // A preference is read as a size: its node grows with its share.
          const r = c.role === 'policy' ? L.r + 5 * Math.sqrt(Math.min(1, share)) : Math.min(L.r * (1 + 0.8 * Math.sqrt(Math.min(1, share))), L.r + 3);
          ctx.moveTo(L.x[k]! + r, L.y[k]!);
          ctx.arc(L.x[k]!, L.y[k]!, r, 0, TAU);
          any = true;
        }
        if (!any) continue;
        ctx.globalAlpha = NODE_ALPHA[lv] * lit * (probe ? 0.55 : 1);
        ctx.fillStyle = positive ? palette.red : palette.ink;
        ctx.fill();
      }
    }
  });

  if (!probe) {
    ctx.globalAlpha = 1;
    return;
  }
  const sig = v.signal;
  // The probed node's own links, plain, and a ring around it.
  graph.layers.forEach((g, n) => {
    const incoming = g.to === probe.column;
    const outgoing = g.from === probe.column;
    if (!incoming && !outgoing) return;
    if (linkProgress(tau, graph.columns[g.from]!.rank) < 1) return;
    const a = layout.columns[g.from]!;
    const b = layout.columns[g.to]!;
    const d = sig.links[n]!;
    for (const positive of [false, true]) {
      ctx.beginPath();
      for (let k = 0; k < d.count; k++) {
        if ((incoming ? d.to[k] : d.from[k]) !== probe.node || d.carried[k]! > 0 !== positive) continue;
        ctx.moveTo(a.x[d.from[k]!]!, a.y[d.from[k]!]!);
        ctx.lineTo(b.x[d.to[k]!]!, b.y[d.to[k]!]!);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = positive ? palette.red : palette.ink;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  });
  const P = layout.columns[probe.column]!;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(P.x[probe.node]!, P.y[probe.node]!, P.r + 4, 0, TAU);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
}
