import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TableData, VerdictMove } from '../data';
import { initial, legal, moveName, parseMoveName, play } from '../engine';
import { choicesAfter, headLine, openingChoices, outcomes, outcomeText, replyChoices, verdictText } from './openings-verdicts';

const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
const names = (xs: { move: number[] }[]) => xs.map((x) => moveName(x.move as [number, number, number])).sort();

describe('openingChoices', () => {
  it('the six openings that keep the draw are the six table.json says, and all stay on White’s own row', () => {
    const c = openingChoices(table);
    expect(c.moves).toHaveLength(16);
    const draws = c.moves.filter((m) => m.verdict.kind === 'keeps-draw').map((m) => moveName(m.move));
    expect(draws).toEqual(['a1-1-b1', 'a1-2-c1', 'b1-1-a1', 'b1-1-c1', 'c1-1-b1', 'c1-2-a1']);
    expect(draws).toEqual(table.openings.filter((o) => o.verdict.kind === 'keeps-draw').map((o) => moveName(o.move)));
    // The essay: « seuls les six qui consistent à jouer sur sa propre rangée ».
    for (const d of draws) expect(parseMoveName(d)[2]).toBeLessThan(3);
    expect(outcomes(c.moves).draws).toBe(6);
    expect(c.mover).toBe('White');
  });

  it('are exactly the moves legal() gives from the start', () => {
    expect(names(openingChoices(table).moves)).toEqual(legal(initial()).map(moveName).sort());
  });
});

describe('replyChoices', () => {
  it('every reply list has the moves legal() gives after that opening', () => {
    for (const o of table.openings) {
      const c = replyChoices(table, o.move);
      expect(names(c.moves), moveName(o.move)).toEqual(legal(play(initial(), o.move)).map(moveName).sort());
      expect(c.mover).toBe('Red');
    }
  });

  it('not every opening has sixteen replies: 10 after b1-2-b3, 11 after a1-2-a3 and c1-2-c3', () => {
    const count = (n: string) => replyChoices(table, parseMoveName(n)).moves.length;
    expect(count('b1-2-b3')).toBe(10);
    expect(count('a1-2-a3')).toBe(11);
    expect(count('c1-2-c3')).toBe(11);
    expect(count('c1-1-b1')).toBe(16);
  });

  it('after c1-1-b1, two replies of sixteen keep the draw', () => {
    expect(outcomes(replyChoices(table, parseMoveName('c1-1-b1')).moves).draws).toBe(2);
  });

  it('refuses an opening the table has no replies for, and a list that disagrees with legal()', () => {
    expect(() => replyChoices({ ...table, replies: {} }, parseMoveName('a1-1-b1'))).toThrow();
    const short = { ...table, openings: table.openings.slice(1) };
    expect(() => openingChoices(short)).toThrow();
  });
});

describe('choicesAfter', () => {
  it('is the openings with nothing played, the replies after one opening', () => {
    expect(choicesAfter(table, null).mover).toBe('White');
    expect(choicesAfter(table, parseMoveName('a1-1-b1')).moves).toHaveLength(16);
  });
});

describe('words', () => {
  it('says each verdict in words, never a score', () => {
    expect(verdictText('fr', { kind: 'keeps-draw' })).toBe('garde la nulle');
    expect(verdictText('fr', { kind: 'loses-in', plies: 12 })).toBe('perd en 12');
    expect(verdictText('fr', { kind: 'wins-in', plies: 21 })).toBe('gagne en 21');
    expect(verdictText('en', { kind: 'loses-in', plies: 22 })).toBe('loses in 22');
    expect(verdictText('en', { kind: 'keeps-draw' })).toBe('holds the draw');
  });

  it('heads each list with every outcome it holds, wins, draws, losses, a zero one left out', () => {
    // The counts, recomputed from table.json itself before the words are checked.
    const count = (list: VerdictMove[]) => ({
      wins: list.filter((m) => m.verdict.kind === 'wins-in').length,
      draws: list.filter((m) => m.verdict.kind === 'keeps-draw').length,
      losses: list.filter((m) => m.verdict.kind === 'loses-in').length,
    });
    expect(count(table.openings)).toEqual({ wins: 0, draws: 6, losses: 10 });
    expect(count(table.replies['b1-2-b3']!)).toEqual({ wins: 2, draws: 0, losses: 8 });
    expect(count(table.replies['c1-1-b1']!)).toEqual({ wins: 0, draws: 2, losses: 14 });
    expect(headLine('fr', table, null)).toBe('Premiers coups des Blancs · 6 gardent la nulle, 10 perdent');
    expect(headLine('fr', table, parseMoveName('b1-2-b3'))).toBe('Réponses des Rouges à b1-2-b3 · 2 gagnent, 8 perdent');
    expect(headLine('fr', table, parseMoveName('c1-1-b1'))).toBe('Réponses des Rouges à c1-1-b1 · 2 gardent la nulle, 14 perdent');
    expect(headLine('en', table, parseMoveName('b1-2-b3'))).toBe('Red’s replies to b1-2-b3 · 2 win, 8 lose');
    expect(headLine('en', table, parseMoveName('a1-2-b2'))).toBe('Red’s replies to a1-2-b2 · 3 win, 2 hold the draw, 11 lose');
  });

  it('says one in the singular, in both languages', () => {
    const one: VerdictMove[] = [
      { move: [0, 1, 1], verdict: { kind: 'wins-in', plies: 3 } },
      { move: [0, 1, 3], verdict: { kind: 'keeps-draw' } },
      { move: [0, 2, 2], verdict: { kind: 'loses-in', plies: 4 } },
    ];
    expect(outcomeText('fr', one)).toBe('1 gagne, 1 garde la nulle, 1 perd');
    expect(outcomeText('en', one)).toBe('1 wins, 1 holds the draw, 1 loses');
  });
});
