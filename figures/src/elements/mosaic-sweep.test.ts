import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { V5Data } from '../data';
import { MOSAIC_PROGRAMS, mosaicStages } from './mosaic-grid';
import { SWEEP_STEP_MS, applySweep, stateAt, sweepPlan, type SquareState } from './mosaic-sweep';

const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;
const states = (program: (typeof MOSAIC_PROGRAMS)[number], k: number): SquareState[] =>
  mosaicStages(v5, program)[k]!.squares.map(({ result, mark }) => ({ result, mark }));

describe('sweepPlan', () => {
  it('changes exactly the squares whose state differs, in the order of the games', () => {
    const from = states('az100', 3);
    const to = states('az100', 4);
    const plan = sweepPlan(from, to, false);
    const differ = to.map((s, i) => i).filter((i) => from[i]!.result !== to[i]!.result || from[i]!.mark !== to[i]!.mark);
    expect(plan.changes.map((c) => c.index)).toEqual(differ);
    expect(differ.length).toBeGreaterThan(0);
    // One by one in game order: each square's delay is its place in the game order.
    for (const c of plan.changes) expect(c.delay).toBe(c.index * SWEEP_STEP_MS);
    expect(plan.duration).toBe(differ.at(-1)! * SWEEP_STEP_MS);
    // A stage change takes well under a second.
    expect(plan.duration).toBeLessThan(600);
  });

  it('from nothing, every square is drawn', () => {
    const plan = sweepPlan(null, states('td', 0), false);
    expect(plan.changes).toHaveLength(100);
  });

  it('the state after the sweep equals the stage’s data, for every program and every pair of stages', () => {
    for (const program of MOSAIC_PROGRAMS) {
      for (let a = 0; a < v5.stagesPct.length; a++) {
        for (let b = 0; b < v5.stagesPct.length; b++) {
          const from = states(program, a);
          const to = states(program, b);
          expect(applySweep(from, sweepPlan(from, to, false)), `${program} ${a}→${b}`).toEqual(to);
        }
      }
    }
  });

  it('a sweep cancelled midway by another stage change leaves the new target stage exactly', () => {
    for (const program of MOSAIC_PROGRAMS) {
      const s0 = states(program, 0);
      const s7 = states(program, 7);
      const s2 = states(program, 2);
      const first = sweepPlan(s0, s7, false);
      for (const t of [0, 1, first.duration / 3, first.duration / 2, first.duration - 1]) {
        const midway = stateAt(s0, first, t);
        // Midway is a mix: neither stage, unless nothing changed yet.
        if (t > 0 && t < first.duration - 1) expect(midway).not.toEqual(s7);
        const second = sweepPlan(midway, s2, false);
        expect(applySweep(midway, second)).toEqual(s2);
      }
    }
  });

  it('under reduced motion there is no stagger: every change at once', () => {
    const plan = sweepPlan(states('qtab', 0), states('qtab', 7), true);
    expect(plan.changes.length).toBeGreaterThan(0);
    expect(plan.changes.every((c) => c.delay === 0)).toBe(true);
    expect(plan.duration).toBe(0);
  });

  it('refuses grids of different sizes', () => {
    expect(() => sweepPlan(states('td', 0).slice(1), states('td', 1), false)).toThrow('99');
  });
});
