interface PieceCountSelectorProps {
  validCounts: number[];
  onSelect: (count: number) => void;
}

export function PieceCountSelector({
  validCounts,
  onSelect,
}: PieceCountSelectorProps) {
  return (
    <div className="absolute -top-9 left-1/2 z-10 flex -translate-x-1/2 gap-1">
      {validCounts.map((count) => (
        <button
          key={count}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(count);
          }}
          className="flex h-7 w-7 items-center justify-center rounded border border-zinc-500 bg-zinc-800 text-xs font-bold text-zinc-100 hover:border-white hover:bg-zinc-700"
        >
          {count}
        </button>
      ))}
    </div>
  );
}
