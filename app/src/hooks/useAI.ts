import { useCallback, useMemo, useRef, useState } from "react";
import { type GameState, type Move, type RuleSet } from "../engine/types";
import type {
  AIConfig,
  WorkerResponse,
  PositionEval,
} from "../ai/worker";

export type { AIConfig, PositionEval };

export interface UseAI {
  requestMove: (state: GameState, config: AIConfig) => Promise<Move>;
  requestEval: (state: GameState, ruleSet?: RuleSet) => Promise<PositionEval>;
  loadMinimax: () => void;
  minimaxProgress: number;
  minimaxLoaded: boolean;
}

export function useAI(): UseAI {
  const workerRef = useRef<Worker | null>(null);
  const nextIdRef = useRef(0);
  const pendingRef = useRef<
    Map<number, { resolve: (val: unknown) => void; reject: (err: Error) => void }>
  >(new Map());

  const [minimaxProgress, setMinimaxProgress] = useState(0);
  const [minimaxLoaded, setMinimaxLoaded] = useState(false);

  // Lazy worker creation — survives StrictMode double-mount
  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL("../ai/worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;

      if (msg.type === "minimaxProgress") {
        const pct = msg.total > 0 ? msg.loaded / msg.total : 0;
        setMinimaxProgress(pct);
        return;
      }

      const pending = pendingRef.current.get(msg.id);
      if (!pending) return;

      switch (msg.type) {
        case "move":
          pendingRef.current.delete(msg.id);
          pending.resolve(msg.move);
          break;
        case "eval":
          pendingRef.current.delete(msg.id);
          pending.resolve(msg.evaluation);
          break;
        case "minimaxLoaded":
          pendingRef.current.delete(msg.id);
          setMinimaxLoaded(true);
          setMinimaxProgress(1);
          pending.resolve(undefined);
          break;
        case "error":
          pendingRef.current.delete(msg.id);
          pending.reject(new Error(msg.message));
          break;
      }
    };

    workerRef.current = worker;
    return worker;
  }, []);

  const sendRequest = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <T,>(request: Record<string, any>): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const worker = getWorker();
        const id = nextIdRef.current++;
        pendingRef.current.set(id, {
          resolve: resolve as (val: unknown) => void,
          reject,
        });
        worker.postMessage({ ...request, id });
      });
    },
    [getWorker],
  );

  const requestMove = useCallback(
    (state: GameState, config: AIConfig): Promise<Move> => {
      return sendRequest<Move>({ type: "getMove", state, config });
    },
    [sendRequest],
  );

  const requestEval = useCallback(
    (state: GameState, ruleSet?: RuleSet): Promise<PositionEval> => {
      return sendRequest<PositionEval>({ type: "evaluate", state, ruleSet });
    },
    [sendRequest],
  );

  const loadMinimax = useCallback(() => {
    sendRequest({ type: "loadMinimax" }).catch(() => {
      // Progress and loaded state are tracked via worker messages
    });
  }, [sendRequest]);

  return useMemo(() => ({
    requestMove,
    requestEval,
    loadMinimax,
    minimaxProgress,
    minimaxLoaded,
  }), [requestMove, requestEval, loadMinimax, minimaxProgress, minimaxLoaded]);
}
