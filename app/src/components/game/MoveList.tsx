import { useEffect, useRef } from "react";
import type { Move } from "../../engine/types";

interface MoveListProps {
  moves: Move[];
}

function moveNotation(move: Move): string {
  return `${move.fromCell}\u2192${move.toCell} \u00d7${move.numPieces}`;
}

export function MoveList({ moves }: MoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length]);

  // Pair moves: [white, red] per row
  const rows: { num: number; white: Move | null; red: Move | null }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i] ?? null,
      red: moves[i + 1] ?? null,
    });
  }

  if (rows.length === 0) {
    return (
      <div className="text-xs text-zinc-500">No moves yet</div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-48 overflow-y-auto rounded border border-zinc-700 bg-zinc-900 p-1"
    >
      <div className="grid grid-cols-[2rem_1fr_1fr] gap-x-1 gap-y-0.5 font-mono text-[11px]">
        {rows.map((row) => (
          <div key={row.num} className="contents">
            <span className="text-zinc-500">{row.num}.</span>
            <span className="text-zinc-200">
              {row.white ? moveNotation(row.white) : ""}
            </span>
            <span className="text-red-400">
              {row.red ? moveNotation(row.red) : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
