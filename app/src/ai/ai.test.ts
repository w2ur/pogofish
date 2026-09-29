import { describe, it, expect } from "vitest";
import { randomMove } from "./random";
import { initialState } from "../engine/engine";
import { legalMoves } from "../engine/engine";
import { actionToIndex, indexToAction, ACTION_SIZE } from "../engine/encoding";
import { stateToKey } from "./minimax";
import { forWhite, alphazeroNet, DQN_PATH } from "./player";
import { existsSync } from "node:fs";
import type { RuleSet } from "../engine/types";
import { resolve } from "node:path";

describe("randomMove", () => {
  it("returns a legal move", () => {
    const state = initialState();
    const move = randomMove(state);
    const legal = legalMoves(state);

    const isLegal = legal.some(
      (m) =>
        m.fromCell === move.fromCell &&
        m.numPieces === move.numPieces &&
        m.toCell === move.toCell,
    );
    expect(isLegal).toBe(true);
  });

  it("returns different moves over many calls (not stuck)", () => {
    const state = initialState();
    const seen = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const move = randomMove(state);
      seen.add(`${move.fromCell},${move.numPieces},${move.toCell}`);
    }

    // Initial position has many legal moves — we should see variety
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("actionToIndex / indexToAction round-trip", () => {
  it("round-trips for all 243 indices", () => {
    for (let idx = 0; idx < ACTION_SIZE; idx++) {
      const move = indexToAction(idx);
      const backIdx = actionToIndex(move);
      expect(backIdx).toBe(idx);
    }
  });
});

describe("stateToKey", () => {
  it("encodes initial state correctly", () => {
    const state = initialState();
    const key = stateToKey(state);
    expect(key).toBe("WW/WW/WW////RR/RR/RR:W");
  });

  it("encodes empty board", () => {
    const state = {
      board: Array.from({ length: 9 }, () => [] as string[]),
      currentPlayer: "R" as const,
      moveCount: 0,
      positionHistory: [],
    };
    const key = stateToKey(state);
    expect(key).toBe("////////:R");
  });

  it("encodes mixed stacks", () => {
    const board = Array.from({ length: 9 }, () => [] as string[]);
    board[0] = ["W", "R", "W"];
    board[4] = ["R"];
    const state = { board, currentPlayer: "W" as const, moveCount: 0, positionHistory: [] };
    const key = stateToKey(state);
    expect(key).toBe("WRW////R////:W");
  });
});

describe("mcts module", () => {
  it("is importable", async () => {
    const mcts = await import("./mcts");
    expect(typeof mcts.mctsSearch).toBe("function");
  });
});

// Regression: the evaluation bar showed Red's winning positions as White
// advantage, because the table and the nets score for the player to move.
describe("forWhite", () => {
  it("keeps White-to-move values and negates Red-to-move values", () => {
    const white = initialState();
    const red = { ...white, currentPlayer: "R" as const };
    expect(forWhite(0.8, white)).toBe(0.8);
    expect(forWhite(0.8, red)).toBe(-0.8);
    expect(forWhite(-1, red)).toBe(1);
  });
});

// Regression: the DQN opponent asked for /models/lc1-2/dqn_tiny.onnx, which
// does not exist, so it never moved. Every file the routing names must exist.
describe("model routing", () => {
  const exists = (p: string) => existsSync(resolve(__dirname, "../../public", `.${p}`));
  it("points at model files that exist", () => {
    expect(exists(DQN_PATH)).toBe(true);
    const variants: (RuleSet | undefined)[] = [
      undefined,
      { LC1: { repetitions: 2 } },
      { LC2: { cap: 50 } },
      { LC3: { cap: 29 } },
    ];
    for (const rules of variants) {
      const { path } = alphazeroNet(rules);
      expect(exists(path), path).toBe(true);
    }
  });
});
