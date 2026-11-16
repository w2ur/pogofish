import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { V5Data } from '../data';
import { MOSAIC_COLUMNS, MOSAIC_PROGRAMS, gameMark, mosaicStages } from './mosaic-grid';

const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;

describe('mosaicStages', () => {
  it('mosaic has 100 squares per stage, one per game, in the data’s order', () => {
    for (const program of MOSAIC_PROGRAMS) {
      const stages = mosaicStages(v5, program);
      expect(stages.map((s) => s.pct)).toEqual(v5.stagesPct);
      stages.forEach((s, i) => {
        const games = v5.mosaics[program][i]!.games;
        expect(s.squares).toHaveLength(100);
        expect(s.squares.map((q) => q.result)).toEqual(games.map((g) => g.result));
        s.squares.forEach((q, k) => {
          expect([q.col, q.row]).toEqual([k % MOSAIC_COLUMNS, Math.floor(k / MOSAIC_COLUMNS)]);
          expect(q.mark).toBe(gameMark(games[k]!));
        });
      });
    }
  });

  it('each stage’s wins and mistake share equal the sums of its games', () => {
    for (const program of MOSAIC_PROGRAMS) {
      mosaicStages(v5, program).forEach((s, i) => {
        const games = v5.mosaics[program][i]!.games;
        const mistakes = games.reduce((a, g) => a + g.mistakes, 0);
        const judged = games.reduce((a, g) => a + g.judged, 0);
        expect(s.wins).toBe(games.filter((g) => g.result === 'win').length);
        expect(s.games).toBe(100);
        expect([s.mistakes, s.judged]).toEqual([mistakes, judged]);
        expect(s.share).toBe(mistakes / judged);
        expect(s.mistakenGames).toBe(games.filter((g) => g.mistakes > 0).length);
        expect(s.noneJudgedGames).toBe(games.filter((g) => g.judged === 0).length);
      });
    }
    // The totals the tools printed (docs/experiments/v5-video.md, addendum 2 results): AlphaZero 19 won, 52 %
    // mistakes → 90 won, 2 %; TD 5 won, 55 % → 77 won, 8 %; the tabular learner 5 won, 72 % → 16 won, 56 %.
    const ends = (p: (typeof MOSAIC_PROGRAMS)[number]) => {
      const s = mosaicStages(v5, p);
      return [s[0]!, s.at(-1)!].map((x) => [x.wins, Math.round(x.share * 100)]);
    };
    expect(ends('az100')).toEqual([[19, 52], [90, 2]]);
    expect(ends('td')).toEqual([[5, 55], [77, 8]]);
    expect(ends('qtab')).toEqual([[5, 72], [16, 56]]);
  });

  it('marks a game by what was judged of the program’s moves', () => {
    expect(gameMark({ result: 'win', mistakes: 2, judged: 9 })).toBe('mistake');
    expect(gameMark({ result: 'win', mistakes: 0, judged: 9 })).toBe('clean');
    expect(gameMark({ result: 'loss', mistakes: 0, judged: 0 })).toBe('none-judged');
  });

  it('takes each stage’s games trained and bench score from the program’s own stage', () => {
    for (const program of MOSAIC_PROGRAMS) {
      mosaicStages(v5, program).forEach((s, i) => {
        const st = v5.programs[program].stages[i]!;
        expect([s.gamesTrained, s.score, s.ci95]).toEqual([st.gamesTrained, st.score, st.ci95]);
      });
    }
  });

  it('refuses a stage that is not 100 games, or counts that cannot be', () => {
    const short = structuredClone(v5);
    short.mosaics.td[2]!.games.pop();
    expect(() => mosaicStages(short, 'td')).toThrow('100');
    const over = structuredClone(v5);
    over.mosaics.az100[0]!.games[0] = { result: 'win', mistakes: 3, judged: 2 };
    expect(() => mosaicStages(over, 'az100')).toThrow('az100');
    const shifted = structuredClone(v5);
    shifted.mosaics.qtab[1]!.pct = 3;
    expect(() => mosaicStages(shifted, 'qtab')).toThrow('qtab');
  });
});

