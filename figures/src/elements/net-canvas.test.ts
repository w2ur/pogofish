import { describe, expect, it } from 'vitest';
import { NODE_SHARE, flowEnd, linkProgress, nodeProgress, strength } from './net-canvas';

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
