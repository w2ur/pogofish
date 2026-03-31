interface EvalBarProps {
  /** Value from -1 (Red advantage) to +1 (White advantage). */
  value: number;
  /** Whether the evaluation is proven (minimax). */
  proven: boolean;
  /** Layout direction. */
  direction: "vertical" | "horizontal";
}

export function EvalBar({ value, proven, direction }: EvalBarProps) {
  // Convert value from [-1, 1] to percentage for white (left side)
  const whitePct = Math.round(((value + 1) / 2) * 100);
  const label = value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);

  if (direction === "vertical") {
    return (
      <div className="flex h-full w-7 flex-col overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
        <div
          className="bg-red-500 transition-all duration-300"
          style={{ height: `${100 - whitePct}%` }}
        />
        <div
          className="relative flex-1 bg-zinc-200 transition-all duration-300"
          style={{ height: `${whitePct}%` }}
        >
          <span
            className={`absolute inset-x-0 top-1 text-center font-mono text-[9px] leading-none ${
              proven ? "font-bold text-green-700" : "text-zinc-600"
            }`}
          >
            {label}
          </span>
        </div>
      </div>
    );
  }

  // Horizontal — thicker and more visible
  return (
    <div className="relative flex h-5 w-full overflow-hidden rounded-full border border-zinc-300 dark:border-zinc-700">
      <div
        className="bg-zinc-200 transition-all duration-300"
        style={{ width: `${whitePct}%` }}
      />
      <div
        className="bg-red-500 transition-all duration-300"
        style={{ width: `${100 - whitePct}%` }}
      />
      <span
        className={`absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold ${
          proven ? "text-green-600" : whitePct > 60 ? "text-zinc-600" : "text-zinc-100"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
