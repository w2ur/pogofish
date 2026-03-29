import type { PositionEval } from "../../hooks/useAI";

interface AnalysisPanelProps {
  positionEval: PositionEval | null;
  loading: boolean;
}

export function AnalysisPanel({ positionEval, loading }: AnalysisPanelProps) {
  if (loading) {
    return (
      <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
        Evaluating...
      </div>
    );
  }

  if (!positionEval) {
    return null;
  }

  const { value, source, proven } = positionEval;
  const label = value >= 0 ? `White +${value.toFixed(2)}` : `Red +${Math.abs(value).toFixed(2)}`;
  const sourceLabel = source === "minimax" ? "Minimax" : "AlphaZero";

  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-400">{sourceLabel}:</span>
        <span className="font-mono font-medium text-zinc-100">{label}</span>
        {proven && (
          <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-[10px] font-bold text-green-400">
            PROVEN
          </span>
        )}
      </div>
    </div>
  );
}
