import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TableData } from '../data';
import { initial, key, legal, moveName, parseMoveName, play } from '../engine';
import { SHOWN_OPENING, openingChoices, replyChoices, replyGrid, verdictText } from './openings-verdicts';

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

describe('replyGrid', () => {
  it('shows the replies to c1-1-b1, a first move that keeps the draw', () => {
    expect(moveName(SHOWN_OPENING)).toBe('c1-1-b1');
    const g = replyGrid(table);
    expect(key(g.position)).toBe(key(play(initial(), SHOWN_OPENING)));
    expect(g.position.to_move).toBe('Red');
  });

  it('is what the letter’s picture showed: 2 replies of 16 keep the draw, 14 lose, in 8 to 22', () => {
    const g = replyGrid(table);
    // Recounted from the file itself, then compared.
    const raw = table.replies['c1-1-b1']!;
    expect(raw.filter((m) => m.verdict.kind === 'keeps-draw')).toHaveLength(2);
    expect(raw.filter((m) => m.verdict.kind === 'loses-in')).toHaveLength(14);
    expect(g.total).toBe(16);
    expect(g.keeps.map((x) => moveName(x.move))).toEqual(['a3-1-b3', 'c3-1-b3']);
    expect(g.loses).toHaveLength(14);
    const plies = g.loses.map((x) => (x.verdict.kind === 'loses-in' ? x.verdict.plies : NaN));
    expect(plies).toEqual([8, 10, 12, 12, 12, 12, 12, 14, 14, 16, 16, 18, 18, 22]);
  });

  it('orders the losses from the fastest to the slowest, equal ones as the table lists them', () => {
    const g = replyGrid(table);
    const order = table.replies['c1-1-b1']!.map((m) => moveName(m.move));
    for (let i = 1; i < g.loses.length; i++) {
      const [a, b] = [g.loses[i - 1]!, g.loses[i]!];
      const pa = a.verdict.kind === 'loses-in' ? a.verdict.plies : NaN;
      const pb = b.verdict.kind === 'loses-in' ? b.verdict.plies : NaN;
      expect(pa).toBeLessThanOrEqual(pb);
      if (pa === pb) expect(order.indexOf(moveName(a.move))).toBeLessThan(order.indexOf(moveName(b.move)));
    }
  });

  it('every card holds the position its reply leads to, and every legal reply has its card', () => {
    const g = replyGrid(table);
    const cards = [...g.keeps, ...g.loses];
    expect(names(cards)).toEqual(legal(g.position).map(moveName).sort());
    for (const c of cards) expect(key(c.after)).toBe(key(play(g.position, c.move)));
  });

  it('refuses a first move that loses, one whose replies include a win, and a move that is not a first move', () => {
    expect(() => replyGrid(table, parseMoveName('b1-2-b3'))).toThrow(/does not keep the draw/);
    const wins = JSON.parse(JSON.stringify(table)) as TableData;
    wins.replies['c1-1-b1']![0]!.verdict = { kind: 'wins-in', plies: 3 };
    expect(() => replyGrid(wins)).toThrow(/wins/);
    expect(() => replyGrid(table, parseMoveName('a3-1-b3'))).toThrow(/not a first move/);
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
});
