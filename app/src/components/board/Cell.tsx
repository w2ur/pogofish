import type { Cell as CellType } from "../../engine/types";
import { Piece } from "./Piece";
import { PieceCountSelector } from "./PieceCountSelector";

interface CellProps {
  cell: CellType;
  cellIndex: number;
  isSelected: boolean;
  isValidDestination: boolean;
  isBestMove: boolean;
  isLastMoveFrom: boolean;
  isLastMoveTo: boolean;
  showCountSelector: boolean;
  validCounts: number[];
  onSelectCell: (cellIndex: number) => void;
  onSelectDestination: (cellIndex: number) => void;
  onSelectCount: (count: number) => void;
}

function stackNotation(cell: CellType): string {
  return cell.join("");
}

export function Cell({
  cell,
  cellIndex,
  isSelected,
  isValidDestination,
  isBestMove,
  isLastMoveFrom,
  isLastMoveTo,
  showCountSelector,
  validCounts,
  onSelectCell,
  onSelectDestination,
  onSelectCount,
}: CellProps) {
  const handleClick = () => {
    if (isValidDestination) {
      onSelectDestination(cellIndex);
    } else {
      onSelectCell(cellIndex);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const file = "abc"[cellIndex % 3];
  const rank = 3 - Math.floor(cellIndex / 3);
  const cellLabel = `${file}${rank}`;
  const pieceLabel = cell.length === 0 ? "empty" : cell.join(" over ");
  const ariaLabel = `${cellLabel}, ${pieceLabel}`;

  let borderClass = "border-zinc-700";
  if (isSelected) {
    borderClass = "border-white";
  } else if (isValidDestination) {
    borderClass = "border-green-500 animate-pulse";
  } else if (isBestMove) {
    borderClass = "border-green-500";
  } else if (isLastMoveFrom || isLastMoveTo) {
    borderClass = "border-amber-500";
  }

  const notation = stackNotation(cell);

  return (
    <div
      className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded border-2 bg-zinc-900 ${borderClass} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-vermilion focus-visible:ring-offset-2 focus-visible:ring-offset-ink`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={isSelected || undefined}
    >
      {showCountSelector && (
        <PieceCountSelector
          validCounts={validCounts}
          onSelect={onSelectCount}
        />
      )}

      {cell.length > 0 ? (
        <>
          <div className="flex flex-col items-center">
            {[...cell].reverse().map((piece, i) => {
              const isTop = i === 0;
              return (
                <div
                  key={i}
                  className={isTop ? "" : "opacity-60"}
                  style={{ marginTop: i > 0 ? "-2px" : undefined }}
                >
                  <Piece color={piece as "W" | "R"} size="md" />
                </div>
              );
            })}
          </div>
          {notation.length > 1 && (
            <span className="absolute bottom-0.5 right-1 font-mono text-[9px] text-zinc-500">
              {notation}
            </span>
          )}
        </>
      ) : (
        <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
      )}

      {isBestMove && (
        <span className="absolute top-0.5 left-1 text-[8px] font-bold text-green-500">
          best
        </span>
      )}
    </div>
  );
}
