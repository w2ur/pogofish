// What <pogo-openings> reads, apart from the DOM: White's sixteen first moves
// and, after one of them, every reply Red has, each with the solved table's
// verdict for the side that plays it. Each list is checked against legal() in
// its position, so the figure never offers a move the board would refuse or
// hides one it would allow. Counts are taken from the list, never typed: not
// every opening leaves Red sixteen replies.
import type { TableData, Verdict, VerdictMove } from '../data';
import { initial, legal, moveName, play, type Colour, type State, type Triple } from '../engine';
import { t, type Lang } from '../kit/strings';

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

/** The list the reader chooses from: the openings, or the replies after `opening`. */
export function choicesAfter(table: TableData, opening: Triple | null): Choices {
  return opening ? replyChoices(table, opening) : openingChoices(table);
}

export const holding = (moves: readonly VerdictMove[]): number => moves.filter((m) => m.verdict.kind === 'keeps-draw').length;

export const sameMove = (a: Triple, b: Triple): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** « garde la nulle » / « perd en 12 » / « gagne en 21 », for the side that played the move. */
export function verdictText(lang: Lang, v: Verdict): string {
  if (v.kind === 'keeps-draw') return t(lang, 'holdsDraw');
  return `${t(lang, v.kind === 'wins-in' ? 'wins' : 'loses')} ${t(lang, 'verdictIn')} ${v.plies}`;
}

/** « Premiers coups des Blancs · 6 sur 16 gardent la nulle » / « Réponses des Rouges à a1-1-b1 · 2 sur 16 … ». */
export function headLine(lang: Lang, table: TableData, opening: Triple | null): string {
  const { moves } = choicesAfter(table, opening);
  const n = holding(moves);
  const what = opening ? `${t(lang, 'openingsRepliesTo')} ${moveName(opening)}` : t(lang, 'openingsFirst');
  return `${what} · ${n} ${t(lang, 'outOf')} ${moves.length} ${t(lang, n === 1 ? 'holdsDraw' : 'holdDrawPlural')}`;
}
