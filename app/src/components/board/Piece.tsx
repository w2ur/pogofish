interface PieceProps {
  color: "W" | "R";
  size?: "sm" | "md";
}

export function Piece({ color, size = "md" }: PieceProps) {
  const bg = color === "W" ? "bg-zinc-200" : "bg-red-600";
  const dimensions =
    size === "sm" ? "h-2.5 w-6" : "h-4 w-12 md:h-5 md:w-16";

  return (
    <div
      className={`${bg} ${dimensions} rounded-[50%] border border-zinc-500/30`}
    />
  );
}
