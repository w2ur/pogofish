import type { GameState, Move } from "../../engine/types";
import type { Selection } from "../../hooks/useGame";
import { Cell } from "./Cell";

interface BoardProps {
  state: GameState;
  selection: Selection;
  lastMove: Move | null;
  bestMoveCell: number | null;
  onSelectCell: (cellIndex: number) => void;
  onSelectDestination: (cellIndex: number) => void;
  onSelectCount: (count: number) => void;
}

export function Board({
  state,
  selection,
  lastMove,
  bestMoveCell,
  onSelectCell,
  onSelectDestination,
  onSelectCount,
}: BoardProps) {
  return (
    <div className="grid max-w-[340px] grid-cols-3 gap-1">
      {state.board.map((cell, i) => (
        <Cell
          key={i}
          cell={cell}
          cellIndex={i}
          isSelected={selection.fromCell === i}
          isValidDestination={selection.validDestinations.includes(i)}
          isBestMove={bestMoveCell === i && selection.phase === "idle"}
          isLastMoveFrom={lastMove?.fromCell === i}
          isLastMoveTo={lastMove?.toCell === i}
          showCountSelector={
            selection.phase === "cellSelected" && selection.fromCell === i
          }
          validCounts={selection.validCounts}
          onSelectCell={onSelectCell}
          onSelectDestination={onSelectDestination}
          onSelectCount={onSelectCount}
        />
      ))}
    </div>
  );
}
