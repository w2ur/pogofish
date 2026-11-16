import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { LC1_2, initial, key, replay, terminal } from '../engine';
import { createStore } from '../store';
import { DEFAULT_PLY, netPosition, positionWords } from './net-position';

const make = () => createStore({ storage: null, loadEngine: () => Promise.resolve() });

describe('the position the net figures show', () => {
  it('with no game, it is the default game after three moves, the essay’s original position', () => {
    const p = netPosition(make());
    expect(DEFAULT_PLY).toBe(3);
    expect(p).toMatchObject({ source: 'default', ply: 3, beforeEnd: false });
    expect(key(p.state)).toBe(key(replay(DEFAULT_GAME.slice(0, 3) as [number, number, number][])[3]!));
    expect(positionWords('fr', p)).toBe('Position : l’erreur d’ouverture, après 3 coups.');
    expect(positionWords('en', p)).toBe('Position: the opening mistake, after 3 moves.');
  });

  it('with a game under way, it is the reader’s board right now', () => {
    const store = make();
    store.newGame('White', 'normal');
    expect(netPosition(store)).toMatchObject({ source: 'reader', ply: 0 });
    expect(positionWords('fr', netPosition(store))).toBe('Position : votre partie, au départ.');
    store.play(DEFAULT_GAME[0]!);
    const p = netPosition(store);
    expect(p).toMatchObject({ source: 'reader', ply: 1 });
    expect(p.state).toBe(store.current()!.states[1]);
    expect(positionWords('en', p)).toBe('Position: your game, after 1 move.');
  });

  it('a finished game gives its last position before the end, and says so', () => {
    const store = make();
    store.newGame('White', 'normal');
    for (const m of DEFAULT_GAME) store.play(m);
    const p = netPosition(store);
    expect(p).toMatchObject({ source: 'reader', ply: 8, beforeEnd: true });
    expect(terminal(p.state, LC1_2)).toBe(false);
    expect(positionWords('fr', p)).toBe('Position : votre partie, après 8 coups, la dernière position avant la fin.');
  });

  it('never hands back the initial object of the default line twice mutated', () => {
    const a = netPosition(make());
    const b = netPosition(make());
    expect(a.state).not.toBe(initial());
    expect(key(a.state)).toBe(key(b.state));
  });
});
