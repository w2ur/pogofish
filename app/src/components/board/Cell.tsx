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

  // Editorial palette + state-aware accents. Vermilion replaces both green
  // (valid destination, best) and amber (last move) so the playable board
  // matches the rest of the article.
  let stateClass = "";
  let stateStyle: React.CSSProperties | undefined;
  if (isSelected) {
    stateStyle = {
      boxShadow:
        "inset 0 0 0 2px var(--color-paper), 0 0 22px -4px rgba(236,226,203,0.5)",
    };
  } else if (isValidDestination) {
    stateClass = "animate-pulse";
    stateStyle = {
      boxShadow:
        "inset 0 0 0 2px var(--color-vermilion), 0 0 22px -4px rgba(217,79,44,0.6)",
    };
  } else if (isBestMove) {
    stateStyle = {
      boxShadow:
        "inset 0 0 0 2px var(--color-vermilion), 0 0 18px -6px rgba(217,79,44,0.55)",
    };
  } else if (isLastMoveFrom || isLastMoveTo) {
    stateStyle = {
      boxShadow:
        "inset 0 0 0 2px var(--color-vermilion-soft), 0 0 14px -6px rgba(240,130,95,0.45)",
    };
  } else {
    stateStyle = {
      boxShadow:
        "inset 0 0 0 1px var(--color-hair), 0 8px 24px -14px rgba(0,0,0,0.8)",
    };
  }

  const notation = stackNotation(cell);

  return (
    <div
      className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-[3px] transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-vermilion focus-visible:ring-offset-2 focus-visible:ring-offset-ink ${stateClass}`}
      style={{
        background:
          "linear-gradient(180deg, var(--color-ink-2) 0%, var(--color-ink) 100%)",
        ...stateStyle,
      }}
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
                  className={isTop ? "" : "opacity-70"}
                  style={{ marginTop: i > 0 ? "-3px" : undefined }}
                >
                  <Piece color={piece as "W" | "R"} size="md" />
                </div>
              );
            })}
          </div>
          {notation.length > 1 && (
            <span className="absolute bottom-0.5 right-1 mono text-[9px] text-paper-3">
              {notation}
            </span>
          )}
        </>
      ) : (
        <div className="h-1 w-1 rounded-full bg-paper-3 opacity-25" />
      )}

      {isBestMove && (
        <span className="absolute top-1 left-1.5 mono text-[8px] tracking-[0.18em] uppercase text-vermilion">
          best
        </span>
      )}
    </div>
  );
}
