import { useCallback, useEffect, useMemo, useRef } from "react";
import { useGameMachine } from "../../hooks/useGameMachine";
import { useAI } from "../../hooks/useAI";
import { useSettings } from "../../stores/SettingsContext";
import { useGameContext } from "../../stores/GameContext";
import { Board } from "../board/Board";
import { EvalBar } from "../board/EvalBar";
import { MoveList } from "./MoveList";
import { AnalysisPanel } from "./AnalysisPanel";
import { GameControls } from "./GameControls";
import { GameEndOverlay } from "./GameEndOverlay";

export function GameView() {
  const { playerColor, setView } = useGameContext();
  const { analysisEnabled, toggleAnalysis, aiLevel, mctsSimulations, ruleSet } =
    useSettings();
  const isHuman = aiLevel === "human";
  const ai = useAI();
  const { state, dispatch, isPlayerTurn, gameOver, gameWinner, isDraw, canUndo, repetitionCount } =
    useGameMachine(playerColor, ruleSet);
  const isLC1 = "LC1" in ruleSet;
  const isLC3 = "LC3" in ruleSet;

  // Stable refs for values read inside effects but not deps
  const stateRef = useRef(state);
  stateRef.current = state;
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const aiLevelRef = useRef(aiLevel);
  aiLevelRef.current = aiLevel;
  const mctsSimsRef = useRef(mctsSimulations);
  mctsSimsRef.current = mctsSimulations;
  const evalIdRef = useRef(0);

  // Background load decisive minimax positions (~5MB) for analysis
  useEffect(() => {
    aiRef.current.loadMinimax();
  }, []);

  // Effect 1: AI turn — guard is in state (aiStatus), StrictMode-safe
  useEffect(() => {
    if (isPlayerTurn || gameOver || state.aiStatus !== "idle") return;

    const level = aiLevelRef.current;

    // Human vs Human: no AI move needed — both sides are player-controlled
    if (level === "human") return;

    dispatch({ type: "AI_MOVE_REQUESTED" });

    const sims = mctsSimsRef.current;

    // Read gameState from ref to avoid putting it in deps
    const currentGameState = stateRef.current.gameState;

    // Minimum 500ms delay so the player can see the "Thinking..." state
    // and the analysis panel can update before the AI responds
    const startTime = Date.now();
    aiRef.current
      .requestMove(currentGameState, { level, mctsSimulations: sims, ruleSet })
      .then(async (move) => {
        const elapsed = Date.now() - startTime;
        if (elapsed < 500) {
          await new Promise((r) => setTimeout(r, 500 - elapsed));
        }
        dispatch({ type: "AI_MOVE_RECEIVED", move });
      })
      .catch((err) => {
        console.error(`[AI] ${level} failed, falling back to random:`, err);
        return aiRef.current
          .requestMove(currentGameState, { level: "random", ruleSet })
          .then((move) => {
            dispatch({ type: "AI_MOVE_RECEIVED", move });
          });
      })
      .catch((err) => {
        console.error("[AI] Random fallback also failed:", err);
        // Reset aiStatus so the game isn't stuck
        dispatch({ type: "AI_MOVE_RECEIVED", move: { fromCell: 0, numPieces: 1, toCell: 0 } });
      });
    // Only trigger on turn change and aiStatus — NOT on gameState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerTurn, gameOver, state.aiStatus]);

  // Effect 2: Analysis — stale-response guard via evalIdRef
  const stateKey = useMemo(
    () => JSON.stringify(state.gameState),
    [state.gameState],
  );

  useEffect(() => {
    if (!analysisEnabled) return;

    const id = ++evalIdRef.current;
    aiRef.current
      .requestEval(state.gameState, ruleSet)
      .then((evalResult) => {
        if (id === evalIdRef.current) {
          dispatch({ type: "EVAL_RECEIVED", eval: evalResult });
        }
      })
      .catch(() => {
        if (id === evalIdRef.current) {
          dispatch({ type: "EVAL_FAILED" });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, analysisEnabled]);

  // Selection callbacks — in human mode, allow both colors to play
  const handleSelectCell = useCallback(
    (cellIndex: number) => {
      const activeColor = isHuman
        ? stateRef.current.gameState.currentPlayer
        : playerColor;
      dispatch({ type: "SELECT_CELL", cellIndex, playerColor: activeColor, ruleSet });
    },
    [dispatch, playerColor, isHuman, ruleSet],
  );

  const handleSelectCount = useCallback(
    (numPieces: number) => {
      dispatch({ type: "SELECT_COUNT", numPieces });
    },
    [dispatch],
  );

  const handleSelectDestination = useCallback(
    (toCell: number) => {
      dispatch({ type: "SELECT_DESTINATION", toCell });
    },
    [dispatch],
  );

  const handleUndo = useCallback(() => {
    dispatch({ type: "UNDO" });
  }, [dispatch]);

  const handleNewGame = useCallback(() => {
    dispatch({ type: "NEW_GAME" });
  }, [dispatch]);

  const handleChangeLevel = useCallback(() => {
    dispatch({ type: "NEW_GAME" });
    setView("home");
  }, [dispatch, setView]);

  const thinking = state.aiStatus === "thinking";

  const turnLabel = gameOver
    ? ""
    : isHuman
      ? `${state.gameState.currentPlayer === "W" ? "White" : "Red"}'s turn`
      : isPlayerTurn
        ? "Your turn"
        : "Thinking...";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      {/* Eval bar — horizontal, always visible when analysis is on */}
      {analysisEnabled && state.positionEval && (
        <div className="w-full max-w-[min(85vw,320px)] md:max-w-[420px]">
          <EvalBar
            value={state.positionEval.value}
            proven={state.positionEval.proven}
            direction="horizontal"
          />
        </div>
      )}

      {/* Turn indicator + variant status */}
      <div className="flex flex-col items-center gap-1">
        <div className="h-5 text-sm text-zinc-500 dark:text-zinc-400">
          {thinking && <span className="animate-pulse">{turnLabel}</span>}
          {!thinking && turnLabel}
        </div>

        {/* LC1: repetition warning */}
        {isLC1 && !gameOver && repetitionCount > 0 && (
          <div className="rounded-full bg-amber-500/20 px-3 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            Position seen {repetitionCount}x — one more repeat loses!
          </div>
        )}

        {/* LC3: move counter */}
        {isLC3 && !gameOver && (
          <div className="text-xs text-zinc-400 dark:text-zinc-500">
            Move {state.gameState.moveCount} / {(ruleSet as { LC3: { cap: number } }).LC3.cap}
          </div>
        )}
      </div>

      {/* Board — centered hero */}
      <Board
        state={state.gameState}
        selection={state.selection}
        lastMove={state.lastMove}
        bestMoveCell={null}
        onSelectCell={handleSelectCell}
        onSelectDestination={handleSelectDestination}
        onSelectCount={handleSelectCount}
      />

      {/* Analysis panel — below board */}
      {analysisEnabled && (
        <AnalysisPanel
          positionEval={state.positionEval}
          loading={state.analysisLoading}
        />
      )}

      {/* Controls — below board */}
      <GameControls
        canUndo={canUndo}
        analysisEnabled={analysisEnabled}
        onUndo={handleUndo}
        onToggleAnalysis={toggleAnalysis}
        onNewGame={handleNewGame}
      />

      {/* Move list — compact, below controls */}
      {state.history.moves.length > 0 && (
        <div className="w-full max-w-[min(85vw,320px)] md:max-w-[420px]">
          <MoveList moves={state.history.moves} />
        </div>
      )}

      {/* Game end overlay */}
      {gameOver && (
        <GameEndOverlay
          winner={gameWinner}
          isDraw={isDraw}
          onPlayAgain={handleNewGame}
          onChangeLevel={handleChangeLevel}
        />
      )}
    </div>
  );
}
