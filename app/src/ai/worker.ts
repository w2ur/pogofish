/**
 * Web Worker entry point for AI computation.
 *
 * Runs ONNX inference and minimax lookups off the main thread.
 */

import { type GameState, type RuleSet } from "../engine/types";
import { type AIConfig, type AILevel } from "./player";
import { type PositionEval } from "./minimax";

// ---- Message types ----

export interface GetMoveRequest {
  type: "getMove";
  id: number;
  state: GameState;
  config: AIConfig;
}

export interface EvaluateRequest {
  type: "evaluate";
  id: number;
  state: GameState;
  ruleSet?: RuleSet;
}

export interface LoadMinimaxRequest {
  type: "loadMinimax";
  id: number;
}

export type WorkerRequest = GetMoveRequest | EvaluateRequest | LoadMinimaxRequest;

export interface MoveResponse {
  type: "move";
  id: number;
  move: { fromCell: number; numPieces: number; toCell: number };
}

export interface EvalResponse {
  type: "eval";
  id: number;
  evaluation: PositionEval;
}

export interface MinimaxProgressResponse {
  type: "minimaxProgress";
  id: number;
  loaded: number;
  total: number;
}

export interface MinimaxLoadedResponse {
  type: "minimaxLoaded";
  id: number;
}

export interface ErrorResponse {
  type: "error";
  id: number;
  message: string;
}

export type WorkerResponse =
  | MoveResponse
  | EvalResponse
  | MinimaxProgressResponse
  | MinimaxLoadedResponse
  | ErrorResponse;

// Re-export types used by the hook
export type { PositionEval, AIConfig, AILevel };

// ---- Worker logic ----

// Only run worker logic if we're in a Worker context
if (typeof self !== "undefined" && typeof (self as unknown as { document?: unknown }).document === "undefined") {
  // Dynamic import to avoid loading player.ts at module scope in tests
  const playerPromise = import("./player");

  self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const msg = e.data;
    const player = await playerPromise;

    try {
      switch (msg.type) {
        case "getMove": {
          const move = await player.getMove(msg.state, msg.config);
          const response: MoveResponse = {
            type: "move",
            id: msg.id,
            move: { fromCell: move.fromCell, numPieces: move.numPieces, toCell: move.toCell },
          };
          self.postMessage(response);
          break;
        }

        case "evaluate": {
          const evaluation = await player.evaluatePosition(msg.state, msg.ruleSet);
          console.log("[Worker] Eval result:", evaluation);
          const response: EvalResponse = {
            type: "eval",
            id: msg.id,
            evaluation,
          };
          self.postMessage(response);
          break;
        }

        case "loadMinimax": {
          console.log("[Worker] Starting minimax load...");
          await player.startMinimaxLoad((loaded, total) => {
            const progress: MinimaxProgressResponse = {
              type: "minimaxProgress",
              id: msg.id,
              loaded,
              total,
            };
            self.postMessage(progress);
          });
          const table = player.getMinimaxTable();
          console.log("[Worker] Minimax loaded:", table ? table.size + " entries" : "FAILED");
          // Verify a known key
          if (table) {
            const testKey = "/WW/WW////RRWW/RR/RR:R";
            console.log("[Worker] Test lookup:", testKey, "->", table.get(testKey));
          }
          const response: MinimaxLoadedResponse = {
            type: "minimaxLoaded",
            id: msg.id,
          };
          self.postMessage(response);
          break;
        }
      }
    } catch (err) {
      const response: ErrorResponse = {
        type: "error",
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    }
  };
}
