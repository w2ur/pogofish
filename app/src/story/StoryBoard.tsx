import type { CSSProperties } from "react";
import type { StoryBoard } from "./data";

const COORDS = ["a3", "b3", "c3", "a2", "b2", "c2", "a1", "b1", "c1"];

interface Props {
  board: StoryBoard;
  size?: "default" | "mini" | "large";
  showCoords?: boolean;
  dim?: boolean;
  highlightCell?: number | null;
  style?: CSSProperties;
  className?: string;
  label?: string;
}

export function StoryBoard({
  board,
  size = "default",
  showCoords = true,
  dim = false,
  highlightCell = null,
  style,
  className = "",
  label,
}: Props) {
  const sizeClass = size === "mini" ? "mini" : size === "large" ? "large" : "";

  const white = board.reduce((n, cell) => n + cell.filter((p) => p === "W").length, 0);
  const red = board.reduce((n, cell) => n + cell.filter((p) => p === "R").length, 0);
  const ariaLabel = label
    ? `${label}: Pogo board, ${white} white and ${red} red pieces.`
    : `Pogo board, ${white} white and ${red} red pieces.`;

  return (
    <div className={`inline-flex flex-col items-center gap-3 ${className}`} style={style}>
      <div
        role="img"
        aria-label={ariaLabel}
        className={`pogo-board ${sizeClass} transition-[opacity,filter] duration-700`}
        style={{
          opacity: dim ? 0.5 : 1,
          filter: dim ? "saturate(0.7)" : "none",
        }}
      >
        {board.map((cell, i) => (
          <div
            key={i}
            className="pogo-cell"
            style={{
              boxShadow:
                highlightCell === i
                  ? "inset 0 0 0 1px var(--color-vermilion), 0 0 22px -4px rgba(217,79,44,0.5)"
                  : undefined,
            }}
          >
            {cell.length === 0 ? null : (
              cell.map((piece, j) => (
                <div
                  key={j}
                  className={`pogo-piece ${piece === "W" ? "white" : "red"}`}
                  style={{
                    transitionDelay: `${j * 40}ms`,
                  }}
                />
              ))
            )}
            {showCoords && <span className="pogo-coord">{COORDS[i]}</span>}
          </div>
        ))}
      </div>
      {label && (
        <div className="mono text-[10px] tracking-[0.3em] uppercase text-paper-3">
          {label}
        </div>
      )}
    </div>
  );
}
