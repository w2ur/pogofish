import fc from 'fast-check';
import { initial, legal, moveName, play, replay, type Triple } from '../engine';
import { FAN_FROM, FAN_PRELUDE, fan, fanFrames, kindsOf, movePath } from './moves-demo';

const rc = (i: number): [number, number] => [i % 3, Math.floor(i / 3)];
const adjacent = (a: number, b: number): boolean => {
  const [x1, y1] = rc(a);
  const [x2, y2] = rc(b);
  return Math.abs(x1 - x2) + Math.abs(y1 - y2) === 1;
};

describe('the moves of <pogo-moves view="moves">: every move from one stack, by count', () => {
  it('reaches its position by legal moves from the start, and the stack is the mover’s, three high', () => {
    let s = initial();
    for (const m of FAN_PRELUDE) {
      expect(legal(s).map(moveName)).toContain(moveName(m));
      s = play(s, m);
    }
    const f = fan();
    expect(f.state).toEqual(s);
    expect(f.from).toBe(FAN_FROM);
    const stack = f.state.cells[FAN_FROM]!;
    expect(stack).toHaveLength(3);
    expect(stack.at(-1)).toBe(f.state.to_move);
  });

  it('shows exactly the moves legal() gives from the stack, one group per count, 1, 2 and 3, none empty', () => {
    const f = fan();
    expect(f.groups.map((g) => g.count)).toEqual([1, 2, 3]);
    const want = legal(f.state)
      .filter((m) => m.from_cell === FAN_FROM)
      .map(moveName)
      .sort();
    expect(f.groups.flatMap((g) => g.moves).map(moveName).sort()).toEqual(want);
    for (const g of f.groups) {
      expect(g.moves.length).toBeGreaterThan(0);
      expect(g.moves.every((m) => m[0] === FAN_FROM && m[1] === g.count)).toBe(true);
    }
  });

  it('footnote 2’s rule, from the engine: no group lands on the starting square, though a walk of two steps could', () => {
    const f = fan();
    expect(f.groups.flatMap((g) => g.moves).some((m) => m[2] === FAN_FROM)).toBe(false);
    // The control: geometry alone would allow it (there and back), so the absence is the rule's.
    expect(movePath(FAN_FROM, 2, FAN_FROM)).toHaveLength(3);
  });

  it('each group’s example is one of its moves and shows its count’s line of the rules', () => {
    const f = fan();
    const signature = ['one', 'diagonal', 'three'] as const;
    f.groups.forEach((g, k) => {
      expect(g.moves.map(moveName)).toContain(moveName(g.example));
      expect(kindsOf(f.state, g.example)).toContain(signature[k]);
    });
    // The three-piece example lifts both colours and lands on an occupied square: the rest of the rules.
    expect(kindsOf(f.state, f.groups[2]!.example)).toEqual(['three', 'mixed', 'onto']);
  });
});

describe('fanFrames', () => {
  it('starts with every group at rest, then for each group: lifted, each square of the path, landed', () => {
    const f = fan();
    const frames = fanFrames(f);
    expect(frames[0]).toMatchObject({ group: -1, phase: 'rest' });
    expect(frames).toHaveLength(1 + f.groups.reduce((n, g) => n + g.count + 2, 0));
    f.groups.forEach((g, k) => {
      const own = frames.filter((x) => x.group === k);
      expect(own.map((x) => x.phase)).toEqual(['lift', ...Array<string>(g.count).fill('step'), 'land']);
      expect(own.filter((x) => x.phase === 'step').map((x) => x.carry!.at)).toEqual(movePath(...g.example).slice(1));
      expect(own.at(-1)!.state).toEqual(play(f.state, g.example));
      for (const x of own.slice(0, -1)) {
        expect(x.state).toEqual(f.state);
        expect(x.carry!.pieces).toEqual(f.state.cells[FAN_FROM]!.slice(-g.count));
      }
    });
  });
});

describe('kindsOf', () => {
  it('sees what it is there to tell apart', () => {
    const s = initial();
    expect(kindsOf(s, [0, 1, 3])).toEqual(['one']);
    // a1 onto b1: one piece, one step, onto an occupied square.
    expect(kindsOf(s, [0, 1, 1])).toEqual(['one', 'onto']);
    expect(kindsOf(s, [1, 2, 5])).toEqual(['diagonal']);
    // Two pieces straight ahead is none of the listed kinds.
    expect(kindsOf(s, [1, 2, 7])).toEqual(['onto']);
    const three = replay([...FAN_PRELUDE]).at(-1)!;
    expect(kindsOf(three, [0, 3, 1])).toEqual(['three', 'mixed']);
  });
});

describe('movePath', () => {
  it('finds a walk for every legal move of any position reached in a few moves', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 6 }), (picks) => {
        let s = initial();
        for (const k of picks) {
          const moves = legal(s);
          if (moves.length === 0) break;
          s = play(s, moves[k % moves.length]!);
        }
        for (const m of legal(s)) {
          const t: Triple = [m.from_cell, m.num_pieces, m.to_cell];
          const p = movePath(...t);
          expect(p).toHaveLength(m.num_pieces + 1);
          expect(p[0]).toBe(m.from_cell);
          expect(p.at(-1)).toBe(m.to_cell);
          for (let i = 1; i < p.length; i++) expect(adjacent(p[i - 1]!, p[i]!)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('refuses a landing no walk of that length reaches', () => {
    // a1 to c3 is four steps away: one piece cannot get there.
    expect(() => movePath(0, 1, 8)).toThrow();
  });
});
