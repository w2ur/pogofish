import { type GameState, type Move } from "../engine/types";
import { randomMove } from "./random";
import { OnnxModel } from "./onnx";
import {
  type MinimaxTable,
  type PositionEval,
  load as loadMinimaxTable,
  evaluate as minimaxEvaluate,
} from "./minimax";

export type AILevel = "human" | "random" | "dqn" | "alphazero" | "alphazero-mcts" | "minimax";

export interface AIConfig {
  level: AILevel;
  mctsSimulations?: number;
}

// Singleton model instances (lazy-loaded)
let dqnModel: OnnxModel | null = null;
let alphazeroModel: OnnxModel | null = null;
let minimaxTable: MinimaxTable | null = null;
let minimaxLoadPromise: Promise<MinimaxTable> | null = null;

async function getDqnModel(): Promise<OnnxModel> {
  if (!dqnModel) {
    dqnModel = new OnnxModel();
    await dqnModel.load("/models/dqn_tiny.onnx");
  }
  return dqnModel;
}

async function getAlphazeroModel(): Promise<OnnxModel> {
  if (!alphazeroModel) {
    alphazeroModel = new OnnxModel();
    await alphazeroModel.load("/models/alphazero_cnn.onnx");
  }
  return alphazeroModel;
}

/** Start background download of the minimax table. */
export function startMinimaxLoad(
  onProgress?: (loaded: number, total: number) => void,
): Promise<MinimaxTable> {
  if (minimaxTable) return Promise.resolve(minimaxTable);
  if (!minimaxLoadPromise) {
    minimaxLoadPromise = loadMinimaxTable(
      "/models/minimax_table.json.gz",
      onProgress,
    ).then((table) => {
      minimaxTable = table;
      return table;
    });
  }
  return minimaxLoadPromise;
}

/** Returns the singleton MinimaxTable instance, or null if not yet loaded. */
export function getMinimaxTable(): MinimaxTable | null {
  return minimaxTable;
}

/** Dispatch to the appropriate AI engine. */
export async function getMove(
  state: GameState,
  config: AIConfig,
): Promise<Move> {
  switch (config.level) {
    case "human":
      throw new Error("getMove called for human player — should not happen");

    case "random":
      return randomMove(state);

    case "dqn": {
      const model = await getDqnModel();
      return model.bestMove(state);
    }

    case "alphazero": {
      const model = await getAlphazeroModel();
      return model.bestMove(state);
    }

    case "alphazero-mcts": {
      const model = await getAlphazeroModel();
      // Dynamic import to keep MCTS out of initial bundle
      const { mctsSearch } = await import("./mcts");
      return mctsSearch(
        state,
        (s) => model.evalForMcts(s),
        config.mctsSimulations ?? 50,
      );
    }

    case "minimax":
      // Minimax is analysis-only (depth-20 table runs out after ~3 moves).
      // Fall through to AlphaZero+MCTS as the strongest playable AI.
      return getMove(state, { level: "alphazero-mcts", mctsSimulations: config.mctsSimulations ?? 100 });
  }
}

/** Evaluate a position. Tries minimax first, falls back to AlphaZero. */
export async function evaluatePosition(
  state: GameState,
): Promise<PositionEval> {
  // Try minimax first if table is loaded
  if (minimaxTable) {
    const result = minimaxEvaluate(minimaxTable, state);
    if (result) return result;
  }

  // Fall back to AlphaZero neural evaluation
  const model = await getAlphazeroModel();
  const { value } = await model.infer(state);
  return { value, source: "neural", proven: false };
}
