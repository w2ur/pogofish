interface PieceProps {
  color: "W" | "R";
  size?: "sm" | "md";
}

/**
 * The interactive (playable) Pogo piece. Same visual language as the
 * editorial SVG board in `story/stage/Board`: a thin elongated disc with
 * a top rim highlight and a darker undershadow band, in the editorial
 * vermilion/parchment palette rather than generic Tailwind reds and zinc.
 */
export function Piece({ color, size = "md" }: PieceProps) {
  const dimensions =
    size === "sm" ? "h-3 w-7" : "h-[18px] w-14 md:h-[22px] md:w-[72px]";

  return (
    <div
      className={`relative ${dimensions} rounded-[50%]`}
      style={
        color === "W"
          ? {
              background:
                "linear-gradient(180deg, var(--board-piece-w-from) 0%, var(--board-piece-w-to) 100%)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.55) inset, 0 -1px 0 rgba(80,70,50,0.35) inset, 0 3px 6px rgba(0,0,0,0.45)",
            }
          : {
              background:
                "linear-gradient(180deg, var(--board-piece-r-from) 0%, var(--board-piece-r-to) 100%)",
              boxShadow:
                "0 1px 0 rgba(255,200,180,0.5) inset, 0 -1px 0 rgba(40,15,5,0.5) inset, 0 3px 6px rgba(0,0,0,0.45)",
            }
      }
    />
  );
}
