import { type GameState, type Move } from "../engine/types";
import { legalMoves, applyMove } from "../engine/engine";

/** Shape of each entry in the minimax JSON table (compact format). */
interface RawMinimaxEntry {
  v: number;         // value: +1 (current player wins), -1 (loses), 0 (draw)
  m?: [number, number, number]; // best move [fromCell, numPieces, toCell], absent for terminal/draw
}

/** Normalized entry for internal use. */
interface MinimaxEntry {
  value: number;
  best_move: [number, number, number] | null;
}

export type MinimaxTable = Map<string, MinimaxEntry>;

/**
 * Convert a GameState to the Python-compatible string key.
 * Format: "cell0/cell1/.../cell8:player"
 * Each cell is pieces concatenated bottom-to-top (e.g., "WR").
 * Empty cell = "".
 */
export function stateToKey(state: GameState): string {
  const cells = state.board.map((cell) => cell.join(""));
  return cells.join("/") + ":" + state.currentPlayer;
}

/**
 * Load the gzipped minimax JSON table via streaming decompression.
 */
export async function load(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<MinimaxTable> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch minimax table: ${response.status}`);

  const contentLength = Number(response.headers.get("content-length") ?? 0);

  // Read the compressed stream with progress tracking
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, contentLength);
    }
  }

  // Combine chunks
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // Try to decompress. If the server already decompressed (Content-Encoding: gzip),
  // the data is already plain JSON and DecompressionStream will fail.
  let jsonStr: string;
  try {
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    const decompressedReader = ds.readable.getReader();

    const writePromise = writer.write(combined).then(() => writer.close());

    const decompressedChunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await decompressedReader.read();
      if (done) break;
      if (value) decompressedChunks.push(value);
    }
    await writePromise;

    const decoder = new TextDecoder();
    jsonStr = decompressedChunks.map((c) => decoder.decode(c, { stream: true })).join("") +
      decoder.decode();
  } catch {
    // Already decompressed by the browser (Content-Encoding: gzip)
    jsonStr = new TextDecoder().decode(combined);
  }

  const raw = JSON.parse(jsonStr) as {
    meta: Record<string, unknown>;
    states: Record<string, RawMinimaxEntry>;
  };

  const table: MinimaxTable = new Map();
  for (const [key, entry] of Object.entries(raw.states)) {
    table.set(key, {
      value: entry.v,
      best_move: entry.m ?? null,
    });
  }
  return table;
}

/** Look up a state in the minimax table. */
export function lookup(
  table: MinimaxTable,
  state: GameState,
): MinimaxEntry | null {
  return table.get(stateToKey(state)) ?? null;
}

/** Get the best move from the minimax table. */
export function bestMove(
  table: MinimaxTable,
  state: GameState,
): Move | null {
  const entry = lookup(table, state);
  if (!entry?.best_move) return null;
  const [fromCell, numPieces, toCell] = entry.best_move;
  return { fromCell, numPieces, toCell };
}

export interface PositionEval {
  value: number;
  source: "minimax" | "neural";
  proven: boolean;
}

/** Evaluate a position using the minimax table. */
export function evaluate(
  table: MinimaxTable,
  state: GameState,
): PositionEval | null {
  const entry = lookup(table, state);
  if (!entry) return null;
  return {
    value: entry.value,
    source: "minimax",
    proven: entry.value === 1 || entry.value === -1,
  };
}

/** Rank all legal moves by their minimax value (best first). */
export function rankedMoves(
  table: MinimaxTable,
  state: GameState,
): { move: Move; value: number }[] {
  const moves = legalMoves(state);
  const ranked: { move: Move; value: number }[] = [];

  for (const move of moves) {
    const successor = applyMove(state, move);
    const entry = lookup(table, successor);
    if (entry) {
      // Negate: entry.value is from successor's current player perspective,
      // which is the opponent's perspective relative to the player making the move
      ranked.push({ move, value: -entry.value });
    } else {
      // Unknown position — treat as neutral
      ranked.push({ move, value: 0 });
    }
  }

  ranked.sort((a, b) => b.value - a.value);
  return ranked;
}
