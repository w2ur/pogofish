import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "../components/board/Board";
import { EvalBar } from "../components/board/EvalBar";
import { MoveList } from "../components/game/MoveList";
import { AnalysisPanel } from "../components/game/AnalysisPanel";
import { GameControls } from "../components/game/GameControls";
import { useAI } from "../hooks/useAI";
import { useGameMachine } from "../hooks/useGameMachine";
import { useSettings, type GameVariant } from "../stores/SettingsContext";
import { useGameContext } from "../stores/GameContext";
import type { AILevel } from "../ai/player";
import type { Player } from "../engine/types";
import { Term } from "./Term";
import { useReveal } from "./useReveal";
import { CHAPTERS } from "./data";

/* -------------------------------------------------------------------------- */
/* Settings UI — reused from the prior Scene9Play                             */
/* -------------------------------------------------------------------------- */

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <div className="mono text-[10px] tracking-[0.25em] uppercase text-vermilion">
          {label}
        </div>
        <div className="mono text-[10px] text-paper-3 max-w-[60%] text-right">
          {hint}
        </div>
      </div>
      {children}
    </div>
  );
}

function VariantToggle({
  variant,
  setVariant,
}: {
  variant: GameVariant;
  setVariant: (v: GameVariant) => void;
}) {
  const opts: { id: GameVariant; title: string; sub: string }[] = [
    { id: "sudden-death", title: "Sudden Death", sub: "repeat → lose" },
    { id: "classic", title: "Classic", sub: "29-move cap" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {opts.map((o) => {
        const active = variant === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setVariant(o.id)}
            className={`text-left px-4 py-3 border rounded-sm transition-all ${
              active
                ? "border-vermilion bg-vermilion/10 text-paper"
                : "border-hair text-paper-2 hover:border-paper-3"
            }`}
          >
            <div className="display text-xl">{o.title}</div>
            <div className="mono text-[10px] tracking-[0.15em] uppercase text-paper-3 mt-1">
              {o.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const OPPONENTS: { id: AILevel; label: string; hint: string }[] = [
  { id: "human", label: "Human (hot-seat)", hint: "no AI" },
  { id: "random", label: "Random", hint: "noise" },
  { id: "dqn", label: "DQN", hint: "first try" },
  { id: "alphazero", label: "AlphaZero", hint: "current best" },
  { id: "alphazero-mcts", label: "AlphaZero + MCTS", hint: "strongest" },
];

function OpponentSelect({
  value,
  onChange,
}: {
  value: AILevel;
  onChange: (v: AILevel) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {OPPONENTS.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`flex items-baseline justify-between px-4 py-2.5 rounded-sm transition-colors text-left ${
              active ? "bg-vermilion/10 text-paper" : "text-paper-2 hover:bg-ink-3"
            }`}
          >
            <span>{o.label}</span>
            <span className="mono text-[10px] tracking-[0.15em] uppercase text-paper-3">
              {o.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ColorToggle({
  color,
  setColor,
}: {
  color: Player;
  setColor: (c: Player) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["W", "R"] as const).map((c) => {
        const active = color === c;
        const label = c === "W" ? "White (first)" : "Red";
        return (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`px-4 py-3 border rounded-sm transition-all ${
              active
                ? "border-vermilion bg-vermilion/10 text-paper"
                : "border-hair text-paper-2 hover:border-paper-3"
            }`}
          >
            <div className="display text-lg">{label}</div>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Active game session — mounted on "Begin" and re-mounted on "Play again"    */
/* -------------------------------------------------------------------------- */

function PlaySession({
  onPlayAgain,
  onChangeSettings,
}: {
  onPlayAgain: () => void;
  onChangeSettings: () => void;
}) {
  const { playerColor } = useGameContext();
  const { analysisEnabled, toggleAnalysis, aiLevel, mctsSimulations, ruleSet } =
    useSettings();
  const isHuman = aiLevel === "human";
  const ai = useAI();
  const {
    state,
    dispatch,
    isPlayerTurn,
    gameOver,
    gameWinner,
    isDraw,
    canUndo,
    repetitionCount,
  } = useGameMachine(playerColor, ruleSet);
  const isLC1 = "LC1" in ruleSet;
  const isLC3 = "LC3" in ruleSet;

  const stateRef = useRef(state);
  stateRef.current = state;
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const aiLevelRef = useRef(aiLevel);
  aiLevelRef.current = aiLevel;
  const mctsSimsRef = useRef(mctsSimulations);
  mctsSimsRef.current = mctsSimulations;
  const evalIdRef = useRef(0);

  useEffect(() => {
    aiRef.current.loadMinimax();
  }, []);

  useEffect(() => {
    if (isPlayerTurn || gameOver || state.aiStatus !== "idle") return;

    const level = aiLevelRef.current;
    if (level === "human") return;

    dispatch({ type: "AI_MOVE_REQUESTED" });

    const sims = mctsSimsRef.current;
    const currentGameState = stateRef.current.gameState;
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
        dispatch({
          type: "AI_MOVE_RECEIVED",
          move: { fromCell: 0, numPieces: 1, toCell: 0 },
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerTurn, gameOver, state.aiStatus]);

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

  const handleSelectCell = useCallback(
    (cellIndex: number) => {
      const activeColor = isHuman
        ? stateRef.current.gameState.currentPlayer
        : playerColor;
      dispatch({
        type: "SELECT_CELL",
        cellIndex,
        playerColor: activeColor,
        ruleSet,
      });
    },
    [dispatch, playerColor, isHuman, ruleSet],
  );

  const handleSelectCount = useCallback(
    (numPieces: number) => dispatch({ type: "SELECT_COUNT", numPieces }),
    [dispatch],
  );

  const handleSelectDestination = useCallback(
    (toCell: number) => dispatch({ type: "SELECT_DESTINATION", toCell }),
    [dispatch],
  );

  const handleUndo = useCallback(() => dispatch({ type: "UNDO" }), [dispatch]);

  const thinking = state.aiStatus === "thinking";
  const turnLabel = gameOver
    ? ""
    : isHuman
      ? `${state.gameState.currentPlayer === "W" ? "White" : "Red"}'s turn`
      : isPlayerTurn
        ? "Your turn"
        : "Thinking…";

  return (
    <div className="flex flex-col items-center gap-5">
      {analysisEnabled && state.positionEval && (
        <div className="w-full max-w-[min(85vw,420px)]">
          <EvalBar
            value={state.positionEval.value}
            proven={state.positionEval.proven}
            direction="horizontal"
          />
        </div>
      )}

      <div className="flex flex-col items-center gap-1">
        <div className="mono text-[11px] tracking-[0.25em] uppercase h-4 text-paper-3">
          {thinking ? <span className="animate-pulse">{turnLabel}</span> : turnLabel}
        </div>
        {isLC1 && !gameOver && repetitionCount > 0 && (
          <div className="rounded-full bg-vermilion/15 px-3 py-0.5 text-xs font-medium text-vermilion">
            Position seen {repetitionCount}× — one more repeat loses.
          </div>
        )}
        {isLC3 && !gameOver && (
          <div className="mono text-[10px] text-paper-3">
            Move {state.gameState.moveCount} /{" "}
            {(ruleSet as { LC3: { cap: number } }).LC3.cap}
          </div>
        )}
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
        onNewGame={onPlayAgain}
      />

      {state.history.moves.length > 0 && (
        <div className="w-full max-w-[min(85vw,420px)]">
          <MoveList moves={state.history.moves} />
        </div>
      )}

      {gameOver && (
        <div className="mt-4 flex flex-col items-center gap-4 rounded-sm border border-hair bg-ink-2 px-8 py-6">
          <div className="display text-2xl text-paper">
            {isDraw ? "Draw." : gameWinner === "W" ? "White wins." : "Red wins."}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onPlayAgain}
              className="mono text-[11px] tracking-[0.25em] uppercase bg-vermilion text-ink px-5 py-2.5 rounded-sm hover:bg-vermilion-soft transition-colors"
            >
              Play again
            </button>
            <button
              onClick={onChangeSettings}
              className="mono text-[11px] tracking-[0.25em] uppercase border border-hair text-paper-2 px-5 py-2.5 rounded-sm hover:border-paper-3 transition-colors"
            >
              Change settings
            </button>
            <a
              href="#chapter-x"
              className="mono text-[11px] tracking-[0.25em] uppercase text-paper-3 px-5 py-2.5 hover:text-vermilion transition-colors"
            >
              ↓ continue reading
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PlayScene — scene IX, climax                                               */
/* -------------------------------------------------------------------------- */

export function PlayScene() {
  const { playerColor, setPlayerColor } = useGameContext();
  const { variant, setVariant, aiLevel, setAILevel, mctsSimulations, setMctsSimulations } =
    useSettings();
  const [started, setStarted] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const ref = useReveal<HTMLDivElement>();

  const handleBegin = useCallback(() => {
    setSessionKey((k) => k + 1);
    setStarted(true);
  }, []);

  const handlePlayAgain = useCallback(() => {
    setSessionKey((k) => k + 1);
  }, []);

  const handleChangeSettings = useCallback(() => {
    setStarted(false);
  }, []);

  return (
    <section
      id="play"
      className="relative py-28 md:py-36 px-6 md:px-10 border-t border-hair overflow-hidden"
      style={{ scrollMarginTop: 80 }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 50%, rgba(217,79,44,0.08), transparent 75%)",
        }}
      />
      <div className="relative mx-auto max-w-5xl space-y-12">
        <div ref={ref} className="reveal space-y-4 text-center">
          <div className="kicker justify-center">
            {CHAPTERS[9]!.numeral} &middot; {CHAPTERS[9]!.kicker}
          </div>
          <h2 className="display text-[clamp(2.25rem,5vw,4rem)] text-paper max-w-3xl mx-auto leading-[1.05]">
            Against an opponent that learned this{" "}
            <span className="display-italic text-vermilion">rewritten</span> game from a
            million games of itself.
          </h2>
          <p className="text-paper-2 max-w-xl mx-auto">
            Pick a rule. Pick a side. The network running in your browser is the same
            one that won the tournament — exported through{" "}
            <Term term="ONNX">ONNX</Term> and loaded client-side, no server in the
            loop.
          </p>
        </div>

        {!started ? (
          <div className="mx-auto max-w-xl flex flex-col gap-8 border border-hair bg-ink-2 p-6 md:p-8 rounded-sm">
            <SettingRow
              label="Rule"
              hint="The losing condition the game is played under."
            >
              <VariantToggle variant={variant} setVariant={setVariant} />
            </SettingRow>

            <SettingRow
              label="Opponent"
              hint="Which network evaluates positions."
            >
              <OpponentSelect value={aiLevel} onChange={setAILevel} />
            </SettingRow>

            {aiLevel === "alphazero-mcts" && (
              <SettingRow
                label="MCTS simulations"
                hint="Rollouts per move. More = slower, stronger."
              >
                <div className="flex flex-col gap-2">
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={10}
                    value={mctsSimulations}
                    onChange={(e) => setMctsSimulations(Number(e.target.value))}
                    className="w-full accent-vermilion"
                  />
                  <div className="flex justify-between mono text-[10px] text-paper-3">
                    <span>10</span>
                    <span className="text-vermilion">{mctsSimulations}</span>
                    <span>200</span>
                  </div>
                </div>
              </SettingRow>
            )}

            {aiLevel !== "human" && (
              <SettingRow label="Play as" hint="Your color on the board.">
                <ColorToggle color={playerColor} setColor={setPlayerColor} />
              </SettingRow>
            )}

            <button
              onClick={handleBegin}
              className="mt-2 mono text-[12px] tracking-[0.35em] uppercase bg-vermilion text-ink px-6 py-4 rounded-sm hover:bg-vermilion-soft transition-colors"
            >
              Begin the game →
            </button>
          </div>
        ) : (
          <PlaySession
            key={sessionKey}
            onPlayAgain={handlePlayAgain}
            onChangeSettings={handleChangeSettings}
          />
        )}
      </div>
    </section>
  );
}
