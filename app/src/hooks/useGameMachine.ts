import { useReducer, useMemo } from "react";
import {
  type GameState,
  type Move,
  type Player,
} from "../engine/types";
import {
  initialState,
  legalMoves,
  applyMove,
  isTerminal,
  winner,
} from "../engine/engine";
import type { PositionEval } from "../ai/minimax";

// ---- Selection types (ported from useGame) ----

export type SelectionPhase = "idle" | "cellSelected" | "countSelected";

export interface Selection {
  phase: SelectionPhase;
  fromCell: number | null;
  numPieces: number | null;
  validCounts: number[];
  validDestinations: number[];
}

const IDLE_SELECTION: Selection = {
  phase: "idle",
  fromCell: null,
  numPieces: null,
  validCounts: [],
  validDestinations: [],
};

export interface GameHistory {
  states: GameState[];
  moves: Move[];
}

// ---- State machine ----

export interface GameMachineState {
  gameState: GameState;
  selection: Selection;
  lastMove: Move | null;
  history: GameHistory;
  aiStatus: "idle" | "thinking";
  positionEval: PositionEval | null;
  analysisLoading: boolean;
}

// ---- Actions ----

type GameAction =
  | { type: "SELECT_CELL"; cellIndex: number; playerColor: Player }
  | { type: "SELECT_COUNT"; numPieces: number }
  | { type: "SELECT_DESTINATION"; toCell: number }
  | { type: "CANCEL_SELECTION" }
  | { type: "AI_MOVE_REQUESTED" }
  | { type: "AI_MOVE_RECEIVED"; move: Move }
  | { type: "EVAL_RECEIVED"; eval: PositionEval }
  | { type: "EVAL_FAILED" }
  | { type: "UNDO" }
  | { type: "NEW_GAME" };

function createInitialState(): GameMachineState {
  const init = initialState();
  return {
    gameState: init,
    selection: IDLE_SELECTION,
    lastMove: null,
    history: { states: [init], moves: [] },
    aiStatus: "idle",
    positionEval: null,
    analysisLoading: false,
  };
}

function reducer(state: GameMachineState, action: GameAction): GameMachineState {
  switch (action.type) {
    case "SELECT_CELL": {
      const { cellIndex, playerColor } = action;
      const gs = state.gameState;

      // Guard: only current player can select
      if (gs.currentPlayer !== playerColor) return state;
      if (isTerminal(gs)) return state;

      const cell = gs.board[cellIndex];
      if (!cell || cell.length === 0) return state;
      if (cell[cell.length - 1] !== playerColor) return state;

      const moves = legalMoves(gs);
      const fromMoves = moves.filter((m) => m.fromCell === cellIndex);
      const validCounts = [...new Set(fromMoves.map((m) => m.numPieces))].sort();

      if (validCounts.length === 0) return state;

      // Auto-advance if only one valid count
      if (validCounts.length === 1) {
        const count = validCounts[0]!;
        const destinations = [
          ...new Set(
            fromMoves
              .filter((m) => m.numPieces === count)
              .map((m) => m.toCell),
          ),
        ];
        return {
          ...state,
          selection: {
            phase: "countSelected",
            fromCell: cellIndex,
            numPieces: count,
            validCounts,
            validDestinations: destinations,
          },
        };
      }

      return {
        ...state,
        selection: {
          phase: "cellSelected",
          fromCell: cellIndex,
          numPieces: null,
          validCounts,
          validDestinations: [],
        },
      };
    }

    case "SELECT_COUNT": {
      if (state.selection.phase !== "cellSelected" || state.selection.fromCell === null) {
        return state;
      }

      const moves = legalMoves(state.gameState);
      const destinations = [
        ...new Set(
          moves
            .filter(
              (m) =>
                m.fromCell === state.selection.fromCell &&
                m.numPieces === action.numPieces,
            )
            .map((m) => m.toCell),
        ),
      ];

      return {
        ...state,
        selection: {
          phase: "countSelected",
          fromCell: state.selection.fromCell,
          numPieces: action.numPieces,
          validCounts: state.selection.validCounts,
          validDestinations: destinations,
        },
      };
    }

    case "SELECT_DESTINATION": {
      if (
        state.selection.phase !== "countSelected" ||
        state.selection.fromCell === null ||
        state.selection.numPieces === null
      ) {
        return state;
      }

      const move: Move = {
        fromCell: state.selection.fromCell,
        numPieces: state.selection.numPieces,
        toCell: action.toCell,
      };

      const newGameState = applyMove(state.gameState, move);
      return {
        ...state,
        gameState: newGameState,
        selection: IDLE_SELECTION,
        lastMove: move,
        history: {
          states: [...state.history.states, newGameState],
          moves: [...state.history.moves, move],
        },
        positionEval: null,
        analysisLoading: false,
      };
    }

    case "CANCEL_SELECTION":
      return { ...state, selection: IDLE_SELECTION };

    case "AI_MOVE_REQUESTED":
      return { ...state, aiStatus: "thinking" };

    case "AI_MOVE_RECEIVED": {
      const newGameState = applyMove(state.gameState, action.move);
      return {
        ...state,
        gameState: newGameState,
        lastMove: action.move,
        aiStatus: "idle",
        history: {
          states: [...state.history.states, newGameState],
          moves: [...state.history.moves, action.move],
        },
        positionEval: null,
        analysisLoading: false,
      };
    }

    case "EVAL_RECEIVED":
      return {
        ...state,
        positionEval: action.eval,
        analysisLoading: false,
      };

    case "EVAL_FAILED":
      return {
        ...state,
        positionEval: null,
        analysisLoading: false,
      };

    case "UNDO": {
      if (state.history.states.length < 3) return state;

      const targetIdx = state.history.states.length - 3;
      const targetState = state.history.states[targetIdx];
      if (!targetState) return state;

      return {
        ...state,
        gameState: targetState,
        selection: IDLE_SELECTION,
        lastMove: targetIdx > 0 ? (state.history.moves[targetIdx - 1] ?? null) : null,
        history: {
          states: state.history.states.slice(0, targetIdx + 1),
          moves: state.history.moves.slice(0, targetIdx),
        },
        positionEval: null,
        analysisLoading: false,
      };
    }

    case "NEW_GAME":
      return createInitialState();

    default:
      return state;
  }
}

export function useGameMachine(playerColor: Player) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const isPlayerTurn = state.gameState.currentPlayer === playerColor;
  const gameOver = isTerminal(state.gameState);
  const gameWinner = winner(state.gameState);
  const canUndo = isPlayerTurn && !gameOver && state.history.states.length >= 3;

  return useMemo(
    () => ({ state, dispatch, isPlayerTurn, gameOver, gameWinner, canUndo }),
    [state, dispatch, isPlayerTurn, gameOver, gameWinner, canUndo],
  );
}
