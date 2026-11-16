import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { createStore } from '../store';
import { parseTd } from '../nets';
import { lambdaReturns } from '../players';
import { TD_LAMBDA, tdGame, tdWalk, tdFrame } from './td-walk';

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as {
  openingWin: { first: number; outcome: number; lambda: number; returns: number[] };
  positions: { td: number }[];
};
const b = readFileSync(resolve(process.cwd(), 'public/nets/td-s1.pfv'));
const td = parseTd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const make = () => createStore({ storage: null, loadEngine: () => Promise.resolve() });
const LOOP = [
  [0, 1, 1],
  [6, 1, 3],
  [1, 1, 0],
  [3, 1, 6],
] as [number, number, number][];

describe('the TD(λ) targets', () => {
  it('λ is the trainer’s, as the fixture records it', () => {
    expect(TD_LAMBDA).toBe(fixture.openingWin.lambda);
  });

  it('pogo-td-targets uses lastFinished when there is one, DEFAULT_GAME otherwise', () => {
    const store = make();
    const none = tdGame(store);
    expect(none.source).toBe('default');
    expect(none.moves).toEqual(DEFAULT_GAME);
    expect(none.states).toHaveLength(DEFAULT_GAME.length + 1);
    // A game under way is not finished: still the default.
    store.newGame('Red', 'easy');
    store.play(LOOP[0]!);
    expect(tdGame(store).source).toBe('default');
    for (const m of [...LOOP.slice(1), ...LOOP]) store.play(m);
    const mine = tdGame(store);
    expect(mine.source).toBe('reader');
    expect(mine.states).toBe(store.lastFinished()!.states);
    expect(mine.result).toBe('W');
  });

  it('the λ-returns shown equal lambdaReturns over the net’s values, and the fixture’s', () => {
    const w = tdWalk(tdGame(make()).states, (s) => td.value(s));
    const T = DEFAULT_GAME.length;
    expect(w.values).toHaveLength(T + 1);
    // The net's value at every position but the last, which is the outcome for its mover.
    w.values.slice(0, T).forEach((v, t) => expect(Math.abs(v - fixture.positions[fixture.openingWin.first + t]!.td)).toBeLessThanOrEqual(1e-5));
    expect(w.values[T]).toBe(fixture.openingWin.outcome);
    expect(w.returns).toEqual(lambdaReturns(w.values, TD_LAMBDA));
    w.returns.forEach((g, t) => expect(Math.abs(g - fixture.openingWin.returns[t]!)).toBeLessThanOrEqual(1e-5));
  });

  it('from White’s view each target is λ × the next target + (1 − λ) × the next value, as the essay says', () => {
    const w = tdWalk(tdGame(make()).states, (s) => td.value(s));
    const T = w.values.length - 1;
    const next = (t: number) => (t + 1 === T ? w.white.notes[T]! : w.white.targets[t + 1]!);
    for (let t = 0; t < T; t++) expect(w.white.targets[t]).toBeCloseTo(TD_LAMBDA * next(t) + (1 - TD_LAMBDA) * w.white.notes[t + 1]!, 12);
    // White wins the default game: +1 at the end, from White's view.
    expect(w.white.notes[T]).toBe(1);
  });

  it('steps backwards: none known, then the last position’s target, up to the first', () => {
    const w = tdWalk(tdGame(make()).states, (s) => td.value(s));
    const T = w.values.length - 1;
    expect(tdFrame(w, 0)).toEqual({ current: null, known: [] });
    expect(tdFrame(w, 1)).toEqual({ current: T - 1, known: [T - 1] });
    expect(tdFrame(w, T)).toEqual({ current: 0, known: Array.from({ length: T }, (_, i) => T - 1 - i) });
    expect(tdFrame(w, T + 1)).toEqual({ current: null, known: Array.from({ length: T }, (_, i) => T - 1 - i) });
  });

  it('refuses a game that has not ended', () => {
    const store = make();
    store.newGame('White', 'normal');
    store.play(DEFAULT_GAME[0]!);
    expect(() => tdWalk(store.current()!.states, () => 0)).toThrow(/^pogo-figures: /);
  });
});
