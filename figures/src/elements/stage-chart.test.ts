import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { V5Data } from '../data';
import { stageChart, stageScript } from './stage-chart';

const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;

describe('stageChart', () => {
  it('places every stage of the three programs at its measured score, evenly spaced in the data’s order', () => {
    for (const program of ['qtab', 'td', 'az100'] as const) {
      const { points } = stageChart(v5, program);
      expect(points.map((p) => p.pct)).toEqual(v5.stagesPct);
      points.forEach((p, k) => {
        const stage = v5.programs[program].stages.find((s) => s.pct === p.pct)!;
        expect(p.y).toBe(stage.score);
        expect(p.ci95).toEqual(stage.ci95);
        expect(p.gamesTrained).toBe(stage.gamesTrained);
        expect(p.x).toBeCloseTo((k + 0.5) / points.length, 12);
      });
    }
  });

  it('draws the three references at the data’s scores, the table on top', () => {
    const { references } = stageChart(v5, 'td');
    expect(references.map((r) => r.key)).toEqual(['table', 'greedy', 'random']);
    for (const r of references) expect(r.y).toBe(v5.references[r.key].score);
    expect(references[0]!.y).toBeGreaterThan(references[1]!.y);
    expect(references[1]!.y).toBeGreaterThan(references[2]!.y);
  });

  it('refuses a missing stage and a score outside 0–1', () => {
    expect(() => stageChart({ ...v5, stagesPct: [...v5.stagesPct, 75] }, 'td')).toThrow(/no stage 75/);
    const bad = structuredClone(v5);
    bad.programs.qtab.stages[2]!.score = 1.2;
    expect(() => stageChart(bad, 'qtab')).toThrow(/outside 0–1/);
    expect(() => stageChart(bad, 'td')).not.toThrow();
  });
});

describe('stageScript', () => {
  it('plays every stage’s game one after the other, and knows where each starts and ends', () => {
    const { steps, starts } = stageScript([3, 2, 4]);
    expect(steps.map((s) => `${s.stage}.${s.ply}${s.end ? '!' : ''}`)).toEqual(['0.0', '0.1', '0.2!', '1.0', '1.1!', '2.0', '2.1', '2.2', '2.3!']);
    expect(starts).toEqual([0, 3, 5]);
  });

  it('refuses a game with no move', () => {
    expect(() => stageScript([3, 1])).toThrow();
  });
});
