import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TableData } from '../data';
import { LC1_2, initial, key, terminal } from '../engine';
import { lineFrames, parseLine, parseRules, seenText } from './line-frames';

const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
const tops = (cells: string[][]) => cells.filter((s) => s.length > 0).map((s) => s[s.length - 1]);

describe('parseRules', () => {
  it('maps "A" to game A (null, which engine.ts sends as Uncapped) and "lc1-2" to the repetition rule', () => {
    expect(parseRules('A')).toBeNull();
    expect(parseRules('lc1-2')).toEqual(LC1_2);
    // Game A reaches the engine without breaking it: the loop repeated is not terminal there.
    const { frames } = lineFrames([...table.lines.loop, ...table.lines.loop, ...table.lines.loop], parseRules('A'));
    expect(terminal(frames.at(-1)!.state, parseRules('A'))).toBe(false);
  });

  it('refuses anything else, so a typo shows the fallback rather than the wrong game', () => {
    for (const bad of [null, '', 'a', 'B', 'lc1']) expect(() => parseRules(bad)).toThrow();
    expect(parseLine('loop')).toBe('loop');
    expect(() => parseLine('openingwin')).toThrow();
  });
});

describe('lineFrames', () => {
  it('centreLoss ends with every stack Red', () => {
    const { frames, cyclic } = lineFrames(table.lines.centreLoss, null);
    expect(cyclic).toBe(false);
    expect(frames).toHaveLength(13);
    const end = frames.at(-1)!;
    expect(new Set(tops(end.state.cells))).toEqual(new Set(['Red']));
    expect(end.result).toEqual({ winner: 'R', byRepetition: false });
    expect(frames.slice(0, -1).every((f) => f.result === null)).toBe(true);
  });

  it('one frame per ply: the move, its mover, the position after it', () => {
    const { frames } = lineFrames(table.lines.shortestWin, null);
    expect(frames.map((f) => f.ply)).toEqual([0, 1, 2, 3]);
    expect(frames[0]!.move).toBeUndefined();
    expect(frames.slice(1).map((f) => f.mover)).toEqual(['White', 'Red', 'White']);
    expect(frames[1]!.move).toEqual([1, 2, 7]);
    expect(frames.at(-1)!.result).toEqual({ winner: 'W', byRepetition: false });
  });

  it('under game A the loop is one cycle that plays on without end, and counts nothing', () => {
    const { frames, cyclic } = lineFrames(table.lines.loop, null);
    expect(cyclic).toBe(true);
    expect(frames).toHaveLength(5);
    expect(key(frames[4]!.state)).toBe(key(initial()));
    expect(frames.every((f) => f.seen === null && f.result === null)).toBe(true);
  });

  it('under lc1-2 the loop counts repetitions and ends at the third, Red losing by it', () => {
    const { frames, cyclic } = lineFrames(table.lines.loop, LC1_2);
    expect(cyclic).toBe(false);
    expect(frames).toHaveLength(9);
    expect(frames.map((f) => f.seen)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3]);
    expect(frames.at(-1)!.result).toEqual({ winner: 'W', byRepetition: true });
    expect(frames.at(-1)!.mover).toBe('Red');
  });

  it('a line that does not repeat counts no repetition under lc1-2 and ends as under game A', () => {
    for (const name of ['shortestWin', 'centreLoss', 'openingWin'] as const) {
      const a = lineFrames(table.lines[name], null).frames;
      const b = lineFrames(table.lines[name], LC1_2).frames;
      expect(b.map((f) => f.seen)).toEqual(b.map(() => 1));
      expect(b.at(-1)!.result).toEqual(a.at(-1)!.result);
    }
  });
});

describe('seenText', () => {
  it('says the occurrence in each language', () => {
    expect(seenText('fr', 2)).toBe('Cette position pour la 2e fois');
    expect(seenText('en', 3)).toBe('This position for the 3rd time');
    expect(seenText('en', 2)).toBe('This position for the 2nd time');
    expect(seenText('en', 11)).toBe('This position for the 11th time');
  });
});

