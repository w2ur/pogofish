// What <pogo-openings> reads, apart from the DOM: the solved table's verdict
// on the reader's first move for White, then on their reply for Red, and the
// words the essay uses for it. Each list the table holds is checked against
// legal() in its position, so the tester never judges a move the board would
// refuse, nor lacks a verdict for one it allows. Counts come from the table.
import type { TableData, Verdict, VerdictMove } from '../data';
import { initial, legal, moveName, play, type Colour, type State, type Triple } from '../engine';
import { colon, t, type Lang } from '../kit/strings';

export interface Choices {
  /** The position the choice is made in. */
  position: State;
  mover: Colour;
  moves: VerdictMove[];
}

function checked(position: State, moves: VerdictMove[], what: string): Choices {
  const want = legal(position).map(moveName).sort();
  const have = moves.map((m) => moveName(m.move)).sort();
  if (want.join() !== have.join()) throw new Error(`pogo-openings: ${what} lists ${have.join(', ')}, legal() gives ${want.join(', ')}`);
  return { position, mover: position.to_move, moves };
}

export function openingChoices(table: TableData): Choices {
  return checked(initial(), table.openings, 'the openings');
}

export function replyChoices(table: TableData, opening: Triple): Choices {
  const name = moveName(opening);
  const replies = table.replies[name];
  if (!replies) throw new Error(`pogo-openings: no replies for ${name}`);
  return checked(play(initial(), opening), replies, `the replies to ${name}`);
}

/**
 * The table's verdict on the last of `played`: White's first move, or Red's reply to it. From
 * the view of the side that played it (data.ts's Verdict). Throws on a move the table does not
 * list, and on a third move: the table holds the first two only.
 */
export function verdictOf(table: TableData, played: readonly Triple[]): Verdict {
  if (played.length < 1 || played.length > 2) throw new Error(`pogo-openings: the table judges the first two moves, not ${played.length}`);
  const [first, reply] = played as [Triple, Triple | undefined];
  const choices = reply === undefined ? openingChoices(table) : replyChoices(table, first);
  const move = reply ?? first;
  const found = choices.moves.find((m) => moveName(m.move) === moveName(move));
  if (!found) throw new Error(`pogo-openings: no verdict for ${moveName(move)}`);
  return found.verdict;
}

/**
 * What a verdict means for the game, in the essay's terms: the move avoids defeat (the game can go
 * on without end), or one side forces the win, in `moves` moves after the one just played. The
 * table counts the move itself in its plies; the reader is told what is left.
 */
export type Outcome = { kind: 'avoids' } | { kind: 'wins' | 'loses'; winner: Colour; moves: number };

const other = (c: Colour): Colour => (c === 'White' ? 'Red' : 'White');

export function outcome(mover: Colour, v: Verdict): Outcome {
  if (v.kind === 'keeps-draw') return { kind: 'avoids' };
  const moves = v.plies - 1;
  return v.kind === 'wins-in' ? { kind: 'wins', winner: mover, moves } : { kind: 'loses', winner: other(mover), moves };
}

/** « Évite la défaite : la partie peut continuer sans fin. » / « Perd : les Rouges forcent la victoire en 11 coups. » */
export function outcomeText(lang: Lang, mover: Colour, v: Verdict): string {
  const o = outcome(mover, v);
  if (o.kind === 'avoids') return `${t(lang, 'openingsAvoids')}${colon(lang)} ${t(lang, 'openingsEndless')}.`;
  const head = t(lang, o.kind === 'wins' ? 'openingsWins' : 'openingsLoses');
  const who = t(lang, o.winner === 'White' ? 'openingsForceWhite' : 'openingsForceRed');
  const unit = t(lang, o.moves === 1 ? 'ply' : 'movesUnit');
  return `${head}${colon(lang)} ${who} ${o.moves} ${unit}.`;
}
