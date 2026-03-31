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
  const { analysisEnabled, toggleAnalysis, aiLevel, mctsSimulations } =
    useSettings();
  const isHuman = aiLevel === "human";
  const ai = useAI();
  const { state, dispatch, isPlayerTurn, gameOver, gameWinner, canUndo } =
    useGameMachine(playerColor);

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
      .requestMove(currentGameState, { level, mctsSimulations: sims })
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
          .requestMove(currentGameState, { level: "random" })
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
      .requestEval(state.gameState)
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
      dispatch({ type: "SELECT_CELL", cellIndex, playerColor: activeColor });
    },
    [dispatch, playerColor, isHuman],
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
    <div className="flex flex-1 flex-col">
      {/* Mobile: horizontal eval bar */}
      {analysisEnabled && state.positionEval && (
        <div className="px-4 pt-2 md:hidden">
          <EvalBar
            value={state.positionEval.value}
            proven={state.positionEval.proven}
            direction="horizontal"
          />
        </div>
      )}

      <div className="flex flex-1 items-start justify-center gap-4 p-4 md:items-center">
        {/* Desktop: vertical eval bar */}
        {analysisEnabled && state.positionEval && (
          <div className="hidden h-[420px] md:block">
            <EvalBar
              value={state.positionEval.value}
              proven={state.positionEval.proven}
              direction="vertical"
            />
          </div>
        )}

        {/* Board (center) */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 text-xs text-zinc-400">
            {thinking && (
              <span className="animate-pulse">{turnLabel}</span>
            )}
            {!thinking && turnLabel}
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
        </div>

        {/* Desktop sidebar */}
        <div className="hidden w-[220px] flex-col gap-3 md:flex">
          {analysisEnabled && (
            <AnalysisPanel
              positionEval={state.positionEval}
              loading={state.analysisLoading}
            />
          )}
          <MoveList moves={state.history.moves} />
          <GameControls
            canUndo={canUndo}
            analysisEnabled={analysisEnabled}
            onUndo={handleUndo}
            onToggleAnalysis={toggleAnalysis}
            onNewGame={handleNewGame}
          />
        </div>
      </div>

      {/* Mobile controls (bottom) */}
      <div className="flex flex-col gap-2 px-4 pb-4 md:hidden">
        {analysisEnabled && (
          <AnalysisPanel
            positionEval={state.positionEval}
            loading={state.analysisLoading}
          />
        )}
        <GameControls
          canUndo={canUndo}
          analysisEnabled={analysisEnabled}
          onUndo={handleUndo}
          onToggleAnalysis={toggleAnalysis}
          onNewGame={handleNewGame}
        />
      </div>

      {/* Game end overlay */}
      {gameOver && gameWinner && (
        <GameEndOverlay
          winner={gameWinner}
          onPlayAgain={handleNewGame}
          onChangeLevel={handleChangeLevel}
        />
      )}
    </div>
  );
}
