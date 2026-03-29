import { useCallback, useMemo, useState } from "react";
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

export interface UseGame {
  state: GameState;
  selection: Selection;
  isPlayerTurn: boolean;
  gameOver: boolean;
  gameWinner: Player | null;
  lastMove: Move | null;
  history: GameHistory;
  selectCell: (cellIndex: number) => void;
  selectCount: (numPieces: number) => void;
  selectDestination: (toCell: number) => void;
  cancelSelection: () => void;
  applyAIMove: (move: Move) => void;
  undo: () => void;
  newGame: () => void;
}

export function useGame(playerColor: Player): UseGame {
  const [state, setState] = useState<GameState>(initialState);
  const [selection, setSelection] = useState<Selection>(IDLE_SELECTION);
  const [history, setHistory] = useState<GameHistory>({
    states: [initialState()],
    moves: [],
  });
  const [lastMove, setLastMove] = useState<Move | null>(null);

  const isPlayerTurn = state.currentPlayer === playerColor;
  const gameOver = isTerminal(state);
  const gameWinner = winner(state);

  const selectCell = useCallback(
    (cellIndex: number) => {
      if (!isPlayerTurn || gameOver) return;

      const cell = state.board[cellIndex];
      if (!cell || cell.length === 0) return;
      if (cell[cell.length - 1] !== playerColor) return;

      // Determine valid piece counts for this cell
      const moves = legalMoves(state);
      const fromMoves = moves.filter((m) => m.fromCell === cellIndex);
      const validCounts = [...new Set(fromMoves.map((m) => m.numPieces))].sort();

      if (validCounts.length === 0) return;

      // If only one valid count, auto-advance
      if (validCounts.length === 1) {
        const count = validCounts[0]!;
        const destinations = [
          ...new Set(
            fromMoves
              .filter((m) => m.numPieces === count)
              .map((m) => m.toCell),
          ),
        ];
        setSelection({
          phase: "countSelected",
          fromCell: cellIndex,
          numPieces: count,
          validCounts,
          validDestinations: destinations,
        });
      } else {
        setSelection({
          phase: "cellSelected",
          fromCell: cellIndex,
          numPieces: null,
          validCounts,
          validDestinations: [],
        });
      }
    },
    [state, isPlayerTurn, gameOver, playerColor],
  );

  const selectCount = useCallback(
    (numPieces: number) => {
      if (selection.phase !== "cellSelected" || selection.fromCell === null) return;

      const moves = legalMoves(state);
      const destinations = [
        ...new Set(
          moves
            .filter(
              (m) =>
                m.fromCell === selection.fromCell && m.numPieces === numPieces,
            )
            .map((m) => m.toCell),
        ),
      ];

      setSelection({
        phase: "countSelected",
        fromCell: selection.fromCell,
        numPieces: numPieces,
        validCounts: selection.validCounts,
        validDestinations: destinations,
      });
    },
    [state, selection],
  );

  const selectDestination = useCallback(
    (toCell: number) => {
      if (
        selection.phase !== "countSelected" ||
        selection.fromCell === null ||
        selection.numPieces === null
      )
        return;

      const move: Move = {
        fromCell: selection.fromCell,
        numPieces: selection.numPieces,
        toCell,
      };

      const newState = applyMove(state, move);
      setState(newState);
      setLastMove(move);
      setSelection(IDLE_SELECTION);
      setHistory((prev) => ({
        states: [...prev.states, newState],
        moves: [...prev.moves, move],
      }));
    },
    [state, selection],
  );

  const cancelSelection = useCallback(() => {
    setSelection(IDLE_SELECTION);
  }, []);

  const applyAIMoveCallback = useCallback(
    (move: Move) => {
      const newState = applyMove(state, move);
      setState(newState);
      setLastMove(move);
      setHistory((prev) => ({
        states: [...prev.states, newState],
        moves: [...prev.moves, move],
      }));
    },
    [state],
  );

  const undo = useCallback(() => {
    // Undo a pair of moves (player + AI)
    if (history.states.length < 3) return;

    const targetIdx = history.states.length - 3;
    const targetState = history.states[targetIdx];
    if (!targetState) return;

    setState(targetState);
    setLastMove(
      targetIdx > 0 ? (history.moves[targetIdx - 1] ?? null) : null,
    );
    setSelection(IDLE_SELECTION);
    setHistory({
      states: history.states.slice(0, targetIdx + 1),
      moves: history.moves.slice(0, targetIdx),
    });
  }, [history]);

  const newGame = useCallback(() => {
    const init = initialState();
    setState(init);
    setSelection(IDLE_SELECTION);
    setLastMove(null);
    setHistory({ states: [init], moves: [] });
  }, []);

  return useMemo(
    () => ({
      state,
      selection,
      isPlayerTurn,
      gameOver,
      gameWinner,
      lastMove,
      history,
      selectCell,
      selectCount,
      selectDestination,
      cancelSelection,
      applyAIMove: applyAIMoveCallback,
      undo,
      newGame,
    }),
    [
      state,
      selection,
      isPlayerTurn,
      gameOver,
      gameWinner,
      lastMove,
      history,
      selectCell,
      selectCount,
      selectDestination,
      cancelSelection,
      applyAIMoveCallback,
      undo,
      newGame,
    ],
  );
}
