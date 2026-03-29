import { useState } from "react";
import { Board } from "../board/Board";
import { initialState } from "../../engine/engine";
import { useGameContext } from "../../stores/GameContext";
import { useSettings } from "../../stores/SettingsContext";
import type { AILevel } from "../../ai/player";

const IDLE_SELECTION = {
  phase: "idle" as const,
  fromCell: null,
  numPieces: null,
  validCounts: [],
  validDestinations: [],
};

const STATIC_STATE = initialState();

const AI_LEVEL_OPTIONS: { value: AILevel; label: string }[] = [
  { value: "random", label: "Random" },
  { value: "dqn", label: "DQN" },
  { value: "alphazero", label: "AlphaZero" },
  { value: "alphazero-mcts", label: "AlphaZero + MCTS" },
];

export function HomeView() {
  const { setView, setPlayerColor } = useGameContext();
  const { aiLevel, setAILevel, mctsSimulations, setMctsSimulations } =
    useSettings();
  const [pendingColor, setPendingColor] = useState<"W" | "R">("W");

  function handlePlay() {
    setPlayerColor(pendingColor);
    setView("game");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
      <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        pogofish
      </h1>

      {/* Static board preview */}
      <Board
        state={STATIC_STATE}
        selection={IDLE_SELECTION}
        lastMove={null}
        bestMoveCell={null}
        onSelectCell={() => {}}
        onSelectDestination={() => {}}
        onSelectCount={() => {}}
      />

      {/* Controls */}
      <div className="flex w-full max-w-[340px] flex-col gap-4">
        {/* AI level selector */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="ai-level"
            className="text-sm font-medium text-zinc-600 dark:text-zinc-400"
          >
            Opponent
          </label>
          <select
            id="ai-level"
            value={aiLevel}
            onChange={(e) => setAILevel(e.target.value as AILevel)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500"
          >
            {AI_LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* MCTS simulations slider — only shown for alphazero-mcts */}
        {aiLevel === "alphazero-mcts" && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="mcts-simulations"
              className="text-sm font-medium text-zinc-600 dark:text-zinc-400"
            >
              MCTS simulations:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {mctsSimulations}
              </span>
            </label>
            <input
              id="mcts-simulations"
              type="range"
              min={10}
              max={200}
              step={10}
              value={mctsSimulations}
              onChange={(e) => setMctsSimulations(Number(e.target.value))}
              className="w-full accent-zinc-700 dark:accent-zinc-300"
            />
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-500">
              <span>10</span>
              <span>200</span>
            </div>
          </div>
        )}

        {/* Player color */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Play as
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingColor("W")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                pendingColor === "W"
                  ? "border-zinc-800 bg-zinc-800 text-zinc-100 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              White
            </button>
            <button
              onClick={() => setPendingColor("R")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                pendingColor === "R"
                  ? "border-red-700 bg-red-600 text-white dark:border-red-500 dark:bg-red-600"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              Red
            </button>
          </div>
        </div>

        {/* Play button */}
        <button
          onClick={handlePlay}
          className="w-full rounded-md bg-zinc-800 px-4 py-3 text-base font-semibold text-zinc-100 transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Play
        </button>
      </div>

      {/* Navigation links */}
      <div className="flex gap-6 text-sm text-zinc-500 dark:text-zinc-400">
        <button
          onClick={() => setView("journey")}
          className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          How the AI learned
        </button>
        <button
          onClick={() => setView("about")}
          className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          About
        </button>
      </div>
    </div>
  );
}
