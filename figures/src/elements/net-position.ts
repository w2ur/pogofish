// The one position the net figures show (<pogo-net>, <pogo-encoding> and
// <pogo-search position="reader">): the essay speaks of « la position
// ci-dessus » from one figure to the next, so they read it from here alone.
// It is the position on the board right now when a game is under way or finished
// (the last position with a move still to play, for a finished one), else the
// default game after three moves, the position the article's own drawings used.
import { DEFAULT_GAME } from '../default-game';
import { LC1_2, replay, terminal, type State, type Triple } from '../engine';
import { colon, t, type Lang } from '../kit/strings';
import type { Store } from '../store';

/** Moves of DEFAULT_GAME played before the default position. */
export const DEFAULT_PLY = 3;

export interface NetPosition {
  state: State;
  source: 'reader' | 'default';
  /** Moves played to reach `state`, from the start of its game. */
  ply: number;
  /** A finished game: `state` is its last position before the end. */
  beforeEnd: boolean;
}

export function netPosition(store: Pick<Store, 'current'>): NetPosition {
  const g = store.current();
  if (g && g.states.length > 0) {
    let ply = g.states.length - 1;
    // The final position of a finished game has nothing left to weigh: take the one before it.
    while (ply > 0 && terminal(g.states[ply]!, LC1_2)) ply--;
    return { state: g.states[ply]!, source: 'reader', ply, beforeEnd: ply < g.states.length - 1 };
  }
  const states = replay(DEFAULT_GAME.slice(0, DEFAULT_PLY) as Triple[]);
  return { state: states[DEFAULT_PLY]!, source: 'default', ply: DEFAULT_PLY, beforeEnd: false };
}

/** « 1 coup », « 3 coups » / "1 move", "3 moves". */
export function plies(lang: Lang, n: number): string {
  return `${n} ${t(lang, n === 1 ? 'ply' : 'movesUnit')}`;
}

/** « Position : la partie du plateau, après 7 coups. » or « Position : l’erreur d’ouverture, après 3 coups. » */
export function positionWords(lang: Lang, p: NetPosition): string {
  const game = p.source === 'reader' ? t(lang, 'posYourGame') : t(lang, 'lineOpeningWin');
  const when = p.ply === 0 ? t(lang, 'posAtStart') : `${t(lang, 'posAfter')} ${plies(lang, p.ply)}`;
  const end = p.beforeEnd ? `, ${t(lang, 'posBeforeEnd')}` : '';
  return `${t(lang, 'position')}${colon(lang)} ${game}, ${when}${end}.`;
}
