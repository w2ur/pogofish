import { describe, it, expect } from "vitest";
import { selectGuidedRedMove } from "./TryYourself";
import type { GameState, Move } from "../engine/types";

function makeState(board: string[][], currentPlayer: "W" | "R" = "R"): GameState {
  return {
    board,
    currentPlayer,
    moveCount: 0,
    positionHistory: [],
  };
}

describe("selectGuidedRedMove", () => {
  it("returns null when there are no legal moves", () => {
    const state = makeState(Array.from({ length: 9 }, () => []));
    expect(selectGuidedRedMove(state, [])).toBeNull();
  });

  it("prefers a capture over any other legal move", () => {
    const board: string[][] = Array.from({ length: 9 }, () => []);
    board[0] = ["W"]; // White piece at cell 0 — capturable by Red
    board[4] = [];
    const state = makeState(board);

    const legal: Move[] = [
      { fromCell: 1, numPieces: 1, toCell: 0 }, // capture
      { fromCell: 3, numPieces: 1, toCell: 4 }, // plain move
    ];
    expect(selectGuidedRedMove(state, legal)).toEqual(legal[0]);
  });

  it("prefers a stack build when no capture is available", () => {
    const board: string[][] = Array.from({ length: 9 }, () => []);
    board[5] = ["R"]; // Red piece at cell 5 — stackable
    const state = makeState(board);

    const legal: Move[] = [
      { fromCell: 1, numPieces: 1, toCell: 2 }, // plain move
      { fromCell: 8, numPieces: 1, toCell: 5 }, // stack on own piece
    ];
    expect(selectGuidedRedMove(state, legal)).toEqual(legal[1]);
  });

  it("falls back to the first legal move when nothing else applies", () => {
    const board: string[][] = Array.from({ length: 9 }, () => []);
    const state = makeState(board);

    const legal: Move[] = [
      { fromCell: 1, numPieces: 1, toCell: 2 },
      { fromCell: 3, numPieces: 1, toCell: 4 },
    ];
    expect(selectGuidedRedMove(state, legal)).toEqual(legal[0]);
  });

  it("picks a capture even if a stack-build is also available", () => {
    const board: string[][] = Array.from({ length: 9 }, () => []);
    board[0] = ["W"];
    board[5] = ["R"];
    const state = makeState(board);

    const legal: Move[] = [
      { fromCell: 8, numPieces: 1, toCell: 5 }, // stack
      { fromCell: 1, numPieces: 1, toCell: 0 }, // capture
    ];
    expect(selectGuidedRedMove(state, legal)).toEqual(legal[1]);
  });
});
