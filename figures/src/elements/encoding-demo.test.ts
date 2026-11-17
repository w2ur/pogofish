import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { key, LC1_2, legal, replay, terminal, type Triple } from '../engine';
import { createStore } from '../store';
import { DEMO_MOVES, encodingDemo } from './encoding-demo';
import { DEFAULT_PLY, defaultPosition, netPosition } from './net-position';

describe('the encoding’s demonstration', () => {
  it('starts on the position <pogo-net> shows first when the reader has no game', () => {
    const store = createStore({ storage: null, loadEngine: () => Promise.resolve() });
    expect(key(defaultPosition())).toBe(key(netPosition(store).state));
    expect(key(encodingDemo().states[0]!)).toBe(key(defaultPosition()));
  });

  it('plays the next moves of the default game, each legal, and never ends the game', () => {
    const d = encodingDemo();
    expect(d.moves).toHaveLength(DEMO_MOVES);
    expect(d.states).toHaveLength(DEMO_MOVES + 1);
    const game = replay(DEFAULT_GAME as Triple[]);
    d.states.forEach((s, i) => {
      expect(key(s)).toBe(key(game[DEFAULT_PLY + i]!));
      expect(terminal(s, LC1_2)).toBe(false);
    });
    d.moves.forEach((m, i) => {
      expect(legal(d.states[i]!).some((l) => l.from_cell === m[0] && l.num_pieces === m[1] && l.to_cell === m[2])).toBe(true);
    });
  });

  it('shows the turn passing each time, so the grid flips with every move', () => {
    const d = encodingDemo();
    // Two moves: the turn passes, and passes back.
    expect(d.states.map((s) => s.to_move)).toEqual(['Red', 'White', 'Red']);
  });
});
