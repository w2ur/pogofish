import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { V5Data } from '../data';
import { RACE_PROGRAMS, firstAboveGreedy, raceChart, raceSource } from './race-chart';

const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;
const chart = raceChart(v5);
const log10 = Math.log10;

describe('raceChart', () => {
  it('race x-axis is games trained, log scale, every point a V5Data stage', () => {
    expect(chart.series.map((s) => s.program)).toEqual([...RACE_PROGRAMS]);
    for (const s of chart.series) {
      const stages = v5.programs[s.program].stages;
      expect(s.points.map((p) => p.gamesTrained)).toEqual(stages.map((st) => st.gamesTrained));
      expect(s.points.map((p) => p.pct)).toEqual(stages.map((st) => st.pct));
      // Stage 0 is in the detached zero column, every other point on the log axis.
      for (const p of s.points) expect(p.column).toBe(p.gamesTrained === 0 ? 'zero' : 'log');
      const onLog = s.points.filter((p) => p.column === 'log');
      // Equal ratios of games, equal distances: the axis is log10 of games trained.
      for (let i = 1; i < onLog.length; i++) {
        const a = onLog[i - 1]!;
        const b = onLog[i]!;
        expect(b.x - a.x).toBeCloseTo(chart.axis.perDecade * (log10(b.gamesTrained) - log10(a.gamesTrained)), 9);
        expect(b.x).toBeGreaterThan(a.x);
      }
    }
    // The axis spans the data: its ends are the smallest and largest positive counts, inside the box.
    const all = chart.series.flatMap((s) => s.points.filter((p) => p.column === 'log'));
    expect(Math.min(...all.map((p) => p.x))).toBeGreaterThan(0);
    expect(Math.max(...all.map((p) => p.x))).toBeLessThan(1);
    expect(chart.axis.ticks.map((t) => t.games)).toEqual([100, 1000, 10000, 100000, 1000000]);
  });

  it('every plotted point’s score and interval equal V5Data’s', () => {
    for (const s of chart.series) {
      s.points.forEach((p, i) => {
        const st = v5.programs[s.program].stages[i]!;
        expect([p.score, p.ci95[0], p.ci95[1]]).toEqual([st.score, st.ci95[0], st.ci95[1]]);
        // The y-axis is the same percentage, 0 % at the bottom (y = 0) and 100 % at the top (y = 1).
        expect(p.y).toBe(st.score);
        expect([p.lo, p.hi]).toEqual(st.ci95);
      });
    }
  });

  it('the three references are V5Data.references', () => {
    expect(chart.references.map((r) => r.key)).toEqual(['table', 'greedy', 'random']);
    for (const r of chart.references) {
      expect({ score: r.score, ci95: r.ci95 }).toEqual(v5.references[r.key]);
      expect(r.y).toBe(v5.references[r.key].score);
    }
  });

  it('the first stage above greedy is computed from the data for each program', () => {
    const greedy = v5.references.greedy;
    const found = Object.fromEntries(chart.series.map((s) => [s.program, s.firstAbove?.gamesTrained ?? null]));
    // What the data gives, checked against the essay and docs/experiments/v5-video.md: AlphaZero with search
    // passes greedy between 200 and 500 games, TD at 1,000, AlphaZero without search between 2,500 and
    // 5,000, the tabular learner never in its 5,000,000.
    expect(found).toEqual({ az100: 500, az0: 5000, td: 1000, qtab: null });
    for (const s of chart.series) {
      const stages = v5.programs[s.program].stages;
      const k = stages.findIndex((st) => st.ci95[0] > greedy.score);
      expect(s.firstAbove?.pct ?? null, s.program).toBe(k < 0 ? null : stages[k]!.pct);
      // Every stage before it has an interval reaching down to greedy's score or below.
      for (const st of stages.slice(0, k < 0 ? stages.length : k)) expect(st.ci95[0]).toBeLessThanOrEqual(greedy.score);
      // The looser rule (the score alone above greedy's) names the same stage on this data.
      const loose = stages.findIndex((st) => st.score > greedy.score);
      expect(loose).toBe(k);
    }
  });

  it('firstAboveGreedy wants the whole interval above, not the score alone', () => {
    const stage = (gamesTrained: number, score: number, lo: number) => ({ gamesTrained, pct: 0, score, ci95: [lo, score + 0.01] as [number, number] });
    expect(firstAboveGreedy([stage(0, 0.1, 0.05), stage(10, 0.5, 0.48), stage(20, 0.6, 0.55)], 0.493)?.gamesTrained).toBe(20);
    expect(firstAboveGreedy([stage(0, 0.1, 0.05)], 0.493)).toBeNull();
  });

  it('cites the data’s own source', () => {
    expect(raceSource(v5)).toBe(v5.source);
  });

  it('refuses data whose references or stages it cannot place', () => {
    const broken = structuredClone(v5);
    broken.programs.td.stages[3]!.gamesTrained = 0;
    expect(() => raceChart(broken)).toThrow('td');
    const unordered = structuredClone(v5);
    unordered.programs.az0.stages.reverse();
    expect(() => raceChart(unordered)).toThrow('az0');
    const outOfRange = structuredClone(v5);
    outOfRange.references.table.score = 1.2;
    expect(() => raceChart(outOfRange)).toThrow('table');
  });
});
