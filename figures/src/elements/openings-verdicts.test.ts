import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TableData } from '../data';
import { initial, key, legal, moveName, parseMoveName, play } from '../engine';
import { openingChoices, outcome, outcomeText, replyChoices, verdictOf } from './openings-verdicts';

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

  it('refuses an opening the table has no replies for, and a list that disagrees with legal()', () => {
    expect(() => replyChoices({ ...table, replies: {} }, parseMoveName('a1-1-b1'))).toThrow();
    const short = { ...table, openings: table.openings.slice(1) };
    expect(() => openingChoices(short)).toThrow();
  });
});

describe('the essay’s claim on the first move', () => {
  // « Sur les seize premiers coups possibles, seuls les six qui consistent à jouer sur sa propre rangée
  // évitent la défaite. » Checked both ways: on the row ⇒ avoids defeat, and avoids defeat ⇒ on the row.
  it('of the sixteen first moves, the six played on one’s own row are exactly those that avoid defeat', () => {
    const c = openingChoices(table);
    expect(c.moves).toHaveLength(16);
    const ownRow = (to: number): boolean => Math.floor(to / 3) === 0;
    const onRow = c.moves.filter((m) => ownRow(m.move[2])).map((m) => moveName(m.move)).sort();
    const avoid = c.moves.filter((m) => outcome('White', m.verdict).kind === 'avoids').map((m) => moveName(m.move)).sort();
    expect(onRow).toHaveLength(6);
    expect(avoid).toEqual(onRow);
    // The other ten lose: none of them wins.
    expect(c.moves.filter((m) => !ownRow(m.move[2])).every((m) => m.verdict.kind === 'loses-in')).toBe(true);
  });
});

describe('verdictOf', () => {
  it('reads the verdict of the reader’s first move, then of the reply, from the table', () => {
    expect(verdictOf(table, [parseMoveName('a1-2-b2')])).toEqual({ kind: 'loses-in', plies: 12 });
    expect(verdictOf(table, [parseMoveName('a1-2-b2'), parseMoveName('a3-2-b2')])).toEqual({ kind: 'wins-in', plies: 11 });
    expect(verdictOf(table, [parseMoveName('c1-1-b1'), parseMoveName('a3-1-b3')])).toEqual({ kind: 'keeps-draw' });
  });

  it('refuses a move the table does not list, and a third move', () => {
    expect(() => verdictOf(table, [parseMoveName('a3-1-b3')])).toThrow();
    const a = parseMoveName('c1-1-b1');
    expect(() => verdictOf(table, [a, parseMoveName('a1-1-a2')])).toThrow();
    expect(() => verdictOf(table, [a, parseMoveName('a3-1-b3'), a])).toThrow();
  });
});

describe('outcome', () => {
  it('counts the moves the winner needs after the move played: the table counts the move itself', () => {
    expect(outcome('White', { kind: 'loses-in', plies: 12 })).toEqual({ kind: 'loses', winner: 'Red', moves: 11 });
    expect(outcome('Red', { kind: 'wins-in', plies: 11 })).toEqual({ kind: 'wins', winner: 'Red', moves: 10 });
    expect(outcome('Red', { kind: 'keeps-draw' })).toEqual({ kind: 'avoids' });
  });

  it('the count is the game’s: Red’s forced win after White’s centre opening is the rest of the solved line', () => {
    const line = table.lines.centreLoss;
    const first = verdictOf(table, [line[0]!]);
    const o = outcome('White', first);
    expect(o.kind).toBe('loses');
    // The line plays the whole forced win: every move after White's first.
    expect(o.kind === 'loses' && o.moves).toBe(line.length - 1);
    const reply = outcome('Red', verdictOf(table, [line[0]!, line[1]!]));
    expect(reply.kind === 'wins' && reply.moves).toBe(line.length - 2);
  });
});

describe('outcomeText', () => {
  it('says it in the essay’s words: avoids defeat and a game without end, or who forces the win, in how many moves', () => {
    expect(outcomeText('fr', 'White', { kind: 'keeps-draw' })).toBe('Évite la défaite : la partie peut continuer sans fin.');
    expect(outcomeText('fr', 'White', { kind: 'loses-in', plies: 12 })).toBe('Perd : les Rouges forcent la victoire en 11 coups.');
    expect(outcomeText('fr', 'Red', { kind: 'wins-in', plies: 11 })).toBe('Gagne : les Rouges forcent la victoire en 10 coups.');
    expect(outcomeText('fr', 'Red', { kind: 'loses-in', plies: 2 })).toBe('Perd : les Blancs forcent la victoire en 1 coup.');
    expect(outcomeText('en', 'White', { kind: 'keeps-draw' })).toBe('Avoids defeat: the game can go on without end.');
    expect(outcomeText('en', 'White', { kind: 'loses-in', plies: 12 })).toBe('Loses: Red forces the win in 11 moves.');
    expect(outcomeText('en', 'Red', { kind: 'loses-in', plies: 2 })).toBe('Loses: White forces the win in 1 move.');
  });

  it('never says « nulle »: the essay speaks of a game without end', () => {
    for (const lang of ['fr', 'en'] as const) {
      for (const v of [{ kind: 'keeps-draw' as const }, { kind: 'loses-in' as const, plies: 5 }, { kind: 'wins-in' as const, plies: 5 }]) {
        expect(outcomeText(lang, 'White', v)).not.toMatch(/nulle|draw/i);
      }
    }
  });
});
