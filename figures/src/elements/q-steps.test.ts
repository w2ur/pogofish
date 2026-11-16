import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TableData } from '../data';
import { LC1_2, legal, play, replay, terminal } from '../engine';
import { QSTEPS_FIRST, QSTEPS_GAMES, QSTEPS_PREFIX, Q_PHASES, firstGames, moveGroups, notebookColumns, notesAt, noteText, qScript, qSteps, signedNote } from './q-steps';

/**
 * The output of
 *   node tools/article-visuals/qsteps.mjs OUT '[[2,1,1],[7,2,1],[0,1,1],[6,1,3],[1,3,8],[3,1,0]]' '[1,1,0]' 6
 * run on 2026-11-16: per frame, the game, the row changed (- for none) and the notebook; its first five games
 * (the walk is deterministic, so the sixth changes nothing before it).
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

describe('the script the figure plays', () => {
  const walk = qSteps();
  const script = qScript(walk);

  it('plays slowly, in the essay’s five sub-steps, the first update that changes a C, then B, then A', () => {
    const slow = script.filter((s) => s.phase === 'look').map((s) => `${walk.frames[s.frame]!.game}${walk.frames[s.frame]!.update!.name}`);
    expect(slow).toEqual(['1C1', '3B', '4A']);
    for (const s of script.filter((x) => x.phase === 'look')) {
      const at = script.indexOf(s);
      expect(script.slice(at, at + 5).map((x) => x.phase)).toEqual([...Q_PHASES]);
      expect(script.slice(at, at + 5).every((x) => x.frame === s.frame && x.slow)).toBe(true);
    }
    // Every frame of the walk is played, in order, and the whole first game is held long.
    expect([...new Set(script.map((s) => s.frame))]).toEqual(walk.frames.map((_, i) => i));
    expect(script.filter((s) => walk.frames[s.frame]!.game <= 1).every((s) => s.slow)).toBe(true);
    expect(script.filter((s) => walk.frames[s.frame]!.game === 5).some((s) => s.slow)).toBe(false);
  });

  it('counts each step within its game', () => {
    const game1 = script.filter((s) => walk.frames[s.frame]!.game === 1);
    expect(game1.map((s) => s.at)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(game1.every((s) => s.of === 8)).toBe(true);
    expect(script.filter((s) => walk.frames[s.frame]!.game === 2).map((s) => `${s.at}/${s.of}`)).toEqual(['1/4', '2/4', '3/4', '4/4']);
  });

  it('the notebook keeps the old note until the update is written', () => {
    const look = script.find((s) => s.phase === 'look')!;
    const write = script.find((s) => s.phase === 'write')!;
    expect(notesAt(walk, look).C1).toBe(0);
    expect(notesAt(walk, { ...look, phase: 'formula' }).C1).toBe(0);
    expect(notesAt(walk, write).C1).toBeCloseTo(0.1, 12);
  });

  it('groups the moves: one row per notebook position, the winning moves, the others', () => {
    const at = (game: number, name: string) => walk.frames.find((f) => f.game === game && f.update?.name === name)!.update!;
    expect(moveGroups(at(1, 'A')).map((g) => `${g.kind}:${g.to ?? g.count}:${g.q}`)).toEqual(['to:B:0', 'unseen:21:0']);
    expect(moveGroups(at(2, 'B')).map((g) => `${g.kind}:${g.to}:${g.q}`)).toEqual(['to:C1:-0.1', 'to:C2:0']);
    expect(moveGroups(at(1, 'C1')).map((g) => `${g.kind}:${g.count}:${g.q}`)).toEqual(['win:2:1', 'unseen:24:0']);
    // Every move of an update is in exactly one group, and the best value is a group's.
    for (const f of walk.frames.filter((x) => x.update)) {
      const groups = moveGroups(f.update!);
      expect(groups.reduce((n, g) => n + g.count, 0)).toBe(f.update!.candidates.length);
      expect(Math.max(...groups.map((g) => g.q))).toBe(f.update!.best + 0);
    }
  });

  it('« la valeur des positions gagnantes s’est propagée vers les positions qui y mènent »: one position further back at each game', () => {
    expect(firstGames(walk)).toEqual({ C1: 1, C2: 2, B: 3, A: 4 });
    const columns = notebookColumns(walk);
    expect(columns).toHaveLength(QSTEPS_GAMES + 1);
    expect(Object.values(columns[0]!).every((v) => v === 0)).toBe(true);
    expect(Object.values(columns.at(-1)!).every((v) => v !== 0)).toBe(true);
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
