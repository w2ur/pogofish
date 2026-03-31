import { describe, it, expect } from "vitest";
import { randomMove } from "./random";
import { initialState } from "../engine/engine";
import { legalMoves } from "../engine/engine";
import { actionToIndex, indexToAction, ACTION_SIZE } from "../engine/encoding";
import { stateToKey } from "./minimax";

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
    };
    const key = stateToKey(state);
    expect(key).toBe("////////:R");
  });

  it("encodes mixed stacks", () => {
    const board = Array.from({ length: 9 }, () => [] as string[]);
    board[0] = ["W", "R", "W"];
    board[4] = ["R"];
    const state = { board, currentPlayer: "W" as const };
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
