import { GameReplay } from "./GameReplay";

interface StageCardProps {
  label: string;
  description: string;
  stat: string | null;
  game: { moves: [number, number, number][]; winner: string | null };
}

export function StageCard({ label, description, stat, game }: StageCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-start sm:gap-8">
      {/* Replay */}
      <div className="flex shrink-0 flex-col items-center">
        <GameReplay moves={game.moves} autoPlay={true} speed={800} />
      </div>

      {/* Text */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {label}
        </h2>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
        {stat && (
          <p className="mt-1 inline-block rounded-md bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {stat}
          </p>
        )}
      </div>
    </div>
  );
}
