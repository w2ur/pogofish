import { useEffect, useRef, useState } from "react";
import { Board } from "../board/Board";
import { initialState, applyMove } from "../../engine/engine";
import type { GameState } from "../../engine/types";

interface GameReplayProps {
  moves: [number, number, number][];
  autoPlay: boolean;
  speed?: number;
}

const IDLE_SELECTION = {
  phase: "idle" as const,
  fromCell: null,
  numPieces: null,
  validCounts: [],
  validDestinations: [],
};

const SPEED_OPTIONS = [
  { label: "0.5×", multiplier: 2 },
  { label: "1×", multiplier: 1 },
  { label: "2×", multiplier: 0.5 },
];

export function GameReplay({
  moves,
  autoPlay,
  speed = 1000,
}: GameReplayProps) {
  const [moveIndex, setMoveIndex] = useState(0);
  const [state, setState] = useState<GameState>(initialState);
  const [playing, setPlaying] = useState(autoPlay);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Precompute states for all moves
  const statesRef = useRef<GameState[]>([]);
  useEffect(() => {
    const states: GameState[] = [initialState()];
    for (const [fromCell, numPieces, toCell] of moves) {
      const prev = states[states.length - 1];
      if (!prev) break;
      try {
        states.push(applyMove(prev, { fromCell, numPieces, toCell }));
      } catch {
        break;
      }
    }
    statesRef.current = states;
    setMoveIndex(0);
    setState(states[0] ?? initialState());
    setPlaying(autoPlay);
  }, [moves, autoPlay]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!playing) return;

    intervalRef.current = setInterval(() => {
      setMoveIndex((prev) => {
        const next = prev + 1;
        const states = statesRef.current;
        if (next >= states.length) {
          // Loop: restart
          setState(states[0] ?? initialState());
          return 0;
        }
        setState(states[next] ?? initialState());
        return next;
      });
    }, speed * speedMultiplier);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [playing, speed, speedMultiplier]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Board at smaller size */}
      <div className="scale-[0.59] origin-top">
        <Board
          state={state}
          selection={IDLE_SELECTION}
          lastMove={null}
          bestMoveCell={null}
          onSelectCell={() => {}}
          onSelectDestination={() => {}}
          onSelectCount={() => {}}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 -mt-14">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex gap-1">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setSpeedMultiplier(opt.multiplier)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                speedMultiplier === opt.multiplier
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-600">
          {moveIndex}/{statesRef.current.length - 1}
        </span>
      </div>
    </div>
  );
}
