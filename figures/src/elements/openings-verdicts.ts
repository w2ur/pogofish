// What <pogo-openings> reads, apart from the DOM: after one first move of
// White's, every reply Red has, each with the solved table's verdict for the
// side that plays it, the replies that keep the draw set apart from those
// that lose, the latter from the fastest loss to the slowest. Each list is
// checked against legal() in its position, so the figure never shows a move
// the board would refuse or hides one it would allow. Counts are taken from
// the lists, never typed.
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

/** « garde la nulle » / « perd en 12 » / « gagne en 21 », for the side that played the move. */
export function verdictText(lang: Lang, v: Verdict): string {
  if (v.kind === 'keeps-draw') return t(lang, 'holdsDraw');
  return `${t(lang, v.kind === 'wins-in' ? 'wins' : 'loses')} ${t(lang, 'verdictIn')} ${v.plies}`;
}

/** The first move the figure shows the replies to: c1-1-b1, the one the letter's picture showed. */
export const SHOWN_OPENING: Triple = [2, 1, 1];

export interface ReplyCard {
  move: Triple;
  verdict: Verdict;
  /** The position once the reply is played. */
  after: State;
}

export interface ReplyGrid {
  opening: Triple;
  /** After the opening: the position Red replies in. */
  position: State;
  /** Every reply the table lists, as many as legal() gives. */
  total: number;
  /** The replies that keep the draw, in the table's order. */
  keeps: ReplyCard[];
  /** The replies that lose, from the fastest loss to the slowest; equal ones in the table's order. */
  loses: ReplyCard[];
}

/**
 * Red's replies to `opening`, sorted for the figure. It refuses an opening that
 * loses the draw itself and a reply that wins: the figure's two heads, « gardent
 * la nulle » and « perdent », would then leave a board out.
 */
export function replyGrid(table: TableData, opening: Triple = SHOWN_OPENING): ReplyGrid {
  const name = moveName(opening);
  const first = openingChoices(table).moves.find((m) => moveName(m.move) === name);
  if (!first) throw new Error(`pogo-openings: ${name} is not a first move`);
  if (first.verdict.kind !== 'keeps-draw') throw new Error(`pogo-openings: ${name} does not keep the draw`);
  const c = replyChoices(table, opening);
  const cards = c.moves.map((m): ReplyCard => ({ move: m.move, verdict: m.verdict, after: play(c.position, m.move) }));
  if (cards.some((x) => x.verdict.kind === 'wins-in')) throw new Error(`pogo-openings: a reply to ${name} wins`);
  const plies = (x: ReplyCard): number => (x.verdict.kind === 'loses-in' ? x.verdict.plies : 0);
  return {
    opening,
    position: c.position,
    total: cards.length,
    keeps: cards.filter((x) => x.verdict.kind === 'keeps-draw'),
    // Array.prototype.sort is stable: equal losses keep the table's order.
    loses: cards.filter((x) => x.verdict.kind === 'loses-in').sort((a, b) => plies(a) - plies(b)),
  };
}
