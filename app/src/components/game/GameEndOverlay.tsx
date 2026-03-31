import type { Player } from "../../engine/types";

interface GameEndOverlayProps {
  winner: Player;
  onPlayAgain: () => void;
  onChangeLevel: () => void;
}

export function GameEndOverlay({
  winner,
  onPlayAgain,
  onChangeLevel,
}: GameEndOverlayProps) {
  const winnerText = winner === "W" ? "White wins!" : "Red wins!";
  const winnerColor = winner === "W" ? "text-zinc-100" : "text-red-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-lg border border-zinc-700 bg-zinc-900 px-8 py-6 shadow-xl">
        <h2 className={`text-2xl font-bold ${winnerColor}`}>{winnerText}</h2>
        <div className="flex gap-3">
          <button
            onClick={onPlayAgain}
            className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600"
          >
            Play again
          </button>
          <button
            onClick={onChangeLevel}
            className="rounded border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-400"
          >
            Change level
          </button>
        </div>
      </div>
    </div>
  );
}
