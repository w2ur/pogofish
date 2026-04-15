/**
 * Monte Carlo Tree Search for two-player Pogo.
 *
 * Browser port of training/pogofish/mcts.py.
 * No Dirichlet noise (inference only). Temperature = 0 (greedy).
 */

import { type GameState, type Move, type RuleSet } from "../engine/types";
import { legalMoves, applyMove, isTerminal, winner } from "../engine/engine";
import { actionToIndex, indexToAction, ACTION_SIZE } from "../engine/encoding";

interface ChildEdge {
  prior: number;
  visitCount: number;
  valueSum: number;
  node: MCTSNode | null;
}

class MCTSNode {
  readonly state: GameState;
  readonly parent: MCTSNode | null;
  readonly parentAction: number | null;
  visitCount = 0;
  children: Map<number, ChildEdge> = new Map();

  constructor(
    state: GameState,
    parent: MCTSNode | null = null,
    parentAction: number | null = null,
  ) {
    this.state = state;
    this.parent = parent;
    this.parentAction = parentAction;
  }

  isLeaf(): boolean {
    return this.children.size === 0;
  }

  expand(policy: Float32Array): void {
    const moves = legalMoves(this.state);
    for (const move of moves) {
      const action = actionToIndex(move);
      this.children.set(action, {
        prior: policy[action] ?? 0,
        visitCount: 0,
        valueSum: 0,
        node: null,
      });
    }
  }

  selectAction(cPuct: number): number {
    let bestAction = -1;
    let bestScore = -Infinity;

    for (const [action, child] of this.children) {
      const q = child.visitCount > 0 ? child.valueSum / child.visitCount : 0;
      const u =
        cPuct * child.prior * Math.sqrt(this.visitCount) / (1 + child.visitCount);
      const score = q + u;
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return bestAction;
  }

  backpropagate(value: number): void {
    this.visitCount += 1;
    if (this.parent !== null && this.parentAction !== null) {
      const edge = this.parent.children.get(this.parentAction);
      if (edge) {
        edge.valueSum += -value;
        edge.visitCount += 1;
      }
      this.parent.backpropagate(-value);
    }
  }
}

/** Evaluation function type: returns policy probs and value for a state. */
export type EvalFn = (
  state: GameState,
) => Promise<{ policy: Float32Array; value: number }>;

/**
 * Compute terminal reward from the perspective of state's current player.
 * +1 if current player wins, -1 if opponent wins, 0 otherwise.
 */
function terminalReward(state: GameState, rules?: RuleSet): number {
  const w = winner(state, rules);
  if (w === null) return 0;
  return w === state.currentPlayer ? 1 : -1;
}

/**
 * Run MCTS from a root state, returning the best move (greedy / most-visited).
 *
 * @param state - Root game state
 * @param evalFn - Neural net evaluation: state -> { policy[ACTION_SIZE], value }
 * @param numSimulations - Number of MCTS simulations (default 50)
 * @param cPuct - Exploration constant (default 1.5)
 * @param rules - Rule variant for terminal detection (optional, defaults to engine default)
 */
export async function mctsSearch(
  state: GameState,
  evalFn: EvalFn,
  numSimulations = 50,
  cPuct = 1.5,
  rules?: RuleSet,
): Promise<Move> {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error("No legal moves");
  if (moves.length === 1) return moves[0]!;

  const root = new MCTSNode(state);

  // Evaluate and expand root
  const { policy: rootPolicy } = await evalFn(state);
  root.expand(rootPolicy);

  for (let sim = 0; sim < numSimulations; sim++) {
    let node = root;

    // Selection: walk down tree using PUCT
    while (!node.isLeaf()) {
      const action = node.selectAction(cPuct);
      const edge = node.children.get(action)!;

      if (edge.node === null) {
        // Create child node
        const move = indexToAction(action);
        const childState = applyMove(node.state, move);
        const child = new MCTSNode(childState, node, action);
        edge.node = child;
        node = child;
        break;
      } else {
        node = edge.node;
      }
    }

    // Evaluate leaf
    let value: number;
    if (isTerminal(node.state, rules)) {
      value = terminalReward(node.state, rules);
    } else if (node.isLeaf()) {
      const result = await evalFn(node.state);
      node.expand(result.policy);
      value = result.value;
    } else {
      value = 0;
    }

    // Backpropagate
    node.backpropagate(value);
  }

  // Greedy: pick the most-visited action
  let bestAction = -1;
  let bestVisits = -1;
  for (const [action, edge] of root.children) {
    if (edge.visitCount > bestVisits) {
      bestVisits = edge.visitCount;
      bestAction = action;
    }
  }

  return indexToAction(bestAction);
}

// Re-export ACTION_SIZE for convenience
export { ACTION_SIZE };
