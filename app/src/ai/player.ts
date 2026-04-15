import { type GameState, type Move, type RuleSet } from "../engine/types";
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
  ruleSet?: RuleSet;
}

// Per-path model cache (lazy-loaded)
const modelCache = new Map<string, OnnxModel>();
let minimaxTable: MinimaxTable | null = null;
let minimaxLoadPromise: Promise<MinimaxTable> | null = null;

/** Check whether a RuleSet uses LC1 rules. */
function isLC1(rules?: RuleSet): boolean {
  return rules != null && "LC1" in rules;
}

/** Check whether a RuleSet matches the LC2-50 variant (minimax table variant). */
function isLC2_50(rules?: RuleSet): boolean {
  return rules != null && "LC2" in rules && (rules as { LC2: { cap: number } }).LC2.cap === 50;
}

/** Resolve ONNX model path for a given model name and rule variant. */
function modelPath(rules: RuleSet | undefined, name: string): string {
  if (isLC1(rules)) return `/models/lc1-2/${name}`;
  // Default: root models directory (LC2/LC3 models will be added later)
  return `/models/${name}`;
}

async function getModel(path: string): Promise<OnnxModel> {
  let model = modelCache.get(path);
  if (!model) {
    model = new OnnxModel();
    await model.load(path);
    modelCache.set(path, model);
  }
  return model;
}

async function getDqnModel(rules?: RuleSet): Promise<OnnxModel> {
  const path = modelPath(rules, "dqn_tiny.onnx");
  return getModel(path);
}

async function getAlphazeroModel(rules?: RuleSet): Promise<OnnxModel> {
  const name = isLC1(rules) ? "alphazero.onnx" : "alphazero_cnn.onnx";
  const path = modelPath(rules, name);
  return getModel(path);
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
      // DQN only exists for default (LC1-2) variant — fall back to random otherwise
      if (config.ruleSet && !isLC1(config.ruleSet)) {
        return randomMove(state);
      }
      const model = await getDqnModel(config.ruleSet);
      return model.bestMove(state);
    }

    case "alphazero": {
      const model = await getAlphazeroModel(config.ruleSet);
      return model.bestMove(state);
    }

    case "alphazero-mcts": {
      const model = await getAlphazeroModel(config.ruleSet);
      // Dynamic import to keep MCTS out of initial bundle
      const { mctsSearch } = await import("./mcts");
      return mctsSearch(
        state,
        (s) => model.evalForMcts(s),
        config.mctsSimulations ?? 50,
        1.5,
        config.ruleSet,
      );
    }

    case "minimax":
      // Minimax is analysis-only (depth-20 table runs out after ~3 moves).
      // Fall through to AlphaZero+MCTS as the strongest playable AI.
      return getMove(state, { level: "alphazero-mcts", mctsSimulations: config.mctsSimulations ?? 100, ruleSet: config.ruleSet });
  }
}

/** Evaluate a position. Tries minimax first, falls back to AlphaZero. */
export async function evaluatePosition(
  state: GameState,
  ruleSet?: RuleSet,
): Promise<PositionEval> {
  // Minimax table was built for LC2-50 — only use it for that variant
  const canUseMinimax = !ruleSet || isLC2_50(ruleSet);

  // Wait for minimax table if it's currently loading
  if (canUseMinimax && minimaxLoadPromise && !minimaxTable) {
    try {
      await minimaxLoadPromise;
    } catch {
      // Load failed — continue with AlphaZero
    }
  }

  // Try minimax first if table is loaded and variant matches
  if (canUseMinimax && minimaxTable) {
    const result = minimaxEvaluate(minimaxTable, state);
    if (result) return result;
  }

  // Fall back to AlphaZero neural evaluation
  const model = await getAlphazeroModel(ruleSet);
  const { value } = await model.infer(state);
  return { value, source: "neural", proven: false };
}
