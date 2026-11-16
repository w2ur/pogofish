// What <pogo-qsteps> shows, apart from the DOM: tools/article-visuals/qsteps.mjs's
// walk. Tabular Q-learning, one update per step, on a real endgame: the line
// A → B → C_k → the win, played GAMES times from A, with a notebook of the
// values of A, B and every C. The rule is crates/search/src/qtab.rs's, through
// players.ts (qTarget, qUpdate): V(s) += α (max_m Q(s, m) − V(s)), Q = ±1 when
// the move ends the game, else −V(next). No exploration: each side plays its
// best Q, ties to the first move in engine order, except at A, where White
// plays the line's move.
//
// The figure plays the walk as a script (qScript): the first update that
// changes a note of each kind of position (a C, then B, then A) is played
// slowly, in five sub-steps; every other update is one step.
import { LC1_2, initial, key, legal, play, terminal, winner, type Colour, type Move, type State, type Triple } from '../engine';
import { qTarget, qUpdate } from '../players';

/** The step size of qtab.rs and of the essay's formula (« 10 % »). */
export const ALPHA = 0.1;

/**
 * The endgame shown: the opening mistake of fig. 12 (`openingWin`, table.json),
 * whose first six moves lead to A, White to move; its seventh is White's move at
 * A. From B, each of Red's two replies leaves White a win in one. Five games: the
 * first two each find one C, the third gives B a value, the fourth gives A one,
 * the fifth shows every note still growing.
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
export const QSTEPS_GAMES = 5;

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

/** The moves of an update as the figure lists them: one row per notebook position, the others grouped. */
export interface MoveGroup {
  /** `to`: a move to a notebook row; `win`/`lose`: moves that end the game; `unseen`: moves to positions the notebook does not keep. */
  kind: 'to' | 'win' | 'lose' | 'unseen';
  to: string | null;
  count: number;
  q: number;
}

export function moveGroups(u: Update): MoveGroup[] {
  const named: MoveGroup[] = u.candidates.filter((c) => c.to !== null).map((c) => ({ kind: 'to', to: c.to, count: 1, q: c.q + 0 }));
  const rest = u.candidates.filter((c) => c.to === null);
  const group = (kind: 'win' | 'lose' | 'unseen', q: number, of: Candidate[]): MoveGroup[] =>
    of.length ? [{ kind, to: null, count: of.length, q }] : [];
  const unseen = rest.filter((c) => !c.ends);
  // A position the notebook does not keep has never been valued: its note is 0, and so is the move.
  // (`+ 0` above: a note of 0 negated is −0, which is 0 to the reader.)
  if (unseen.some((c) => c.q !== 0)) throw new Error('q-steps: a move to a position outside the notebook has a value');
  return [
    ...named,
    ...group('win', 1, rest.filter((c) => c.ends && c.q === 1)),
    ...group('lose', -1, rest.filter((c) => c.ends && c.q === -1)),
    ...group('unseen', 0, unseen),
  ];
}

/** The five sub-steps of an update played slowly, in the essay's order. */
export const Q_PHASES = ['look', 'value', 'best', 'formula', 'write'] as const;
export type QPhase = (typeof Q_PHASES)[number];

export interface QStep {
  /** Index of the walk's frame. */
  frame: number;
  /** The sub-step, for an update played slowly; null for a frame shown at once. */
  phase: QPhase | null;
  /** Held long enough to be read for the first time: the first game, and every sub-step. */
  slow: boolean;
  /** The step's place in its game, from 1, and the game's number of steps. */
  at: number;
  of: number;
}

/**
 * The walk as the figure plays it. An update is played slowly the first time a
 * position of its kind (C, B, A) changes its note; everything else is one step.
 */
export function qScript(walk: QWalk): QStep[] {
  const seen = new Set<string>();
  const steps: QStep[] = [];
  walk.frames.forEach((f, frame) => {
    const u = f.update;
    const kind = u ? u.name.charAt(0) : '';
    if (u && u.after !== u.before && !seen.has(kind)) {
      seen.add(kind);
      for (const phase of Q_PHASES) steps.push({ frame, phase, slow: true, at: 0, of: 0 });
    } else {
      steps.push({ frame, phase: null, slow: f.game <= 1, at: 0, of: 0 });
    }
  });
  for (const s of steps) {
    const game = walk.frames[s.frame]!.game;
    const mine = steps.filter((x) => walk.frames[x.frame]!.game === game);
    s.at = mine.indexOf(s) + 1;
    s.of = mine.length;
  }
  return steps;
}

/** The notebook as it stands at a step: until an update is written, its row keeps the old note. */
export function notesAt(walk: QWalk, step: QStep): Record<string, number> {
  const f = walk.frames[step.frame]!;
  if (step.phase === null || step.phase === 'write' || !f.update) return f.notes;
  return { ...f.notes, [f.update.name]: f.update.before };
}

/** The notebook after each game: column 0 before the first, then one per game. */
export function notebookColumns(walk: QWalk): Record<string, number>[] {
  return walk.frames.filter((f) => f.kind !== 'update').map((f) => f.notes);
}

/** For each row, the first game after which its note is not 0 (null: never). */
export function firstGames(walk: QWalk): Record<string, number | null> {
  const columns = notebookColumns(walk);
  return Object.fromEntries(
    walk.rows.map((r) => {
      const g = columns.findIndex((c) => c[r] !== 0);
      return [r, g < 0 ? null : g];
    }),
  );
}
