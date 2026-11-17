// What <pogo-reach> draws, apart from the DOM: one bar per ply of the
// breadth-first exploration, on one linear scale, from reach.json, and the
// steps the figure plays them in. Nothing is computed but the ratio of each
// count to the largest, the running sum of the levels landed, and the
// positions never reached (the possible count less the reachable); a file
// whose plies do not add up to its reachable count, or that names another
// source, is refused.
import type { ReachData } from '../data';
import { REACH_SOURCE } from '../reach';

export interface ReachRow {
  ply: number;
  /** Positions first seen at this ply. */
  count: number;
  /** count / the largest count: the bar's length on the common scale, 0 to 1. */
  share: number;
}

export interface ReachChart {
  rows: ReachRow[];
  reachable: number;
  possible: number;
  /** Positions the exploration never reaches: possible − reachable. */
  unreached: number;
}

export function reachChart(d: ReachData): ReachChart {
  if (d.source !== REACH_SOURCE) throw new Error(`pogo-reach: data from ${d.source}, label says ${REACH_SOURCE}`);
  const counts = d.firstSeenAtPly;
  if (counts.length === 0) throw new Error('pogo-reach: no plies');
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum !== d.reachable) throw new Error(`pogo-reach: plies add up to ${sum}, not ${d.reachable}`);
  if (d.reachable > d.positionsTotal) throw new Error(`pogo-reach: ${d.reachable} reachable of ${d.positionsTotal} possible`);
  const max = Math.max(...counts);
  return {
    rows: counts.map((count, ply) => ({ ply, count, share: count / max })),
    reachable: d.reachable,
    possible: d.positionsTotal,
    unreached: d.positionsTotal - d.reachable,
  };
}

export interface ReachStep {
  /** `level`: ply `ply` lands; `stop`: ply `ply` finds nothing new, and the exploration ends; `total`: the count. */
  kind: 'level' | 'stop' | 'total';
  ply: number;
  /** Levels shown so far. */
  landed: number;
  /** Positions reached so far: the sum of the levels shown. */
  reached: number;
}

/** One step per level, then the first level with nothing new (the file's length), then the total. */
export function reachSteps(c: ReachChart): ReachStep[] {
  let reached = 0;
  const levels = c.rows.map((r): ReachStep => {
    reached += r.count;
    return { kind: 'level', ply: r.ply, landed: r.ply + 1, reached };
  });
  const end = c.rows.length;
  return [...levels, { kind: 'stop', ply: end, landed: end, reached }, { kind: 'total', ply: end, landed: end, reached }];
}
