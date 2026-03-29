interface PieceProps {
  color: "W" | "R";
  size?: "sm" | "md";
}

export function Piece({ color, size = "md" }: PieceProps) {
  const bg = color === "W" ? "bg-zinc-200" : "bg-red-600";
  const dimensions =
    size === "sm" ? "h-2 w-4" : "h-3 w-6";

  return (
    <div
      className={`${bg} ${dimensions} rounded-[50%] border border-zinc-500/30`}
    />
  );
}
