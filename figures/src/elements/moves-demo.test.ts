import fc from 'fast-check';
import { initial, legal, moveName, play, type State, type Triple } from '../engine';
import { DEMO, demoFrames, kindsOf, movePath, type MoveKind } from './moves-demo';

const rc = (i: number): [number, number] => [i % 3, Math.floor(i / 3)];
const adjacent = (a: number, b: number): boolean => {
  const [x1, y1] = rc(a);
  const [x2, y2] = rc(b);
  return Math.abs(x1 - x2) + Math.abs(y1 - y2) === 1;
};

/** The positions the demonstration plays through, from the start. */
function positions(): State[] {
  const out = [initial()];
  for (const d of DEMO) out.push(play(out.at(-1)!, d.move));
  return out;
}

describe('the demonstration of <pogo-moves view="moves">', () => {
  it('plays only moves legal() offers, the sides taking turns from the start position', () => {
    const states = positions();
    DEMO.forEach((d, k) => {
      const legalNames = legal(states[k]!).map(moveName);
      expect(legalNames).toContain(moveName(d.move));
    });
  });

  it('shows every kind of move the rules list, each said by the kinds the engine’s position gives it', () => {
    const states = positions();
    const said = new Set<MoveKind>();
    DEMO.forEach((d, k) => {
      // The kinds announced are the kinds the position and the move really have.
      expect(kindsOf(states[k]!, d.move)).toEqual(d.kinds);
      for (const kind of d.kinds) said.add(kind);
    });
    expect([...said].sort()).toEqual(['diagonal', 'mixed', 'one', 'onto', 'three'].sort());
  });

  it('the control: kindsOf sees what it is there to tell apart', () => {
    const s = initial();
    expect(kindsOf(s, [0, 1, 3])).toEqual(['one']);
    // a1 onto b1: one piece, one step, onto an occupied square.
    expect(kindsOf(s, [0, 1, 1])).toEqual(['one', 'onto']);
    expect(kindsOf(s, [1, 2, 5])).toEqual(['diagonal']);
    // Two pieces straight ahead is none of the listed kinds.
    expect(kindsOf(s, [1, 2, 7])).toEqual(['onto']);
  });
});

describe('movePath', () => {
  it('walks n orthogonal steps from the stack to the landing, inside the board', () => {
    for (const d of DEMO) {
      const [from, n, to] = d.move;
      const p = movePath(from, n, to);
      expect(p).toHaveLength(n + 1);
      expect(p[0]).toBe(from);
      expect(p.at(-1)).toBe(to);
      for (let k = 1; k < p.length; k++) expect(adjacent(p[k - 1]!, p[k]!)).toBe(true);
    }
  });

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

describe('demoFrames', () => {
  it('for each move: the announcement, the pieces lifted, each square of the path, the landing', () => {
    const frames = demoFrames();
    const expected = DEMO.reduce((n, d) => n + 3 + d.move[1], 0);
    expect(frames).toHaveLength(expected);
    const first = frames.filter((f) => f.move === 0).map((f) => f.phase);
    expect(first).toEqual(['announce', 'lift', 'step', 'land']);
    const three = DEMO.findIndex((d) => d.move[1] === 3);
    const path = frames.filter((f) => f.move === three && f.phase === 'step').map((f) => f.carry!.at);
    expect(path).toEqual(movePath(...DEMO[three]!.move).slice(1));
  });

  it('lands each move on the position the engine plays, and starts again from the start position', () => {
    const frames = demoFrames();
    const states = positions();
    for (const f of frames.filter((x) => x.phase === 'land')) expect(f.state).toEqual(states[f.move + 1]);
    expect(frames[0]!.state).toEqual(initial());
    // While the pieces travel, the board shows the position before the move, the carried pieces apart.
    for (const f of frames.filter((x) => x.phase === 'step')) {
      expect(f.state).toEqual(states[f.move]);
      expect(f.carry!.count).toBe(DEMO[f.move]!.move[1]);
    }
  });
});
