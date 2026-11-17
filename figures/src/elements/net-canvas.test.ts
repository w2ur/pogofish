import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTd } from '../nets';
import { replay, type Triple } from '../engine';
import { DEFAULT_GAME } from '../default-game';
import { netGraph, signal } from './net-graph';
import { layoutNet } from './net-layout';
import { NODE_SHARE, drawNet, flowEnd, linkProgress, nodeProgress, strength } from './net-canvas';

describe('the signal’s crossing, in ranks', () => {
  it('lights a rank’s nodes first, then sends its links, which arrive as the next rank lights', () => {
    expect(nodeProgress(0, 0)).toBe(0);
    expect(nodeProgress(NODE_SHARE, 0)).toBe(1);
    expect(linkProgress(NODE_SHARE, 0)).toBe(0);
    expect(linkProgress(1, 0)).toBe(1);
    // Rank 1 is dark until the links of rank 0 have arrived.
    expect(nodeProgress(0.99, 1)).toBe(0);
    expect(nodeProgress(1 + NODE_SHARE / 2, 1)).toBeCloseTo(0.5, 6);
  });

  it('never runs backwards or past its end', () => {
    for (let r = 0; r < 4; r++) {
      let last = 0;
      for (let tau = -1; tau < 6; tau += 0.05) {
        const p = linkProgress(tau, r);
        expect(p).toBeGreaterThanOrEqual(last);
        expect(p).toBeLessThanOrEqual(1);
        last = p;
      }
    }
  });

  it('the whole net is lit at flowEnd: every rank’s nodes and links', () => {
    const end = flowEnd(3);
    for (let r = 0; r <= 3; r++) expect(nodeProgress(end, r)).toBe(1);
    for (let r = 0; r < 3; r++) expect(linkProgress(end, r)).toBe(1);
    expect(nodeProgress(end - NODE_SHARE, 3)).toBe(0);
  });

  it('sorts a share of the scale into three strengths', () => {
    expect([0, 0.1, 0.2, 0.4, 0.6, 1, 3].map(strength)).toEqual([0, 0, 1, 1, 2, 2, 2]);
  });
});

describe('drawNet between two passes', () => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets/td-s1.pfv'));
  const td = parseTd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const graph = netGraph(td.header);
  const layout = layoutNet(graph, 600, 440, { padX: 44 });
  const states = replay(DEFAULT_GAME as Triple[]);
  const pass = (i: number) => signal(td, graph, td.forward(states[i]!), 6);
  const palette = { red: 'R', ink: 'I', ground: 'G', rule: 'L', edge: 'E' };
  /** The colours stroked and filled, as a recording context sees them. */
  const colours = (previous: ReturnType<typeof pass> | null) => {
    const used = new Set<string>();
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, prop) => (prop === 'stroke' ? () => used.add(String(target.strokeStyle)) : prop === 'fill' ? () => used.add(String(target.fillStyle)) : prop in target ? target[prop as string] : () => {}),
      set: (target, prop, value) => ((target[prop as string] = value), true),
    }) as unknown as CanvasRenderingContext2D;
    drawNet(ctx, { layout, graph, signal: pass(4), tau: 0, palette, previous });
    return used;
  };

  // Regression: at the start of a crossing every link was grey (the rule colour) and no node lit.
  it('at the start of a crossing, with no pass before, the net is unlit: rule and edge only', () => {
    const used = colours(null);
    expect(used.has('R')).toBe(false);
  });

  it('at the start of a crossing, a previous pass stays drawn, lit, in red and ink', () => {
    const used = colours(pass(3));
    expect(used.has('R')).toBe(true);
    expect(used.has('I')).toBe(true);
  });
});
