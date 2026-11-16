// Where <pogo-net> puts each node, apart from the canvas: every unit of every
// layer has its own place (none is replaced by « … »). A column too long for
// its height is folded into sub-columns side by side, staggered, so 256
// neurons stay 256 dots. AlphaZero's two heads share the last ranks: the
// preferences above, the value below. Pure arithmetic on a width and a height:
// nothing here reads the page.
import type { NetGraph } from './net-graph';

/** The least room between two nodes of a sub-column, in CSS pixels. */
export const MIN_PITCH = 3.2;
/** Radius of a lone node (the value's output). */
export const OUTPUT_RADIUS = 9;

export interface ColumnLayout {
  x: Float32Array;
  y: Float32Array;
  /** Radius of its nodes at rest. */
  r: number;
  /** The column's centre line, its band, and its grid. */
  cx: number;
  top: number;
  bottom: number;
  rows: number;
  sub: number;
  pitch: number;
  /** Distance between two sub-columns. */
  dx: number;
}

export interface NetLayout {
  width: number;
  height: number;
  columns: ColumnLayout[];
}

export interface LayoutOptions {
  /** Room kept at the left and right edges, and above and below. */
  padX?: number;
  padY?: number;
}

/** Share of the height the preference head takes, from the top; the value head takes the rest less a gap. */
const POLICY_SHARE = 0.64;
const HEAD_GAP = 0.07;

export function layoutNet(graph: NetGraph, width: number, height: number, o: LayoutOptions = {}): NetLayout {
  const padX = o.padX ?? 18;
  const padY = o.padY ?? 10;
  const inner = Math.max(1, height - 2 * padY);
  const span = Math.max(1, width - 2 * padX);
  const columns = graph.columns.map((c): ColumnLayout => {
    const cx = padX + (graph.ranks === 0 ? 0 : (c.rank / graph.ranks) * span);
    const top = c.band === 'value' ? padY + inner * (POLICY_SHARE + HEAD_GAP) : padY;
    const bottom = c.band === 'policy' ? padY + inner * POLICY_SHARE : padY + inner;
    const room = bottom - top;
    const x = new Float32Array(c.units);
    const y = new Float32Array(c.units);
    if (c.units === 1) {
      x[0] = cx;
      y[0] = (top + bottom) / 2;
      return { x, y, r: OUTPUT_RADIUS, cx, top, bottom, rows: 1, sub: 1, pitch: room, dx: 0 };
    }
    const rowsMax = Math.max(1, Math.floor(room / MIN_PITCH));
    const sub = Math.ceil(c.units / rowsMax);
    const rows = Math.ceil(c.units / sub);
    const pitch = room / rows;
    const dx = sub === 1 ? 0 : Math.max(4.5, Math.min(7, pitch * 1.4));
    for (let i = 0; i < c.units; i++) {
      const s = Math.floor(i / rows);
      const row = i % rows;
      x[i] = cx + (s - (sub - 1) / 2) * dx;
      // Every other sub-column sits half a step lower: the dots interlock.
      y[i] = top + (row + (sub > 1 && s % 2 === 1 ? 0.75 : sub > 1 ? 0.25 : 0.5)) * pitch;
    }
    return { x, y, r: Math.max(0.9, Math.min(4.5, pitch * 0.36)), cx, top, bottom, rows, sub, pitch, dx };
  });
  return { width, height, columns };
}

/** The node under a point, within `reach` pixels of its column; null when none. */
export function nodeAt(layout: NetLayout, px: number, py: number, reach = 14): { column: number; node: number } | null {
  let best: { column: number; node: number } | null = null;
  let bestD = Infinity;
  layout.columns.forEach((c, column) => {
    const half = ((c.sub - 1) / 2) * c.dx;
    if (px < c.cx - half - reach || px > c.cx + half + reach || py < c.top - reach || py > c.bottom + reach) return;
    const s = c.sub === 1 ? 0 : Math.max(0, Math.min(c.sub - 1, Math.round((px - c.cx) / c.dx + (c.sub - 1) / 2)));
    const offset = c.sub > 1 ? (s % 2 === 1 ? 0.75 : 0.25) : 0.5;
    const row = Math.max(0, Math.min(c.rows - 1, Math.round((py - c.top) / c.pitch - offset)));
    const node = Math.min(c.x.length - 1, s * c.rows + row);
    const d = Math.hypot(px - c.x[node]!, py - c.y[node]!);
    if (d < bestD) {
      bestD = d;
      best = { column, node };
    }
  });
  return bestD <= reach + OUTPUT_RADIUS ? best : null;
}
