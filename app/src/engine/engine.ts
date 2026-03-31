import {
  type Player,
  type Cell,
  type GameState,
  type Move,
  W,
  R,
  BOARD_SIZE,
  NUM_CELLS,
  DISTANCES,
} from "./types";

function opponent(player: Player): Player {
  return player === W ? R : W;
}

export function manhattanDistance(a: number, b: number): number {
  const rowA = Math.floor(a / BOARD_SIZE);
  const colA = a % BOARD_SIZE;
  const rowB = Math.floor(b / BOARD_SIZE);
  const colB = b % BOARD_SIZE;
  return Math.abs(rowA - rowB) + Math.abs(colA - colB);
}

export function initialState(): GameState {
  const board: Cell[] = [];
  for (let i = 0; i < NUM_CELLS; i++) {
    const row = Math.floor(i / BOARD_SIZE);
    if (row === 0) board.push([W, W]);
    else if (row === 2) board.push([R, R]);
    else board.push([]);
  }
  return { board, currentPlayer: W };
}

export function legalMoves(state: GameState): Move[] {
  const { board, currentPlayer } = state;
  const moves: Move[] = [];
  for (let fromCell = 0; fromCell < NUM_CELLS; fromCell++) {
    const stack = board[fromCell];
    if (stack === undefined || stack.length === 0) continue;
    if (stack[stack.length - 1] !== currentPlayer) continue;
    for (const numPieces of [1, 2, 3] as const) {
      if (stack.length < numPieces) continue;
      const dists = DISTANCES[numPieces];
      if (dists === undefined) continue;
      for (let toCell = 0; toCell < NUM_CELLS; toCell++) {
        if (toCell === fromCell) continue;
        const d = manhattanDistance(fromCell, toCell);
        if (dists.includes(d)) {
          moves.push({ fromCell, numPieces, toCell });
        }
      }
    }
  }
  return moves;
}

export function applyMove(state: GameState, move: Move): GameState {
  const board = state.board.map((cell) => [...cell]);
  const fromStack = board[move.fromCell];
  if (fromStack === undefined) {
    throw new Error(`applyMove: invalid fromCell ${move.fromCell}`);
  }
  const toStack = board[move.toCell];
  if (toStack === undefined) {
    throw new Error(`applyMove: invalid toCell ${move.toCell}`);
  }
  const picked = fromStack.splice(fromStack.length - move.numPieces);
  toStack.push(...picked);
  return { board, currentPlayer: opponent(state.currentPlayer) };
}

export function isTerminal(state: GameState): boolean {
  const nonEmpty = state.board.filter((cell) => cell.length > 0);
  if (nonEmpty.length === 0) return false;
  const tops = new Set(
    nonEmpty.map((cell) => cell[cell.length - 1]).filter((v): v is string => v !== undefined),
  );
  return tops.size === 1;
}

export function winner(state: GameState): Player | null {
  if (!isTerminal(state)) return null;
  const nonEmpty = state.board.filter((cell) => cell.length > 0);
  const first = nonEmpty[0];
  if (first === undefined) return null;
  return first[first.length - 1] as Player;
}
