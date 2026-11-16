import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ReachData } from '../data';
import { REACH_SOURCE } from '../reach';
import { reachChart } from './reach-bars';

const reach = JSON.parse(readFileSync('public/data/reach.json', 'utf8')) as ReachData;

describe('reachChart', () => {
  it('the bars are reach.json’s sixteen values, ply 0 to 15, and sum to its reachable count', () => {
    const { rows, reachable } = reachChart(reach);
    expect(rows.map((r) => r.ply)).toEqual([...Array(16).keys()]);
    expect(rows.map((r) => r.count)).toEqual(reach.firstSeenAtPly);
    expect(rows.reduce((a, r) => a + r.count, 0)).toBe(reach.reachable);
    expect(reachable).toBe(230015628);
  });

  it('draws on one linear scale: each length is its count over the largest', () => {
    const { rows } = reachChart(reach);
    const max = Math.max(...reach.firstSeenAtPly);
    expect(max).toBe(68847740);
    for (const r of rows) expect(r.share).toBeCloseTo(r.count / max, 12);
    expect(rows.filter((r) => r.share === 1).map((r) => r.ply)).toEqual([10]);
  });

  it('keeps the possible and the unreachable counts, so the figure can say not every position is reached', () => {
    const c = reachChart(reach);
    expect(c.possible).toBe(232792560);
    expect(c.possible - c.reachable).toBe(2776932);
  });

  it('names the source the data file names', () => {
    expect(REACH_SOURCE).toBe(reach.source);
  });

  it('refuses a file whose plies do not add up, or whose source is another', () => {
    expect(() => reachChart({ ...reach, reachable: reach.reachable + 1 })).toThrow();
    expect(() => reachChart({ ...reach, source: 'elsewhere.json' })).toThrow();
    expect(() => reachChart({ ...reach, firstSeenAtPly: [] })).toThrow();
  });
});
