import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { V5Data } from '../data';
import { parseProgram, pctText, stageFrames, stagesSource } from './stage-view';

const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;

describe('parseProgram', () => {
  it('takes the three learning programs and refuses anything else', () => {
    for (const p of ['qtab', 'td', 'az100']) expect(parseProgram(p)).toBe(p);
    for (const bad of [null, '', 'az0', 'TD']) expect(() => parseProgram(bad)).toThrow();
  });
});

describe('pctText', () => {
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

  it('uses the opening the data gives, and refuses one that is not a part of the game', () => {
    const stage = v5.programs.qtab.stages[0]!;
    expect(stage.openingPlies).toBe(4);
    for (const bad of [-1, 1.5, stage.game.length, Number.NaN]) expect(() => stageFrames({ ...stage, openingPlies: bad })).toThrow();
    expect(stageFrames({ ...stage, openingPlies: 0 })).toHaveLength(stage.game.length + 1);
  });
});

describe('stagesSource', () => {
  it('cites the data’s source and the one directory of the games replayed', () => {
    for (const program of ['qtab', 'td', 'az100'] as const) {
      expect(stagesSource(v5, v5.programs[program].stages)).toBe(`${v5.source} · docs/experiments/v5/games/`);
    }
  });

  it('refuses games that do not share one directory', () => {
    const [a, b] = v5.programs.td.stages;
    const moved = { ...b!, source: { ...b!.source, game: 'elsewhere/td-s1-p001.json' } };
    expect(() => stagesSource(v5, [a!, moved])).toThrow();
    expect(() => stagesSource(v5, [])).toThrow();
  });
});
