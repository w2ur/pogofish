import { type Features, type GameState, type Move, type RuleSet } from "../engine/types";
import { legalMoves } from "../engine/engine";
import { actionToIndex, maskedSoftmax } from "../engine/encoding";
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
  if (rules && "LC3" in rules) return `/models/lc3-29/${name}`;
  return `/models/${name}`;
}

async function getModel(path: string, features: Features = "absolute"): Promise<OnnxModel> {
  let model = modelCache.get(path);
  if (!model) {
    model = new OnnxModel(features);
    await model.load(path);
    modelCache.set(path, model);
  }
  return model;
}

/** The round-1 DQN, offered under LC1 only; one file, at the models root. */
export const DQN_PATH = "/models/dqn_tiny.onnx";

async function getDqnModel(): Promise<OnnxModel> {
  return getModel(DQN_PATH);
}

/** The round-2 net (az-lc1-s1, the one the terminal game bundles) under
 *  LC1; round-1 nets, absolute features, elsewhere. */
export const LC1_NET = { file: "az-lc1-s1.onnx", features: "mover-relative-repetition" } as const;

/** The AlphaZero net's file and input features for a ruleset. */
export function alphazeroNet(rules?: RuleSet): { path: string; features: Features } {
  if (isLC1(rules)) return { path: modelPath(rules, LC1_NET.file), features: LC1_NET.features };
  const name = rules && "LC3" in rules ? "alphazero.onnx" : "alphazero_cnn.onnx";
  return { path: modelPath(rules, name), features: "absolute" };
}

async function getAlphazeroModel(rules?: RuleSet): Promise<OnnxModel> {
  const { path, features } = alphazeroNet(rules);
  return getModel(path, features);
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
      const model = await getDqnModel();
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

/** Per-legal-move policy probabilities + value head, for the "Inspect model"
 *  panel. Routes to the same model file the matching player would use, so the
 *  reader sees exactly what the live opponent thinks. Falls back gracefully
 *  when the level has no associated network. */
export async function inspectModel(
  state: GameState,
  level: AILevel,
  ruleSet?: RuleSet,
): Promise<{ legalMoves: Move[]; policyProbs: number[]; value: number }> {
  const moves = legalMoves(state);

  // Pick model based on level — mirror the routing in getMove().
  let model: OnnxModel;
  if (level === "dqn") {
    // DQN only exists for the LC1 (sudden-death) variant.
    if (ruleSet && !isLC1(ruleSet)) {
      return { legalMoves: moves, policyProbs: moves.map(() => 0), value: 0 };
    }
    model = await getDqnModel();
  } else if (level === "alphazero" || level === "alphazero-mcts") {
    model = await getAlphazeroModel(ruleSet);
  } else {
    // No network for human/random/minimax — caller should not invoke us.
    return { legalMoves: moves, policyProbs: moves.map(() => 0), value: 0 };
  }

  const { policyLogits, value } = await model.infer(state);
  const legalIndices = moves.map((m) => actionToIndex(m));
  // maskedSoftmax returns a full ACTION_SIZE Float32Array with probabilities
  // only at legal indices. Project back to per-move order.
  const probs = maskedSoftmax(policyLogits, legalIndices);
  const policyProbs = legalIndices.map((idx) => probs[idx] ?? 0);

  return { legalMoves: moves, policyProbs, value };
}

/** The minimax table and the nets score a position for the player to move;
 *  the evaluation bar and panel read +1 as White winning. */
export function forWhite(value: number, state: GameState): number {
  return state.currentPlayer === "W" ? value : -value;
}

/** Evaluate a position, from White's side (+1 White wins). Tries minimax
 *  first, falls back to AlphaZero. */
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
    if (result) return { ...result, value: forWhite(result.value, state) };
  }

  // Fall back to AlphaZero neural evaluation
  const model = await getAlphazeroModel(ruleSet);
  const { value } = await model.infer(state);
  return { value: forWhite(value, state), source: "neural", proven: false };
}
