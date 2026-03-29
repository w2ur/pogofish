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
  const aiRef = useRef(ai);
  aiRef.current = ai;

  // Serialize state to a string to use as a stable dependency
  const stateKey = JSON.stringify(state);

  useEffect(() => {
    if (!enabled) {
      setPositionEval(null);
      setBestMoveCell(null);
      setLoading(false);
      return;
    }

    const currentId = ++requestIdRef.current;
    setLoading(true);

    aiRef.current
      .requestEval(state)
      .then((evalResult) => {
        if (currentId !== requestIdRef.current) return;
        setPositionEval(evalResult);
        setLoading(false);
        setBestMoveCell(null); // Best move highlighting deferred to future enhancement
      })
      .catch(() => {
        if (currentId !== requestIdRef.current) return;
        setPositionEval(null);
        setBestMoveCell(null);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, enabled]);

  return { positionEval, bestMoveCell, loading };
}
