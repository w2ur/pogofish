interface PieceCountSelectorProps {
  validCounts: number[];
  onSelect: (count: number) => void;
}

/**
 * Pop-up that asks "how many pieces from this stack?" — vermilion accent
 * matches the rest of the article's editorial palette.
 */
export function PieceCountSelector({
  validCounts,
  onSelect,
}: PieceCountSelectorProps) {
  return (
    <div className="absolute -top-10 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
      {validCounts.map((count) => (
        <button
          key={count}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(count);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-sm display text-[15px] text-paper hover:text-ink hover:bg-vermilion border border-vermilion/60 hover:border-vermilion bg-ink-2 transition-colors"
          style={{
            boxShadow: "0 6px 16px -8px rgba(0,0,0,0.6)",
          }}
        >
          {count}
        </button>
      ))}
    </div>
  );
}
