import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TableData } from '../data';
import { LC1_2, legal, play, replay, terminal } from '../engine';
import { QSTEPS_FIRST, QSTEPS_GAMES, QSTEPS_PREFIX, noteText, qSteps, signedNote } from './q-steps';

/**
 * The output of
 *   node tools/article-visuals/qsteps.mjs OUT '[[2,1,1],[7,2,1],[0,1,1],[6,1,3],[1,3,8],[3,1,0]]' '[1,1,0]' 6
 * run on 2026-11-16: per frame, the game, the row changed (- for none) and the notebook.
 */
const QSTEPS_MJS = `
0 - A=0,00 B=0,00 C1=0,00 C2=0,00
1 A A=0,00 B=0,00 C1=0,00 C2=0,00
1 B A=0,00 B=0,00 C1=0,00 C2=0,00
1 C1 A=0,00 B=0,00 C1=0,10 C2=0,00
1 - A=0,00 B=0,00 C1=0,10 C2=0,00
2 A A=0,00 B=0,00 C1=0,10 C2=0,00
2 B A=0,00 B=0,00 C1=0,10 C2=0,00
2 C2 A=0,00 B=0,00 C1=0,10 C2=0,10
2 - A=0,00 B=0,00 C1=0,10 C2=0,10
3 A A=0,00 B=0,00 C1=0,10 C2=0,10
3 B A=0,00 B=−0,01 C1=0,10 C2=0,10
3 C1 A=0,00 B=−0,01 C1=0,19 C2=0,10
3 - A=0,00 B=−0,01 C1=0,19 C2=0,10
4 A A=0,001 B=−0,01 C1=0,19 C2=0,10
4 B A=0,001 B=−0,02 C1=0,19 C2=0,10
4 C2 A=0,001 B=−0,02 C1=0,19 C2=0,19
4 - A=0,001 B=−0,02 C1=0,19 C2=0,19
5 A A=0,003 B=−0,02 C1=0,19 C2=0,19
5 B A=0,003 B=−0,04 C1=0,19 C2=0,19
5 C1 A=0,003 B=−0,04 C1=0,27 C2=0,19
5 - A=0,003 B=−0,04 C1=0,27 C2=0,19
6 A A=0,006 B=−0,04 C1=0,27 C2=0,19
6 B A=0,006 B=−0,05 C1=0,27 C2=0,19
6 C2 A=0,006 B=−0,05 C1=0,27 C2=0,27
6 - A=0,006 B=−0,05 C1=0,27 C2=0,27
`
  .trim()
  .split('\n');

describe('qSteps', () => {
  it('the q-steps walk equals qsteps.mjs’s values, frame for frame', () => {
    const { rows, frames } = qSteps();
    expect(rows).toEqual(['A', 'B', 'C1', 'C2']);
    const lines = frames.map((f) => `${f.game} ${f.changed ?? '-'} ${rows.map((r) => `${r}=${noteText('fr', f.notes[r]!)}`).join(' ')}`);
    expect(lines).toEqual(QSTEPS_MJS);
  });

  it('the endgame is the opening mistake of fig. 12, up to White’s move at A', () => {
    const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
    expect(QSTEPS_PREFIX).toEqual(table.lines.openingWin.slice(0, 6));
    expect(QSTEPS_FIRST).toEqual(table.lines.openingWin[6]);
    // From B every reply of Red leaves White a win in one: the walk refuses anything else.
    const B = replay([...QSTEPS_PREFIX, QSTEPS_FIRST]).at(-1)!;
    for (const m of legal(B)) expect(legal(play(B, m)).some((w) => terminal(play(play(B, m), w), LC1_2))).toBe(true);
  });

  it('one update per step: every update frame names its row, its mover and its arithmetic', () => {
    const { frames } = qSteps();
    expect(frames).toHaveLength(1 + QSTEPS_GAMES * 4);
    for (const f of frames.filter((x) => x.kind === 'update')) {
      const u = f.update!;
      expect(f.changed).toBe(u.name);
      expect(u.best).toBe(Math.max(...u.candidates.map((c) => c.q)));
      expect(u.after).toBeCloseTo(u.before + 0.1 * (u.best - u.before), 12);
      expect(f.notes[u.name]).toBe(u.after);
    }
    const ends = frames.filter((x) => x.kind === 'end');
    expect(ends.every((f) => f.winner === 'White')).toBe(true);
    // At A, White plays the line's move whatever the notebook says.
    expect(frames.filter((f) => f.update?.name === 'A').every((f) => f.move!.join() === QSTEPS_FIRST.join())).toBe(true);
  });

  it('refuses an endgame whose first move is illegal', () => {
    expect(() => qSteps(QSTEPS_PREFIX, [4, 3, 4], 1)).toThrow();
  });
});

describe('noteText', () => {
  it('writes values as qsteps.mjs does, in each language', () => {
    expect(noteText('fr', 0)).toBe('0,00');
    expect(noteText('fr', 0.0059)).toBe('0,006');
    expect(noteText('fr', -0.019)).toBe('−0,02');
    expect(noteText('en', -0.019)).toBe('−0.02');
    expect(noteText('fr', -0.0001)).toBe('0,000');
    expect(signedNote('fr', 1)).toBe('+1,00');
    expect(signedNote('en', -0.1)).toBe('−0.10');
    expect(signedNote('fr', 0)).toBe('0,00');
  });
});
