/**
 * Shim layer: re-exports the old TS engine API, backed by the Rust WASM engine.
 * Handles format conversion between TS types (Player="W"|"R", board, currentPlayer,
 * fromCell) and Rust serde format (Color="White"|"Red", cells, to_move, from_cell).
 */

import {
  initial_state,
  legal_moves,
  apply_move,
  is_terminal_default,
  winner as wasm_winner,
} from "pogofish-wasm";

import { type Player, type Cell, type Board, type GameState, type Move, BOARD_SIZE } from "./types";

// ── Color conversion ─────────────────────────────────────────────────────────

type RustColor = "White" | "Red";

function toRustColor(p: string): RustColor {
  return p === "W" ? "White" : "Red";
}

function fromRustColor(c: RustColor): string {
  return c === "White" ? "W" : "R";
}

// ── State conversion ─────────────────────────────────────────────────────────

interface RustState {
  cells: RustColor[][];
  to_move: RustColor;
  move_count: number;
  history: unknown[];
}

function toRustState(ts: GameState): RustState {
  return {
    cells: (ts.board as Cell[]).map((cell) => cell.map(toRustColor)),
    to_move: toRustColor(ts.currentPlayer),
    move_count: 0,
    history: [],
  };
}

function fromRustState(rust: RustState): GameState {
  const board: Board = rust.cells.map(
    (cell) => cell.map(fromRustColor) as string[],
  ) as Board;
  const currentPlayer = fromRustColor(rust.to_move) as Player;
  return { board, currentPlayer };
}

// ── Move conversion ──────────────────────────────────────────────────────────

interface RustMove {
  from_cell: number;
  num_pieces: number;
  to_cell: number;
}

function toRustMove(ts: Move): RustMove {
  return {
    from_cell: ts.fromCell,
    num_pieces: ts.numPieces,
    to_cell: ts.toCell,
  };
}

function fromRustMove(rust: RustMove): Move {
  return {
    fromCell: rust.from_cell,
    numPieces: rust.num_pieces,
    toCell: rust.to_cell,
  };
}

// ── Public API (same signatures as the old TS engine) ────────────────────────

export function initialState(): GameState {
  const rust = initial_state() as RustState;
  return fromRustState(rust);
}

export function legalMoves(state: GameState): Move[] {
  const rustMoves = legal_moves(toRustState(state)) as RustMove[];
  return rustMoves.map(fromRustMove);
}

export function applyMove(state: GameState, move: Move): GameState {
  const rust = apply_move(toRustState(state), toRustMove(move)) as RustState;
  return fromRustState(rust);
}

export function isTerminal(state: GameState): boolean {
  const outcome = is_terminal_default(toRustState(state));
  return outcome !== null && outcome !== undefined;
}

export function winner(state: GameState): Player | null {
  const w = wasm_winner(toRustState(state)) as string | null;
  if (w === null || w === undefined) return null;
  // WASM returns "White" | "Red" | "Draw"
  if (w === "White") return "W";
  if (w === "Red") return "R";
  return null; // Draw maps to null (no single winner)
}

export function manhattanDistance(a: number, b: number): number {
  const rowA = Math.floor(a / BOARD_SIZE);
  const colA = a % BOARD_SIZE;
  const rowB = Math.floor(b / BOARD_SIZE);
  const colB = b % BOARD_SIZE;
  return Math.abs(rowA - rowB) + Math.abs(colA - colB);
}
