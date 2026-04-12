import { describe, it, expect } from "vitest";
import {
  initialState,
  manhattanDistance,
  legalMoves,
  applyMove,
  isTerminal,
  winner,
} from "./engine";
import {
  stateToTensor,
  actionToIndex,
  indexToAction,
  STATE_SIZE,
  ACTION_SIZE,
} from "./encoding";
import { W, R, NUM_CELLS, type Move, type GameState } from "./types";
import fixturesRaw from "./fixtures.json";

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

interface Fixture {
  stateKey: string;
  board: string[][];
  currentPlayer: string;
  legalMoves: [number, number, number][];
  encoding: number[];
  actionIndices: number[];
  isTerminal: boolean;
  winner: string | null;
}

const fixtures = fixturesRaw as Fixture[];

// Helper to convert a fixture board/player into a GameState
function fixtureToState(f: Fixture): GameState {
  return {
    board: f.board as string[][],
    currentPlayer: f.currentPlayer as "W" | "R",
  };
}

// Convert fixture legalMoves arrays to Move objects, sorted for comparison
function fixtureMoves(f: Fixture): Move[] {
  return f.legalMoves.map(([fromCell, numPieces, toCell]) => ({
    fromCell,
    numPieces,
    toCell,
  }));
}

function sortMoves(moves: Move[]): Move[] {
  return [...moves].sort(
    (a, b) =>
      a.fromCell - b.fromCell ||
      a.numPieces - b.numPieces ||
      a.toCell - b.toCell,
  );
}

// ---------------------------------------------------------------------------
// initialState
// ---------------------------------------------------------------------------

describe("initialState", () => {
  it("returns a board with 9 cells", () => {
    const state = initialState();
    expect(state.board.length).toBe(NUM_CELLS);
  });

  it("row 0 cells start with [W, W]", () => {
    const state = initialState();
    expect(state.board[0]).toEqual([W, W]);
    expect(state.board[1]).toEqual([W, W]);
    expect(state.board[2]).toEqual([W, W]);
  });

  it("row 1 cells start empty", () => {
    const state = initialState();
    expect(state.board[3]).toEqual([]);
    expect(state.board[4]).toEqual([]);
    expect(state.board[5]).toEqual([]);
  });

  it("row 2 cells start with [R, R]", () => {
    const state = initialState();
    expect(state.board[6]).toEqual([R, R]);
    expect(state.board[7]).toEqual([R, R]);
    expect(state.board[8]).toEqual([R, R]);
  });

  it("White moves first", () => {
    expect(initialState().currentPlayer).toBe(W);
  });
});

// ---------------------------------------------------------------------------
// manhattanDistance
// ---------------------------------------------------------------------------

describe("manhattanDistance", () => {
  it("same cell is 0", () => {
    expect(manhattanDistance(0, 0)).toBe(0);
    expect(manhattanDistance(4, 4)).toBe(0);
  });

  it("adjacent horizontal d=1", () => {
    expect(manhattanDistance(0, 1)).toBe(1);
    expect(manhattanDistance(3, 4)).toBe(1);
  });

  it("adjacent vertical d=1", () => {
    expect(manhattanDistance(0, 3)).toBe(1);
    expect(manhattanDistance(1, 4)).toBe(1);
  });

  it("diagonal d=2", () => {
    expect(manhattanDistance(0, 4)).toBe(2);
    expect(manhattanDistance(2, 6)).toBe(4); // opposite corners
  });

  it("opposite corners d=4", () => {
    expect(manhattanDistance(0, 8)).toBe(4);
  });

  it("d=3: cell 0 to cell 7 (row 0 col 0 → row 2 col 1)", () => {
    expect(manhattanDistance(0, 7)).toBe(3);
  });

  it("d=3: cell 2 to cell 3 (row 0 col 2 → row 1 col 0)", () => {
    expect(manhattanDistance(2, 3)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// legalMoves
// ---------------------------------------------------------------------------

describe("legalMoves", () => {
  it("initial state has 16 legal moves for White", () => {
    const state = initialState();
    expect(legalMoves(state).length).toBe(16);
  });

  it("all moves in initial state are from White cells", () => {
    const state = initialState();
    const moves = legalMoves(state);
    for (const move of moves) {
      // fromCell must be in row 0 (cells 0-2)
      expect(move.fromCell).toBeLessThan(3);
    }
  });

  it("no 3-piece move from a 2-stack", () => {
    const state = initialState();
    const moves = legalMoves(state);
    for (const move of moves) {
      // Initial stacks have 2 pieces — no 3-piece pickup
      expect(move.numPieces).toBeLessThanOrEqual(2);
    }
  });

  it("cell 0 pick-1 destinations: cells 1 and 3 (d=1 only)", () => {
    const state = initialState();
    const moves = legalMoves(state).filter(
      (m) => m.fromCell === 0 && m.numPieces === 1,
    );
    const toCells = moves.map((m) => m.toCell).sort((a, b) => a - b);
    expect(toCells).toEqual([1, 3]);
  });

  it("cell 0 pick-2 destinations: cells 2, 4, 6 (d=2)", () => {
    const state = initialState();
    const moves = legalMoves(state).filter(
      (m) => m.fromCell === 0 && m.numPieces === 2,
    );
    const toCells = moves.map((m) => m.toCell).sort((a, b) => a - b);
    expect(toCells).toEqual([2, 4, 6]);
  });

  it("3-piece move from center cell: d=1 and d=3", () => {
    // Build a state with a 3-stack of W at center (cell 4)
    const state: GameState = {
      board: [
        [], [], [], [], [W, W, W], [], [], [], [],
      ],
      currentPlayer: W,
    };
    const moves = legalMoves(state).filter(
      (m) => m.fromCell === 4 && m.numPieces === 3,
    );
    // d=1 neighbors of center: 1, 3, 5, 7
    // d=3 from center: none on a 3x3 grid (max d is 4, and d=3 requires crossing diagonally, e.g. 0→7)
    const dists = moves.map((m) => manhattanDistance(4, m.toCell));
    for (const d of dists) {
      expect([1, 3]).toContain(d);
    }
  });

  it("3-piece move from corner (cell 0)", () => {
    const state: GameState = {
      board: [
        [W, W, W], [], [], [], [], [], [], [], [],
      ],
      currentPlayer: W,
    };
    const moves = legalMoves(state).filter(
      (m) => m.fromCell === 0 && m.numPieces === 3,
    );
    // d=1 from cell 0: cells 1, 3
    // d=3 from cell 0: cells 7 (row2col1) and... check: (0,0)→(2,1)=3, (0,0)→(1,2)=3
    const toCells = moves.map((m) => m.toCell).sort((a, b) => a - b);
    // cell 5 is (1,2): d=|0-1|+|0-2|=3 ✓
    // cell 7 is (2,1): d=|0-2|+|0-1|=3 ✓
    expect(toCells).toEqual([1, 3, 5, 7]);
  });

  it("top piece must match current player", () => {
    // R stack topped with R — W cannot move from it
    const state: GameState = {
      board: [
        [W, R], [], [], [], [], [], [], [], [],
      ],
      currentPlayer: W,
    };
    const moves = legalMoves(state);
    for (const move of moves) {
      expect(move.fromCell).not.toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

describe("applyMove", () => {
  it("single piece move transfers top piece", () => {
    const state = initialState();
    const move: Move = { fromCell: 0, numPieces: 1, toCell: 3 };
    const next = applyMove(state, move);
    expect(next.board[0]).toEqual([W]);
    expect(next.board[3]).toEqual([W]);
  });

  it("two piece move transfers two pieces", () => {
    const state = initialState();
    const move: Move = { fromCell: 0, numPieces: 2, toCell: 4 };
    const next = applyMove(state, move);
    expect(next.board[0]).toEqual([]);
    expect(next.board[4]).toEqual([W, W]);
  });

  it("preserves piece order (bottom-to-top) when stacking", () => {
    const state: GameState = {
      board: [
        [W, W, W], [], [], [R], [], [], [], [], [],
      ],
      currentPlayer: W,
    };
    const move: Move = { fromCell: 0, numPieces: 2, toCell: 3 };
    const next = applyMove(state, move);
    // picked: [W, W] (top 2), destination was [R]
    expect(next.board[3]).toEqual([R, W, W]);
    expect(next.board[0]).toEqual([W]);
  });

  it("stacks on existing pieces at destination", () => {
    const state = initialState();
    // Move W from cell 1 to cell 4 (d=1, pick 1)
    const move: Move = { fromCell: 1, numPieces: 1, toCell: 4 };
    const next = applyMove(state, move);
    expect(next.board[1]).toEqual([W]);
    expect(next.board[4]).toEqual([W]);
  });

  it("does not mutate the original state", () => {
    const state = initialState();
    const originalBoard = state.board.map((c) => [...c]);
    applyMove(state, { fromCell: 0, numPieces: 1, toCell: 3 });
    for (let i = 0; i < NUM_CELLS; i++) {
      expect(state.board[i]).toEqual(originalBoard[i]);
    }
  });

  it("switches current player", () => {
    const state = initialState();
    const next = applyMove(state, { fromCell: 0, numPieces: 1, toCell: 3 });
    expect(next.currentPlayer).toBe(R);
    const next2 = applyMove(next, { fromCell: 6, numPieces: 1, toCell: 3 });
    expect(next2.currentPlayer).toBe(W);
  });
});

// ---------------------------------------------------------------------------
// isTerminal / winner
// ---------------------------------------------------------------------------

describe("isTerminal / winner", () => {
  it("initial state is not terminal", () => {
    expect(isTerminal(initialState())).toBe(false);
    expect(winner(initialState())).toBeNull();
  });

  it("White wins: all non-empty tops are W", () => {
    const state: GameState = {
      board: [
        [W, W], [], [W], [], [], [], [], [], [],
      ],
      currentPlayer: R,
    };
    expect(isTerminal(state)).toBe(true);
    expect(winner(state)).toBe(W);
  });

  it("Red wins: all non-empty tops are R", () => {
    const state: GameState = {
      board: [
        [], [], [], [R], [], [R, W, R], [], [], [],
      ],
      currentPlayer: W,
    };
    expect(isTerminal(state)).toBe(true);
    expect(winner(state)).toBe(R);
  });

  it("not terminal when both players top at least one cell", () => {
    const state: GameState = {
      board: [
        [W], [R], [], [], [], [], [], [], [],
      ],
      currentPlayer: W,
    };
    expect(isTerminal(state)).toBe(false);
  });

  it("empty board is not terminal", () => {
    const state: GameState = {
      board: [[], [], [], [], [], [], [], [], []],
      currentPlayer: W,
    };
    expect(isTerminal(state)).toBe(false);
    expect(winner(state)).toBeNull();
  });

  it("empty cells are ignored when determining terminal", () => {
    // All pieces consolidated to one cell, top is R
    const state: GameState = {
      board: [
        [W, R, W, R, W, R], [], [], [], [], [], [], [], [],
      ],
      currentPlayer: W,
    };
    // Top is R — terminal, R wins
    expect(isTerminal(state)).toBe(true);
    expect(winner(state)).toBe(R);
  });
});

// ---------------------------------------------------------------------------
// Cross-validation: legalMoves + isTerminal against fixtures
// ---------------------------------------------------------------------------

describe("cross-validation: legalMoves + isTerminal (30 fixtures)", () => {
  for (const f of fixtures) {
    it(`stateKey=${f.stateKey}`, () => {
      const state = fixtureToState(f);

      // legalMoves
      const computed = sortMoves(legalMoves(state));
      const expected = sortMoves(fixtureMoves(f));
      expect(computed).toEqual(expected);

      // isTerminal
      expect(isTerminal(state)).toBe(f.isTerminal);

      // winner
      if (f.winner === null) {
        expect(winner(state)).toBeNull();
      } else {
        expect(winner(state)).toBe(f.winner);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Encoding: stateToTensor
// ---------------------------------------------------------------------------

describe("stateToTensor", () => {
  it("tensor length is STATE_SIZE (109)", () => {
    const tensor = stateToTensor(initialState());
    expect(STATE_SIZE).toBe(109);
    expect(tensor.length).toBe(STATE_SIZE);
  });

  it("initial state: first cell encodes [1, 1, 0, ...] (W, W)", () => {
    const tensor = stateToTensor(initialState());
    expect(tensor[0]).toBe(1.0); // W
    expect(tensor[1]).toBe(1.0); // W
    expect(tensor[2]).toBe(0.0); // empty
  });

  it("initial state: last element is 1.0 (White to move)", () => {
    const tensor = stateToTensor(initialState());
    expect(tensor[STATE_SIZE - 1]).toBe(1.0);
  });

  it("Red-to-move: last element is -1.0", () => {
    const state = applyMove(initialState(), { fromCell: 0, numPieces: 1, toCell: 3 });
    const tensor = stateToTensor(state);
    expect(tensor[STATE_SIZE - 1]).toBe(-1.0);
  });

  it("Red pieces encode as -1.0", () => {
    const tensor = stateToTensor(initialState());
    // cell 6 = row 2 col 0 → base = 6 * 12 = 72
    expect(tensor[72]).toBe(-1.0);
    expect(tensor[73]).toBe(-1.0);
    expect(tensor[74]).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// Encoding: actionToIndex / indexToAction
// ---------------------------------------------------------------------------

describe("actionToIndex / indexToAction", () => {
  it("ACTION_SIZE is 243", () => {
    expect(ACTION_SIZE).toBe(243);
  });

  it("round-trip: actionToIndex then indexToAction", () => {
    const moves: Move[] = [
      { fromCell: 0, numPieces: 1, toCell: 1 },
      { fromCell: 0, numPieces: 2, toCell: 2 },
      { fromCell: 0, numPieces: 3, toCell: 7 },
      { fromCell: 4, numPieces: 1, toCell: 3 },
      { fromCell: 8, numPieces: 3, toCell: 1 },
    ];
    for (const move of moves) {
      expect(indexToAction(actionToIndex(move))).toEqual(move);
    }
  });

  it("fromCell=0, numPieces=1, toCell=1 → index 1", () => {
    expect(actionToIndex({ fromCell: 0, numPieces: 1, toCell: 1 })).toBe(1);
  });

  it("fromCell=0, numPieces=1, toCell=3 → index 3", () => {
    expect(actionToIndex({ fromCell: 0, numPieces: 1, toCell: 3 })).toBe(3);
  });

  it("fromCell=0, numPieces=2, toCell=2 → index 11", () => {
    // 0*27 + (2-1)*9 + 2 = 0 + 9 + 2 = 11
    expect(actionToIndex({ fromCell: 0, numPieces: 2, toCell: 2 })).toBe(11);
  });

  it("fromCell=1, numPieces=1, toCell=0 → index 27", () => {
    // 1*27 + 0*9 + 0 = 27
    expect(actionToIndex({ fromCell: 1, numPieces: 1, toCell: 0 })).toBe(27);
  });

  it("all indices in [0, ACTION_SIZE)", () => {
    // Spot check: max index = fromCell=8, numPieces=3, toCell=8
    const max = actionToIndex({ fromCell: 8, numPieces: 3, toCell: 8 });
    expect(max).toBe(242);
    expect(max).toBeLessThan(ACTION_SIZE);
  });
});

// ---------------------------------------------------------------------------
// Cross-validation: tensor encoding + action indices (30 fixtures)
// ---------------------------------------------------------------------------

describe("cross-validation: tensor + actionIndices (30 fixtures)", () => {
  for (const f of fixtures) {
    it(`tensor stateKey=${f.stateKey}`, () => {
      const state = fixtureToState(f);
      const tensor = stateToTensor(state);
      expect(Array.from(tensor)).toEqual(f.encoding);
    });

    it(`actionIndices stateKey=${f.stateKey}`, () => {
      const state = fixtureToState(f);
      const computed = sortMoves(legalMoves(state)).map(actionToIndex).sort((a, b) => a - b);
      const expected = [...f.actionIndices].sort((a, b) => a - b);
      expect(computed).toEqual(expected);
    });
  }
});
