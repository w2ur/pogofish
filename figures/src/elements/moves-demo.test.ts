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
  it('starts with every board at rest, then plays every move of each board, the three boards at once', () => {
    const f = fan();
    const frames = fanFrames(f);
    expect(frames[0]!.round).toBe(-1);
    expect(frames[0]!.boards.map((b) => b.phase)).toEqual(['rest', 'rest', 'rest']);
    // Every move of every count is played once, in its board's order: the example first.
    f.groups.forEach((g, k) => {
      expect(g.played[0]).toEqual(g.example);
      expect([...g.played].sort((a, b) => a[2] - b[2])).toEqual(g.moves);
      const lifted = frames.filter((x) => x.boards[k]!.phase === 'lift').map((x) => x.boards[k]!.move);
      expect(lifted).toEqual(g.played);
    });
    // A round lifts on the same frame on every board that still has a move: they move together.
    const rounds = Math.max(...f.groups.map((g) => g.moves.length));
    for (let r = 0; r < rounds; r++) {
      const own = frames.filter((x) => x.round === r);
      const playing = f.groups.map((g, k) => (r < g.played.length ? k : -1)).filter((k) => k >= 0);
      expect(own[0]!.boards.map((b, k) => (b.phase === 'lift' ? k : -1)).filter((k) => k >= 0)).toEqual(playing);
      // The round lasts as long as its longest move, lifted, each square, landed.
      expect(own).toHaveLength(Math.max(...playing.map((k) => f.groups[k]!.count + 2)));
      for (const k of playing) {
        const g = f.groups[k]!;
        const m = g.played[r]!;
        const phases = own.map((x) => x.boards[k]!.phase);
        const tail = own.length - (g.count + 2);
        expect(phases).toEqual(['lift', ...Array<string>(g.count).fill('step'), ...Array<string>(tail + 1).fill('land')]);
        expect(own.filter((x) => x.boards[k]!.phase === 'step').map((x) => x.boards[k]!.carry!.at)).toEqual(movePath(...m).slice(1));
        expect(own.at(-1)!.boards[k]!.state).toEqual(play(f.state, m));
        for (const x of own.filter((y) => y.boards[k]!.phase !== 'land')) {
          expect(x.boards[k]!.state).toEqual(f.state);
          expect(x.boards[k]!.carry!.pieces).toEqual(f.state.cells[FAN_FROM]!.slice(-g.count));
        }
      }
      // A board whose moves are all played rests, every landing shown.
      for (let k = 0; k < 3; k++) if (!playing.includes(k)) expect(own.every((x) => x.boards[k]!.phase === 'rest')).toBe(true);
    }
    expect(frames).toHaveLength(1 + frames.filter((x) => x.round >= 0).length);
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
