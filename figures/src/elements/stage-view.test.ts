import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { V5Data } from '../data';
import { formatScore, parseProgram, pctText, stageFrames } from './stage-view';

const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;

describe('parseProgram', () => {
  it('takes the three learning programs and refuses anything else', () => {
    for (const p of ['qtab', 'td', 'az100']) expect(parseProgram(p)).toBe(p);
    for (const bad of [null, '', 'az0', 'TD']) expect(() => parseProgram(bad)).toThrow();
  });
});

describe('formatScore', () => {
  it('writes the score as the data gives it and its interval to three decimals, per language', () => {
    expect(formatScore('fr', { score: 0.855, ci95: [0.823, 0.887] })).toBe('0,855 [0,823 ; 0,887]');
    expect(formatScore('en', { score: 0.855, ci95: [0.823, 0.887] })).toBe('0.855 [0.823, 0.887]');
    expect(formatScore('fr', { score: 0.0315, ci95: [0.023966732281239318, 0.039033267718760686] })).toBe(
      '0,0315 [0,024 ; 0,039]',
    );
    expect(formatScore('en', { score: 0.5, ci95: [0.48, 0.52] })).toBe('0.500 [0.480, 0.520]');
  });

  it('round 5’s last tabular stage reads as its document writes it', () => {
    const last = v5.programs.qtab.stages.at(-1)!;
    expect(formatScore('en', last)).toBe('0.178 [0.163, 0.193]');
  });

  it('percentages', () => {
    expect(pctText('fr', 25)).toBe('25 %');
    expect(pctText('en', 25)).toBe('25%');
  });
});

describe('stageFrames', () => {
  it('the stage’s replay ends as the data’s result says, for every stage of the three programs', () => {
    for (const program of ['qtab', 'td', 'az100'] as const) {
      for (const stage of v5.programs[program].stages) {
        const frames = stageFrames(stage);
        expect(frames).toHaveLength(stage.game.length + 1);
        const end = frames.at(-1)!;
        const code = stage.playerColour === 'White' ? 'W' : 'R';
        expect(end.result!.winner === code, `${program} ${stage.pct}`).toBe(stage.result === 'win');
      }
    }
  });

  it('refuses a game whose outcome disagrees with the data', () => {
    const stage = v5.programs.td.stages[0]!;
    expect(() => stageFrames({ ...stage, result: stage.result === 'win' ? 'loss' : 'win' })).toThrow();
    expect(() => stageFrames({ ...stage, game: stage.game.slice(0, -1) })).toThrow();
  });
});
