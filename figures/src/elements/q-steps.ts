// What <pogo-qsteps> shows, apart from the DOM: tools/article-visuals/qsteps.mjs's
// walk. Tabular Q-learning, one update per step, on a real endgame: the line
// A → B → C_k → the win, played GAMES times from A, with a notebook of the
// values of A, B and every C. The rule is crates/search/src/qtab.rs's, through
// players.ts (qTarget, qUpdate): V(s) += α (max_m Q(s, m) − V(s)), Q = ±1 when
// the move ends the game, else −V(next). No exploration: each side plays its
// best Q, ties to the first move in engine order, except at A, where White
// plays the line's move.
import { LC1_2, initial, key, legal, play, terminal, winner, type Colour, type Move, type State, type Triple } from '../engine';
import { qTarget, qUpdate } from '../players';

/** The step size of qtab.rs and of the essay's formula (« 10 % »). */
export const ALPHA = 0.1;

/**
 * The endgame shown: the opening mistake of fig. 12 (`openingWin`, table.json),
 * whose first six moves lead to A, White to move; its seventh is White's move at
 * A. From B, each of Red's two replies leaves White a win in one. Six games: the
 * first two each find one C, the third gives B a value, the fourth gives A one.
 */
export const QSTEPS_PREFIX: Triple[] = [
  [2, 1, 1],
  [7, 2, 1],
  [0, 1, 1],
  [6, 1, 3],
  [1, 3, 8],
  [3, 1, 0],
];
export const QSTEPS_FIRST: Triple = [1, 1, 0];
export const QSTEPS_GAMES = 6;

export interface Candidate {
  /** The notebook row the move leads to, or null for a position the notebook does not keep. */
  to: string | null;
  q: number;
  /** The move ends the game. */
  ends: boolean;
}

export interface Update {
  /** The row updated (« A », « B », « C1 », …) and who is to move there. */
  name: string;
  mover: Colour;
  candidates: Candidate[];
  best: number;
  before: number;
  after: number;
}

export interface QFrame {
  /** 0 before the first game, then 1…GAMES. */
  game: number;
  kind: 'blank' | 'update' | 'end';
  /** The rows of the line so far in this game, and the position shown. */
  path: string[];
  state: State;
  /** The move played from the position shown (an update), as qsteps.mjs marks it. */
  move?: Triple;
  update?: Update;
  /** The winner, on an `end` frame. */
  winner?: Colour;
  /** The notebook after this step, by row. */
  notes: Record<string, number>;
  /** The row this step changed, if any. */
  changed: string | null;
}

export interface QWalk {
  rows: string[];
  frames: QFrame[];
}

const triple = (m: Move): Triple => [m.from_cell, m.num_pieces, m.to_cell];
const same = (m: Move, t: Triple): boolean => m.from_cell === t[0] && m.num_pieces === t[1] && m.to_cell === t[2];
/** A position's key without its history, as qsteps.mjs keys its notebook. */
const bare = (s: State): string => key({ ...s, history: [] });

export function qSteps(prefix: readonly Triple[] = QSTEPS_PREFIX, first: Triple = QSTEPS_FIRST, games = QSTEPS_GAMES): QWalk {
  const A = prefix.reduce((s, m) => play(s, m), initial());
  const firstMove = legal(A).find((m) => same(m, first));
  if (!firstMove) throw new Error('q-steps: the first move is illegal at A');
  const B = play(A, firstMove);
  const Cs = legal(B).map((m) => play(B, m));
  for (const c of Cs) {
    if (!legal(c).some((m) => terminal(play(c, m), LC1_2))) throw new Error('q-steps: a C position has no immediate win');
  }

  const rows = ['A', 'B', ...Cs.map((_, i) => `C${i + 1}`)];
  const label = new Map<string, string>([[bare(A), 'A'], [bare(B), 'B'], ...Cs.map((c, i): [string, string] => [bare(c), `C${i + 1}`])]);
  const stateOf: Record<string, State> = { A, B, ...Object.fromEntries(Cs.map((c, i) => [`C${i + 1}`, c])) };
  const V = new Map<string, number>();
  const v = (s: State): number => V.get(bare(s)) ?? 0;
  const snap = (): Record<string, number> => Object.fromEntries(rows.map((r) => [r, v(stateOf[r]!)]));
  const nameOf = (s: State): string | null => label.get(bare(s)) ?? null;

  const frames: QFrame[] = [{ game: 0, kind: 'blank', path: ['A'], state: A, notes: snap(), changed: null }];
  for (let g = 1; g <= games; g++) {
    let s = A;
    const path = ['A'];
    for (let ply = 0; ; ply++) {
      const moves = legal(s);
      const scored = moves.map((m) => {
        const next = play(s, m);
        return { m, next, q: qTarget(s, m, v, LC1_2), ends: terminal(next, LC1_2) };
      });
      const best = Math.max(...scored.map((c) => c.q));
      const before = v(s);
      const after = qUpdate(before, best, ALPHA);
      V.set(bare(s), after);
      const pick = ply === 0 ? scored.find((c) => same(c.m, first))! : scored.find((c) => c.q === best)!;
      const name = nameOf(s) ?? '?';
      frames.push({
        game: g,
        kind: 'update',
        path: [...path],
        state: s,
        move: triple(pick.m),
        update: {
          name,
          mover: s.to_move,
          candidates: scored.map((c) => ({ to: nameOf(c.next), q: c.q, ends: c.ends })),
          best,
          before,
          after,
        },
        notes: snap(),
        changed: name,
      });
      const mover = s.to_move;
      s = pick.next;
      if (pick.ends) {
        const w = winner(s, LC1_2);
        frames.push({
          game: g,
          kind: 'end',
          path: [...path, 'end'],
          state: s,
          winner: w === 'W' ? 'White' : w === 'R' ? 'Red' : mover,
          notes: snap(),
          changed: null,
        });
        break;
      }
      path.push(nameOf(s) ?? '?');
    }
  }
  return { rows, frames };
}

/**
 * A value as qsteps.mjs writes it: two decimals, three under 0.01, a true minus
 * (none on a value that rounds to zero), the language's decimal mark.
 */
export function noteText(lang: 'fr' | 'en', x: number): string {
  const a = Math.abs(x);
  const digits = a !== 0 && a < 0.01 ? a.toFixed(3) : a.toFixed(2);
  const sign = x < 0 && a >= 0.0005 ? '−' : '';
  return sign + (lang === 'fr' ? digits.replace('.', ',') : digits);
}

/** A move's value, signed: « +1,00 », « −0,10 », « 0,00 ». */
export function signedNote(lang: 'fr' | 'en', x: number): string {
  return (x > 0.0005 ? '+' : '') + noteText(lang, x);
}
