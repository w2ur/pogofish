interface GameControlsProps {
  canUndo: boolean;
  analysisEnabled: boolean;
  onUndo: () => void;
  onToggleAnalysis: () => void;
  onNewGame: () => void;
}

export function GameControls({
  canUndo,
  analysisEnabled,
  onUndo,
  onToggleAnalysis,
  onNewGame,
}: GameControlsProps) {
  const btnClass =
    "rounded border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="flex flex-wrap gap-2">
      <button className={btnClass} disabled={!canUndo} onClick={onUndo}>
        Undo
      </button>
      <button
        className={`${btnClass} ${analysisEnabled ? "border-green-600 text-green-400" : ""}`}
        onClick={onToggleAnalysis}
      >
        Analysis {analysisEnabled ? "ON" : "OFF"}
      </button>
      <button className={btnClass} onClick={onNewGame}>
        New Game
      </button>
    </div>
  );
}
