interface EvalBarProps {
  /** Value from -1 (Red advantage) to +1 (White advantage). */
  value: number;
  /** Whether the evaluation is proven (minimax). */
  proven: boolean;
  /** Layout direction. */
  direction: "vertical" | "horizontal";
}

export function EvalBar({ value, proven, direction }: EvalBarProps) {
  // Convert value from [-1, 1] to percentage for white (bottom/left)
  const whitePct = Math.round(((value + 1) / 2) * 100);
  const label = value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);

  if (direction === "vertical") {
    return (
      <div className="flex w-6 flex-col overflow-hidden rounded border border-zinc-700">
        {/* Red portion (top) */}
        <div
          className="bg-red-600 transition-all duration-300"
          style={{ height: `${100 - whitePct}%` }}
        />
        {/* White portion (bottom) */}
        <div
          className="relative bg-zinc-200 transition-all duration-300"
          style={{ height: `${whitePct}%` }}
        >
          <span
            className={`absolute inset-x-0 top-1 text-center font-mono text-[8px] leading-none ${
              proven ? "font-bold text-green-700" : "text-zinc-600"
            }`}
          >
            {label}
          </span>
        </div>
      </div>
    );
  }

  // Horizontal
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full border border-zinc-700">
      {/* White portion (left) */}
      <div
        className="bg-zinc-200 transition-all duration-300"
        style={{ width: `${whitePct}%` }}
      />
      {/* Red portion (right) */}
      <div
        className="bg-red-600 transition-all duration-300"
        style={{ width: `${100 - whitePct}%` }}
      />
    </div>
  );
}
