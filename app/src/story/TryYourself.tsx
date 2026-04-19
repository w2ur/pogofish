import { useCallback, useEffect, useRef } from "react";
import { Board } from "../components/board/Board";
import { useGameMachine } from "../hooks/useGameMachine";
import { legalMoves } from "../engine/engine";
import type { GameState, Move } from "../engine/types";
import { RULES_LC1_2 } from "../engine/types";
import { useLang } from "./LangContext";
import { STRINGS, tf } from "./i18n";

export const TRY_YOURSELF_MAX_PLIES = 5;

/**
 * Pick Red's move for the guided drill.
 *
 * Priority (deterministic for a given board state):
 *   1. A move whose destination's current top piece is White — a capture.
 *   2. A move whose destination is non-empty but owned by Red — a stack build.
 *   3. The first legal move.
 *
 * Result: Red is predictable and transparent (no AI), reliably produces a
 * capture once a White piece is adjacent, and never softlocks.
 */
export function selectGuidedRedMove(state: GameState, legal: Move[]): Move | null {
  if (legal.length === 0) return null;

  const capture = legal.find((m) => {
    const cell = state.board[m.toCell];
    const top = cell && cell.length > 0 ? cell[cell.length - 1] : null;
    return top === "W";
  });
  if (capture) return capture;

  const stack = legal.find((m) => {
    const cell = state.board[m.toCell];
    const top = cell && cell.length > 0 ? cell[cell.length - 1] : null;
    return top === "R";
  });
  if (stack) return stack;

  return legal[0] ?? null;
}

export function TryYourself() {
  const { state, dispatch, isPlayerTurn, gameOver } = useGameMachine(
    "W",
    RULES_LC1_2,
  );

  // Count White plies directly from the move history. White moves first, so
  // indices 0, 2, 4, … are White plies.
  const whitePlies = Math.ceil(state.history.moves.length / 2);
  const drillComplete = whitePlies >= TRY_YOURSELF_MAX_PLIES || gameOver;

  // Red's move scheduler. Uses a ref guard rather than `state.aiStatus` +
  // cleanup because a cleanup on a dep change would cancel our own pending
  // timer. The ref is flipped on schedule and reset when the timer fires.
  const scheduledRef = useRef(false);
  const thinking = scheduledRef.current;

  useEffect(() => {
    if (isPlayerTurn || drillComplete) return;
    if (scheduledRef.current) return;

    const legal = legalMoves(state.gameState);
    const move = selectGuidedRedMove(state.gameState, legal);
    if (!move) return;

    scheduledRef.current = true;
    window.setTimeout(() => {
      dispatch({ type: "AI_MOVE_RECEIVED", move });
      scheduledRef.current = false;
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerTurn, drillComplete, state.history.moves.length]);

  const handleSelectCell = useCallback(
    (cellIndex: number) => {
      if (drillComplete) return;
      dispatch({
        type: "SELECT_CELL",
        cellIndex,
        playerColor: "W",
        ruleSet: RULES_LC1_2,
      });
    },
    [dispatch, drillComplete],
  );

  const handleSelectCount = useCallback(
    (numPieces: number) => {
      if (drillComplete) return;
      dispatch({ type: "SELECT_COUNT", numPieces });
    },
    [dispatch, drillComplete],
  );

  const handleSelectDestination = useCallback(
    (toCell: number) => {
      if (drillComplete) return;
      dispatch({ type: "SELECT_DESTINATION", toCell });
    },
    [dispatch, drillComplete],
  );

  const { lang } = useLang();
  const statusLabel = drillComplete
    ? STRINGS.tryYourself.drillDone[lang]
    : isPlayerTurn
      ? STRINGS.tryYourself.yourMove[lang]
      : thinking
        ? STRINGS.tryYourself.redThinking[lang]
        : "";

  return (
    <section
      id="chapter-iii"
      className="relative px-6 py-28 md:py-36 min-h-screen flex flex-col items-center justify-center gap-8"
    >
      <div className="w-full max-w-3xl text-center space-y-4">
        <div className="kicker justify-center">
          II &middot; {STRINGS.chapters.II[lang]}
        </div>
        <h2 className="display text-[clamp(2rem,4.5vw,3.5rem)] text-paper leading-[1.1]">
          {STRINGS.tryYourself.h2[lang]}
        </h2>
        <p className="body text-paper-2 max-w-xl mx-auto">
          {STRINGS.tryYourself.body[lang]}
        </p>
      </div>

      <Board
        state={state.gameState}
        selection={state.selection}
        lastMove={state.lastMove}
        bestMoveCell={null}
        onSelectCell={handleSelectCell}
        onSelectDestination={handleSelectDestination}
        onSelectCount={handleSelectCount}
      />

      <div className="flex flex-col items-center gap-2">
        <div className="mono text-[11px] tracking-[0.25em] uppercase text-paper-3">
          {tf(STRINGS.tryYourself.ply[lang], { n: whitePlies, m: TRY_YOURSELF_MAX_PLIES })}
        </div>
        <div className="mono text-[11px] tracking-[0.2em] uppercase text-vermilion h-4">
          {statusLabel}
        </div>
      </div>

      {drillComplete && (
        <a
          href="#chapter-iv"
          className="kicker text-vermilion underline underline-offset-4 hover:text-paper transition-colors"
        >
          {STRINGS.tryYourself.continue[lang]}
        </a>
      )}
    </section>
  );
}
