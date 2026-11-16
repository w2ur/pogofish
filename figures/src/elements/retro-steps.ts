// What <pogo-retrograde> shows, apart from the DOM: the solved table's three
// steps of retrograde analysis as a small tree, checked against the engine
// before anything is drawn. lost-0 positions are finished games lost by the
// player to move; a won-1 position has a move into lost-0; every move of a
// lost-2 position goes into won-1. A file that breaks any of this is refused,
// so the figure never draws "every move loses" over a position that has
// another move. The analysis is told in the order it is made, from the end of
// the game back: lost-0 first.
import type { TableData } from '../data';
import { key, legal, moveName, play, terminal, winner, type Colour, type State, type Triple } from '../engine';

export type RetroLabel = 'lost-0' | 'won-1' | 'lost-2';

export interface RetroMove {
  move: Triple;
  mover: Colour;
  /** Index of the position it leads to, in the step before. */
  to: number;
}

export interface RetroBoard {
  state: State;
  /** Into the step before; empty at lost-0. */
  moves: RetroMove[];
}

export interface RetroStepView {
  label: RetroLabel;
  outcome: 'lost' | 'won';
  plies: number;
  boards: RetroBoard[];
}

const ORDER: { label: RetroLabel; outcome: 'lost' | 'won'; plies: number }[] = [
  { label: 'lost-0', outcome: 'lost', plies: 0 },
  { label: 'won-1', outcome: 'won', plies: 1 },
  { label: 'lost-2', outcome: 'lost', plies: 2 },
];

const fail = (why: string): never => {
  throw new Error(`pogo-retrograde: ${why}`);
};

export function retroSteps(table: TableData): RetroStepView[] {
  if (table.retro.length !== ORDER.length) fail(`expected ${ORDER.length} steps, got ${table.retro.length}`);
  const steps: RetroStepView[] = [];
  ORDER.forEach((o, i) => {
    const step = table.retro[i]!;
    if (step.label !== o.label) fail(`step ${i} is ${step.label}, expected ${o.label}`);
    const before = steps[i - 1];
    const boards = step.positions.map((p, n): RetroBoard => {
      const moves = (p.moves ?? []).map(({ move, to }): RetroMove => {
        const target = before?.boards[to] ?? fail(`${o.label} ${n}: move ${moveName(move)} leads nowhere`);
        if (key(play(p.state, move)) !== key(target.state)) fail(`${o.label} ${n}: ${moveName(move)} does not lead to position ${to} of the step before`);
        return { move, mover: p.state.to_move, to };
      });
      return { state: p.state, moves };
    });
    boards.forEach((b, n) => {
      if (o.label === 'lost-0') {
        const loser = b.state.to_move === 'White' ? 'R' : 'W';
        if (!terminal(b.state, null) || winner(b.state, null) !== loser) fail(`lost-0 ${n} is not lost by the side to move`);
        if (b.moves.length > 0) fail(`lost-0 ${n} has moves`);
      } else if (o.label === 'won-1') {
        if (b.moves.length === 0) fail(`won-1 ${n} has no winning move`);
      } else {
        const all = legal(b.state).map(moveName).sort();
        const shown = b.moves.map((m) => moveName(m.move)).sort();
        if (all.join() !== shown.join()) fail(`lost-2 ${n} must show every legal move (${all.join(', ')})`);
      }
    });
    steps.push({ ...o, boards });
  });
  // Every position drawn is reached by an arrow, except the one the tree starts from.
  steps.slice(0, -1).forEach((s, i) => {
    const reached = new Set(steps[i + 1]!.boards.flatMap((b) => b.moves.map((m) => m.to)));
    s.boards.forEach((_, n) => reached.has(n) || fail(`${s.label} ${n} is reached by no move`));
  });
  return steps;
}

/** The two marks the analysis would make next, « gagnée en 3 » then « perdue en 4 », counted from the last step shown. */
export function nextMarks(steps: readonly RetroStepView[]): { outcome: 'lost' | 'won'; plies: number }[] {
  const last = steps.at(-1) ?? fail('no step');
  const flip = (o: 'lost' | 'won'): 'lost' | 'won' => (o === 'lost' ? 'won' : 'lost');
  return [
    { outcome: flip(last.outcome), plies: last.plies + 1 },
    { outcome: last.outcome, plies: last.plies + 2 },
  ];
}
