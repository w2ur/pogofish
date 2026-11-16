import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME } from './default-game';
import { initial, legal, replay, type Move, type State, type Triple } from './engine';
import {
  SCREEN_ORDER,
  announceMove,
  chooseCount,
  counts,
  describeCell,
  destinations,
  formatStrength,
  neighbour,
  origins,
  resultText,
  tap,
  type Selection,
} from './board-state';
import { createStore } from './store';

const asTriple = (m: Move): Triple => [m.from_cell, m.num_pieces, m.to_cell];
// a1 holds a single White, b1 a stack of three topped by White: counts differ by stack.
const S: State = {
  cells: [['White'], ['Red', 'Red', 'White'], [], ['White', 'Red'], [], ['White'], ['Red'], [], ['White', 'Red']],
  to_move: 'White',
  move_count: 4,
  history: [],
};
const moves = legal(S);

describe('the move-selection state machine', () => {
  it('only stacks topped by the reader with a legal move can be lifted', () => {
    const own = S.cells.flatMap((st, i) => (st.at(-1) === 'White' ? [i] : []));
    expect(origins(moves)).toEqual(own.filter((i) => moves.some((m) => m.from_cell === i)));
    expect(origins(moves)).not.toContain(3);
    expect(tap(null, moves, 3)).toEqual({ selection: null });
    expect(tap(null, [], 0)).toEqual({ selection: null });
  });

  it('lifting offers only the counts with a destination, the smallest chosen', () => {
    expect(counts(moves, 0)).toEqual([1]);
    expect(counts(moves, 1)).toEqual(counts(moves, 1).filter((n) => moves.some((m) => m.from_cell === 1 && m.num_pieces === n)));
    expect(counts(moves, 1).length).toBeGreaterThan(1);
    expect(tap(null, moves, 1)).toEqual({ selection: { from: 1, count: counts(moves, 1)[0] } });
  });

  it('destinations are exactly the legal moves for the stack and count', () => {
    for (const from of origins(moves)) {
      for (const n of counts(moves, from)) {
        const expected = moves.filter((m) => m.from_cell === from && m.num_pieces === n).map((m) => m.to_cell);
        expect(destinations(moves, from, n)).toEqual([...new Set(expected)].sort());
      }
    }
  });

  it('a tap on a destination plays the move; every move offered is legal', () => {
    for (const from of origins(moves)) {
      for (const n of counts(moves, from)) {
        let sel: Selection = (tap(null, moves, from) as { selection: Selection }).selection;
        sel = chooseCount(sel, moves, n);
        for (const to of destinations(moves, from, n)) {
          const result = tap(sel, moves, to);
          expect(result).toEqual({ play: [from, n, to] });
          expect(moves.map(asTriple)).toContainEqual([from, n, to]);
        }
      }
    }
  });

  it('tapping the origin again cancels; another own stack switches; an inert cell keeps the selection', () => {
    const sel: Selection = { from: 1, count: counts(moves, 1)[0]! };
    expect(tap(sel, moves, 1)).toEqual({ selection: null });
    // A destination wins over switching: a stack the reader owns that the lifted pieces could reach is a landing.
    const reachable = destinations(moves, 1, sel.count);
    const other = origins(moves).find((c) => c !== 1 && !reachable.includes(c))!;
    expect(other).toBeDefined();
    expect(tap(sel, moves, other)).toEqual({ selection: { from: other, count: counts(moves, other)[0] } });
    const ownAndReachable = origins(moves).find((c) => c !== 1 && reachable.includes(c))!;
    expect(tap(sel, moves, ownAndReachable)).toEqual({ play: [1, sel.count, ownAndReachable] });
    const inert = [0, 1, 2, 3, 4, 5, 6, 7, 8].find(
      (c) => c !== 1 && !origins(moves).includes(c) && !destinations(moves, 1, sel.count).includes(c),
    )!;
    expect(tap(sel, moves, inert)).toEqual({ selection: sel });
  });

  it('a count that cannot move is ignored', () => {
    const sel: Selection = { from: 0, count: 1 };
    expect(chooseCount(sel, moves, 3)).toBe(sel);
    expect(chooseCount(null, moves, 1)).toBeNull();
    const n = counts(moves, 1).at(-1)!;
    expect(chooseCount({ from: 1, count: 1 }, moves, n)).toEqual({ from: 1, count: n });
  });

  it('with no moves (the AI to move), nothing can be lifted', () => {
    for (let c = 0; c < 9; c++) expect(tap(null, [], c)).toEqual({ selection: null });
  });
});

describe('keyboard', () => {
  it('arrows move on the board as seen, rank 1 at the bottom, and stop at the edge', () => {
    expect(neighbour(0, 'ArrowUp')).toBe(3);
    expect(neighbour(0, 'ArrowDown')).toBe(0);
    expect(neighbour(0, 'ArrowLeft')).toBe(0);
    expect(neighbour(0, 'ArrowRight')).toBe(1);
    expect(neighbour(8, 'ArrowUp')).toBe(8);
    expect(neighbour(8, 'ArrowRight')).toBe(8);
    expect(neighbour(4, 'ArrowDown')).toBe(1);
    expect(neighbour(4, 'Tab')).toBe(4);
    expect(SCREEN_ORDER).toEqual([6, 7, 8, 3, 4, 5, 0, 1, 2]);
  });
});

describe('the words of the board', () => {
  it('names a cell by coordinate and content, in the element’s language', () => {
    expect(describeCell('fr', initial(), 0, null)).toBe('a1 : pile de 2, sommet blanc');
    expect(describeCell('en', initial(), 0, null)).toBe('a1: stack of 2, White on top');
    expect(describeCell('en', initial(), 4, null)).toBe('b2: empty');
    expect(describeCell('en', S, 1, 'selected')).toBe('b1: stack of 3, White on top, lifted');
    expect(describeCell('fr', S, 4, 'target')).toBe('b2 : vide, destination possible');
  });

  it('announces a move as « Rouge joue b3-2-b1 »', () => {
    expect(announceMove('fr', 'Red', [7, 2, 1])).toBe('Rouge joue b3-2-b1');
    expect(announceMove('en', 'White', [0, 1, 1])).toBe('White plays a1-1-b1');
  });

  it('says who won and how: every stack, or the repetition rule and who repeated', () => {
    const store = createStore({ storage: null });
    store.newGame('Red', 'normal');
    for (const m of DEFAULT_GAME) store.play(m);
    expect(resultText('fr', store.current()!)).toEqual({
      who: 'Blanc gagne',
      how: 'Toutes les piles ont un sommet blanc.',
      you: 'L’IA gagne.',
    });
    const loop: Triple[] = [[0, 1, 1], [6, 1, 3], [1, 1, 0], [3, 1, 6]];
    store.newGame('White', 'normal');
    for (const m of [...loop, ...loop]) store.play(m);
    expect(resultText('en', store.current()!)).toEqual({
      who: 'White wins',
      how: 'Red repeated a position three times.',
      you: 'You win.',
    });
    store.newGame('White', 'normal');
    expect(resultText('en', store.current()!)).toBeNull();
    expect(replay(loop)).toHaveLength(5);
  });

  it('writes the net’s measured strength with each language’s decimals', () => {
    expect(formatStrength('fr')).toBe('85,5\u202f% [82,3\u202f; 88,7]');
    expect(formatStrength('en')).toBe('85.5% [82.3; 88.7]');
  });
});
