// What <pogo-retrograde> shows, apart from the DOM: the solved table's three
// steps of retrograde analysis, checked against the engine before anything is
// drawn. lost-0 positions are finished games lost by the player to move; a
// won-1 position has a move into lost-0; every move of a lost-2 position goes
// into won-1. A file that breaks any of this is refused, so the figure never
// draws "every move loses" over a position that has another move.
import type { TableData } from '../data';
import { key, legal, moveName, play, terminal, winner, type State, type Triple } from '../engine';

export type RetroLabel = 'lost-0' | 'won-1' | 'lost-2';

export interface RetroBoard {
  /** A to E, across the three steps, so a move can name where it leads. */
  letter: string;
  state: State;
  /** Into the step before; empty at lost-0. */
  moves: { move: Triple; to: number; toLetter: string }[];
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
  let next = 0;
  const steps: RetroStepView[] = [];
  ORDER.forEach((o, i) => {
    const step = table.retro[i]!;
    if (step.label !== o.label) fail(`step ${i} is ${step.label}, expected ${o.label}`);
    const before = steps[i - 1];
    const boards = step.positions.map((p): RetroBoard => {
      const letter = String.fromCharCode(65 + next++);
      // The figure rings one lifted stack per board: moves from two stacks would be drawn wrong.
      if (new Set((p.moves ?? []).map((m) => m.move[0])).size > 1) fail(`${o.label} ${letter}: its moves leave from more than one stack`);
      const moves = (p.moves ?? []).map(({ move, to }) => {
        const target = before?.boards[to] ?? fail(`${o.label} ${letter}: move ${moveName(move)} leads nowhere`);
        if (key(play(p.state, move)) !== key(target.state)) {
          fail(`${o.label} ${letter}: ${moveName(move)} does not lead to ${target.letter}`);
        }
        return { move, to, toLetter: target.letter };
      });
      return { letter, state: p.state, moves };
    });
    for (const b of boards) {
      if (o.label === 'lost-0') {
        const loser = b.state.to_move === 'White' ? 'R' : 'W';
        if (!terminal(b.state, null) || winner(b.state, null) !== loser) fail(`lost-0 ${b.letter} is not lost by the side to move`);
        if (b.moves.length > 0) fail(`lost-0 ${b.letter} has moves`);
      } else if (o.label === 'won-1') {
        if (b.moves.length === 0) fail(`won-1 ${b.letter} has no winning move`);
      } else {
        const all = legal(b.state).map(moveName).sort();
        const shown = b.moves.map((m) => moveName(m.move)).sort();
        if (all.join() !== shown.join()) fail(`lost-2 ${b.letter} must show every legal move (${all.join(', ')})`);
      }
    }
    steps.push({ ...o, boards });
  });
  return steps;
}
