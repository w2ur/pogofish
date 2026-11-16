// What <pogo-reach> draws, apart from the DOM: one bar per ply of the
// breadth-first exploration, on one linear scale, from reach.json. Nothing is
// computed but the ratio of each count to the largest; a file whose plies do
// not add up to its reachable count, or that names another source, is refused.
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
}

export function reachChart(d: ReachData): ReachChart {
  if (d.source !== REACH_SOURCE) throw new Error(`pogo-reach: data from ${d.source}, label says ${REACH_SOURCE}`);
  const counts = d.firstSeenAtPly;
  if (counts.length === 0) throw new Error('pogo-reach: no plies');
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum !== d.reachable) throw new Error(`pogo-reach: plies add up to ${sum}, not ${d.reachable}`);
  const max = Math.max(...counts);
  return {
    rows: counts.map((count, ply) => ({ ply, count, share: count / max })),
    reachable: d.reachable,
    possible: d.positionsTotal,
  };
}
