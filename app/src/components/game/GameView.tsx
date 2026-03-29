import { useCallback, useEffect, useRef } from "react";
import { useGame } from "../../hooks/useGame";
import { useAI } from "../../hooks/useAI";
import { useAnalysis } from "../../hooks/useAnalysis";
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
  const ai = useAI();
  const game = useGame(playerColor);
  const analysis = useAnalysis(game.state, analysisEnabled, ai);
  const aiMoveInFlight = useRef(false);

  // Keep stable refs to avoid effect dependency issues
  const gameRef = useRef(game);
  gameRef.current = game;
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const aiLevelRef = useRef(aiLevel);
  aiLevelRef.current = aiLevel;
  const mctsSimsRef = useRef(mctsSimulations);
  mctsSimsRef.current = mctsSimulations;

  // Start minimax background load on mount
  useEffect(() => {
    aiRef.current.loadMinimax();
  }, []);

  // Request AI move when it becomes AI's turn
  useEffect(() => {
    if (game.isPlayerTurn || game.gameOver || aiMoveInFlight.current) return;

    aiMoveInFlight.current = true;
    const level = aiLevelRef.current;
    const sims = mctsSimsRef.current;
    console.log(`[AI] Requesting move: level=${level}, mcts=${sims}`);

    aiRef.current
      .requestMove(gameRef.current.state, { level, mctsSimulations: sims })
      .then((move) => {
        console.log(`[AI] Got move from ${level}:`, move);
        gameRef.current.applyAIMove(move);
      })
      .catch((err) => {
        console.error(`[AI] ${level} failed, falling back to random:`, err);
        return aiRef.current
          .requestMove(gameRef.current.state, { level: "random" })
          .then((move) => {
            gameRef.current.applyAIMove(move);
          });
      })
      .catch((err) => {
        console.error("[AI] Random fallback also failed:", err);
      })
      .finally(() => {
        aiMoveInFlight.current = false;
      });
  }, [game.isPlayerTurn, game.gameOver]);

  const handleNewGame = useCallback(() => {
    aiMoveInFlight.current = false;
    game.newGame();
  }, [game.newGame]);

  const handleChangeLevel = useCallback(() => {
    aiMoveInFlight.current = false;
    game.newGame();
    setView("home");
  }, [game.newGame, setView]);

  const canUndo =
    game.isPlayerTurn && !game.gameOver && game.history.states.length >= 3;

  const turnLabel = game.gameOver
    ? ""
    : game.isPlayerTurn
      ? "Your turn"
      : "Thinking...";

  return (
    <div className="flex flex-1 flex-col">
      {/* Mobile: horizontal eval bar */}
      {analysisEnabled && analysis.positionEval && (
        <div className="px-4 pt-2 md:hidden">
          <EvalBar
            value={analysis.positionEval.value}
            proven={analysis.positionEval.proven}
            direction="horizontal"
          />
        </div>
      )}

      <div className="flex flex-1 items-start justify-center gap-4 p-4 md:items-center">
        {/* Desktop: vertical eval bar */}
        {analysisEnabled && analysis.positionEval && (
          <div className="hidden h-[420px] md:block">
            <EvalBar
              value={analysis.positionEval.value}
              proven={analysis.positionEval.proven}
              direction="vertical"
            />
          </div>
        )}

        {/* Board (center) */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 text-xs text-zinc-400">
            {ai.thinking && (
              <span className="animate-pulse">{turnLabel}</span>
            )}
            {!ai.thinking && turnLabel}
          </div>
          <Board
            state={game.state}
            selection={game.selection}
            lastMove={game.lastMove}
            bestMoveCell={
              analysisEnabled ? analysis.bestMoveCell : null
            }
            onSelectCell={game.selectCell}
            onSelectDestination={game.selectDestination}
            onSelectCount={game.selectCount}
          />
        </div>

        {/* Desktop sidebar */}
        <div className="hidden w-[220px] flex-col gap-3 md:flex">
          {analysisEnabled && (
            <AnalysisPanel
              positionEval={analysis.positionEval}
              loading={analysis.loading}
            />
          )}
          <MoveList moves={game.history.moves} />
          <GameControls
            canUndo={canUndo}
            analysisEnabled={analysisEnabled}
            onUndo={game.undo}
            onToggleAnalysis={toggleAnalysis}
            onNewGame={handleNewGame}
          />
        </div>
      </div>

      {/* Mobile controls (bottom) */}
      <div className="flex flex-col gap-2 px-4 pb-4 md:hidden">
        {analysisEnabled && (
          <AnalysisPanel
            positionEval={analysis.positionEval}
            loading={analysis.loading}
          />
        )}
        <GameControls
          canUndo={canUndo}
          analysisEnabled={analysisEnabled}
          onUndo={game.undo}
          onToggleAnalysis={toggleAnalysis}
          onNewGame={handleNewGame}
        />
      </div>

      {/* Game end overlay */}
      {game.gameOver && game.gameWinner && (
        <GameEndOverlay
          winner={game.gameWinner}
          onPlayAgain={handleNewGame}
          onChangeLevel={handleChangeLevel}
        />
      )}
    </div>
  );
}
