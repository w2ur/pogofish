import { useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/types";
import type { UseAI, PositionEval } from "./useAI";

export interface UseAnalysis {
  positionEval: PositionEval | null;
  bestMoveCell: number | null;
  loading: boolean;
}

export function useAnalysis(
  state: GameState,
  enabled: boolean,
  ai: UseAI,
): UseAnalysis {
  const [positionEval, setPositionEval] = useState<PositionEval | null>(null);
  const [bestMoveCell, setBestMoveCell] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setPositionEval(null);
      setBestMoveCell(null);
      setLoading(false);
      return;
    }

    const currentId = ++requestIdRef.current;
    setLoading(true);

    ai.requestEval(state)
      .then((evalResult) => {
        // Only apply if this is still the latest request
        if (currentId !== requestIdRef.current) return;
        setPositionEval(evalResult);
        setLoading(false);

        // Derive best move cell from eval result
        // The eval result itself doesn't contain best move info,
        // but we can use the minimax table via another request
        // For now, bestMoveCell comes from the eval source
        // We'll compute it from the AI's move suggestion
        ai.requestMove(state, { level: "minimax" })
          .then((move) => {
            if (currentId !== requestIdRef.current) return;
            setBestMoveCell(move.fromCell);
          })
          .catch(() => {
            // Minimax not loaded or failed — try random as fallback
            if (currentId !== requestIdRef.current) return;
            setBestMoveCell(null);
          });
      })
      .catch(() => {
        if (currentId !== requestIdRef.current) return;
        setPositionEval(null);
        setBestMoveCell(null);
        setLoading(false);
      });
  }, [state, enabled, ai]);

  return { positionEval, bestMoveCell, loading };
}
