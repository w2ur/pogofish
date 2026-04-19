import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "../components/board/Board";
import { useGameMachine } from "../hooks/useGameMachine";
import { legalMoves } from "../engine/engine";
import type { GameState, Move } from "../engine/types";
import { RULES_LC1_2 } from "../engine/types";

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
  const [whitePlies, setWhitePlies] = useState(0);
  const [redThinking, setRedThinking] = useState(false);
  const lastMovesLenRef = useRef(0);

  const {
    state,
    dispatch,
    isPlayerTurn,
    gameOver,
  } = useGameMachine("W", RULES_LC1_2);

  const drillComplete = whitePlies >= TRY_YOURSELF_MAX_PLIES || gameOver;

  // Watch move history. When a new move lands, (a) if it was White's, bump the
  // ply counter; (b) if it's now Red's turn and the drill isn't over, schedule
  // Red's scripted response.
  useEffect(() => {
    const movesLen = state.history.moves.length;
    if (movesLen === lastMovesLenRef.current) return;

    const lastMove = state.history.moves[movesLen - 1];
    const movesByWhiteSoFar = Math.ceil(movesLen / 2);
    if (lastMove && movesLen % 2 === 1) {
      // Odd-length → White just moved (W moves first).
      setWhitePlies(movesByWhiteSoFar);
    }
    lastMovesLenRef.current = movesLen;
  }, [state.history.moves.length]);

  useEffect(() => {
    if (drillComplete) return;
    if (isPlayerTurn) return;
    if (redThinking) return;

    setRedThinking(true);
    const legal = legalMoves(state.gameState);
    const move = selectGuidedRedMove(state.gameState, legal);
    if (!move) {
      setRedThinking(false);
      return;
    }

    const handle = window.setTimeout(() => {
      dispatch({ type: "AI_MOVE_RECEIVED", move });
      setRedThinking(false);
    }, 450);

    return () => {
      window.clearTimeout(handle);
      setRedThinking(false);
    };
  }, [isPlayerTurn, drillComplete, state.gameState, dispatch, redThinking]);

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

  const statusLabel = drillComplete
    ? "Drill complete."
    : isPlayerTurn
      ? "Your move."
      : redThinking
        ? "Red is thinking…"
        : "";

  return (
    <section
      id="chapter-iii"
      className="relative px-6 py-28 md:py-36 min-h-screen flex flex-col items-center justify-center gap-8"
    >
      <div className="w-full max-w-3xl text-center space-y-4">
        <div className="kicker justify-center">III &middot; Five moves</div>
        <h2 className="display text-[clamp(2rem,4.5vw,3.5rem)] text-paper leading-[1.1]">
          Try a few moves before we go on.
        </h2>
        <p className="body text-paper-2 max-w-xl mx-auto">
          You play <span className="text-paper">White</span>. Red answers with a
          fixed rule: capture if it can, otherwise stack, otherwise pick the
          first legal move. After five of your plies, the article scrolls on.
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
          ply {whitePlies} / {TRY_YOURSELF_MAX_PLIES}
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
          ↓ continue reading
        </a>
      )}
    </section>
  );
}
