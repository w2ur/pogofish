// What <pogo-search> plays, apart from the DOM: the recorded search, cut into
// frames, and the words of each frame, built from what the search did.
//
// The first three simulations are shown one at a time and slowly, each in
// three frames: its path (the moves it follows from the root), its leaf (where
// it stops, and the note brought back from there), and the way back (the note
// counted in the root move's row). Then the search accelerates through the
// stops of search-steps.ts (5, 10, 20, 50, 100 simulations). One more
// simulation is slowed down on the way, in its place in time: the first that
// reaches the end of a game, so the reader sees a path several moves long and
// a result, not the net, giving the note. The last frame plays the most
// visited move. Every number shown is a snapshot or a trace of the one search
// run (mcts.ts), never a value made up between two.
import { moveName, type Colour } from '../engine';
import type { SearchSnapshot, SimulationTrace } from '../mcts';
import { colon, t, type Lang } from '../kit/strings';
import { formatCount } from './count-steps';
import { signedNote } from './q-steps';
import { STOPS, rowOrder } from './search-steps';

/** The simulations shown one by one, slowly: the first three. */
export const SLOW = [1, 2, 3] as const;

export type SimFrame = { kind: 'path' | 'leaf' | 'back'; sim: number; trace: SimulationTrace; snap: SearchSnapshot };
export type Frame =
  | { kind: 'before'; sim: 0; snap: SearchSnapshot }
  | SimFrame
  | { kind: 'stop' | 'end'; sim: number; snap: SearchSnapshot };

/** How long each kind of frame is held in automatic play, in milliseconds; a leaf adds WALK_MS per move of its path. */
export const HOLD = { before: 3000, path: 2600, leaf: 2400, back: 2800, stop: 2200, end: 0 } as const;
/** How long the board takes over each move of a path it walks. */
export const WALK_MS = 700;

/** The first simulation after the slow ones that ends on a finished game, if the search has one. */
export function deepSim(traces: readonly SimulationTrace[]): number | null {
  const last = SLOW[SLOW.length - 1]!;
  return traces.find((tr) => tr.sim > last && tr.leaf === 'end')?.sim ?? null;
}

/**
 * The frames, from `before` (the root before any simulation), `snaps` (the snapshot
 * after each simulation, `snaps[k]` after k + 1) and `traces` (one per simulation).
 */
export function searchScript(before: SearchSnapshot, snaps: readonly SearchSnapshot[], traces: readonly SimulationTrace[]): Frame[] {
  const total = snaps.length;
  if (traces.length !== total) throw new Error(`pogo-search: ${traces.length} traces for ${total} snapshots`);
  snaps.forEach((s, k) => {
    if (s.sim !== k + 1 || traces[k]!.sim !== k + 1) throw new Error(`pogo-search: simulation ${k + 1} is out of order`);
  });
  if (STOPS[STOPS.length - 1] !== total) throw new Error(`pogo-search: ${total} simulations, the stops end at ${STOPS.at(-1)}`);
  const at = (sim: number): SearchSnapshot => (sim === 0 ? before : snaps[sim - 1]!);
  const slow = (sim: number): SimFrame[] => {
    const trace = traces[sim - 1]!;
    return [
      { kind: 'path', sim, trace, snap: at(sim - 1) },
      { kind: 'leaf', sim, trace, snap: at(sim - 1) },
      { kind: 'back', sim, trace, snap: at(sim) },
    ];
  };
  const deep = deepSim(traces);
  const frames: Frame[] = [{ kind: 'before', sim: 0, snap: before }];
  for (const sim of SLOW) frames.push(...slow(sim));
  for (const sim of STOPS.filter((n) => n > SLOW[SLOW.length - 1]!)) {
    if (deep !== null && deep < sim && !frames.some((f) => f.kind === 'back' && f.sim === deep)) frames.push(...slow(deep));
    frames.push({ kind: sim === total ? 'end' : 'stop', sim, snap: at(sim) });
  }
  return frames;
}

/** How long frame `i` is held before the next, in automatic play. */
export function frameHold(frames: readonly Frame[], i: number): number {
  const f = frames[i]!;
  if (f.kind === 'leaf') return HOLD.leaf + WALK_MS * f.trace.moves.length;
  return HOLD[f.kind];
}

/** The most visited move, the first in root order among equals (mcts.ts `bestMove`); -1 before any visit. */
export function mostVisited(s: SearchSnapshot): number {
  let best = -1;
  s.root.forEach((r, i) => {
    if (r.visits > 0 && (best < 0 || r.visits > s.root[best]!.visits)) best = i;
  });
  return best;
}

/** The move ahead on visits, when one move alone has the most; -1 on a tie or before any visit. */
export function leader(s: SearchSnapshot): number {
  const best = mostVisited(s);
  if (best < 0) return -1;
  return s.root.filter((r) => r.visits === s.root[best]!.visits).length === 1 ? best : -1;
}

/** The row of a trace's root move in a snapshot. */
export function rootRow(s: SearchSnapshot, tr: SimulationTrace): number {
  const m = tr.moves[0]!;
  return s.root.findIndex((r) => r.move.from_cell === m.from_cell && r.move.num_pieces === m.num_pieces && r.move.to_cell === m.to_cell);
}

/** « 1 simulation », « 5 simulations »; in French 0 is singular too. */
const sims = (lang: Lang, n: number): string => `${formatCount(lang, n)} ${t(lang, n === 1 || (lang === 'fr' && n === 0) ? 'searchSim' : 'searchSims')}`;
const visitsWord = (lang: Lang, n: number): string => `${formatCount(lang, n)} ${t(lang, n === 1 ? 'searchVisit' : 'searchVisitsWord')}`;
const colourOf = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'white' : 'red');

/** The counter: « 5 simulations sur 100 »; during a slowed simulation, its number. */
export function frameCounter(lang: Lang, f: Frame, total: number): string {
  return `${sims(lang, f.sim)} ${t(lang, 'outOf')} ${formatCount(lang, total)}`;
}

/** The note a simulation brings back, for the player to move at the root, as the figure writes it. */
export const noteFor = (lang: Lang, x: number): string => signedNote(lang, x);

/**
 * The words of a frame. `toMove` is the root's player to move, for whom every note is
 * given. Move names are written plainly: the element makes each one explain itself.
 */
export function frameWords(lang: Lang, f: Frame, toMove: Colour): string {
  const order = rowOrder(f.snap);
  const preferred = f.snap.root[order[0]!]!;
  const c = colon(lang);
  switch (f.kind) {
    case 'before':
      return `${t(lang, 'searchBefore')} ${t(lang, 'searchNetPrefers')} ${moveName(preferred.move)}.`;
    case 'path': {
      const first = f.trace.moves[0]!;
      const head = `${t(lang, 'searchSimulation')} ${f.sim}${c} `;
      if (f.trace.moves.length > 1) {
        return `${head}${t(lang, 'searchPathFollows')} ${f.trace.moves.map(moveName).join(', ')}, ${t(lang, 'searchPathKnown')}.`;
      }
      const isPreferred = moveName(first) === moveName(preferred.move);
      return isPreferred && f.sim === 1 ? `${head}${t(lang, 'searchFirstPath')} ${moveName(first)}.` : `${head}${t(lang, 'searchPathFollows')} ${moveName(first)}.`;
    }
    case 'leaf': {
      const v = f.trace.value;
      if (f.trace.leaf === 'end') {
        const won = v > 0 ? toMove : v < 0 ? (toMove === 'Red' ? 'White' : 'Red') : null;
        const result = won === null ? t(lang, 'searchLeafDraw') : `${colourOf(lang, won)} ${t(lang, 'searchWins')}`;
        return `${t(lang, 'searchLeafEnd')}${c} ${result}. ${t(lang, 'searchNoteFor')} ${colourOf(lang, toMove)}${c} ${noteFor(lang, v)}.`;
      }
      const where = t(lang, f.trace.leaf === 'new' ? 'searchLeafNew' : 'searchLeafRepeat');
      return `${where} ${t(lang, 'searchNetNotes')} ${noteFor(lang, v)} ${t(lang, 'searchFor')} ${colourOf(lang, toMove)}.`;
    }
    case 'back': {
      const row = f.snap.root[rootRow(f.snap, f.trace)]!;
      return `${t(lang, 'searchBack')} ${moveName(row.move)}${c} ${visitsWord(lang, row.visits)}, ${t(lang, 'searchMeanWord')} ${noteFor(lang, row.meanValue)}.`;
    }
    case 'stop': {
      const lead = leader(f.snap);
      if (lead >= 0 && lead !== order[0]) {
        const r = f.snap.root[lead]!;
        return `${sims(lang, f.sim)}. ${moveName(r.move)} ${t(lang, 'searchAhead')}${c} ${visitsWord(lang, r.visits)}, ${t(lang, 'searchMeanWord')} ${noteFor(lang, r.meanValue)}.`;
      }
      return `${sims(lang, f.sim)}. ${t(lang, 'searchTracks')}`;
    }
    case 'end': {
      const played = f.snap.root[mostVisited(f.snap)]!;
      const start = `${t(lang, 'searchAfter')} ${sims(lang, f.sim)}, ${t(lang, 'searchPlays')}${c} ${moveName(played.move)}`;
      return moveName(played.move) === moveName(preferred.move)
        ? `${start}, ${t(lang, 'searchAlreadyPreferred')}.`
        : `${start}. ${t(lang, 'searchNetAlone')} ${moveName(preferred.move)}.`;
    }
  }
}
