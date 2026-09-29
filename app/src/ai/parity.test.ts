/**
 * Plan task 6.4: the ONNX net the site plays agrees with the Rust net the
 * terminal game plays, on 100 lc1-2 positions, within 1e-5. The reference
 * outputs come from crates/infer/examples/parity_fixture.rs (the pure-Rust
 * MLP reading crates/cli/assets/az-lc1-s1.pfw). The input goes through the
 * app's own path: each position is replayed from the start with the app's
 * applyMove (so its history is built as in a game), then the TS shim, the
 * WASM encoding and onnxruntime-web.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ort from "onnxruntime-web";
import { OnnxModel } from "./onnx";
import { LC1_NET } from "./player";
import { applyMove, initialState } from "../engine/engine";
import type { GameState } from "../engine/types";
import fixture from "./parity-lc1-2.json";

// onnx.ts points the runtime at the site's /ort/; under Node, load it from the package.
ort.env.wasm.wasmPaths = resolve(__dirname, "../../node_modules/onnxruntime-web/dist/") + "/";

const TOLERANCE = 1e-5;

type Position = (typeof fixture.positions)[number];

/** The position, reached from the start through the app's own engine. */
function replay(p: Position): GameState {
  let s = initialState();
  for (const [fromCell, numPieces, toCell] of p.moves) {
    s = applyMove(s, { fromCell: fromCell!, numPieces: numPieces!, toCell: toCell! });
  }
  return s;
}

let model: OnnxModel;
beforeAll(async () => {
  model = new OnnxModel(LC1_NET.features);
  await model.load(readFileSync(resolve(__dirname, "../../public/models/lc1-2", LC1_NET.file)));
});

describe("ONNX / Rust parity (lc1-2 net)", () => {
  it("covers 100 positions, a third of them repeated once", () => {
    expect(fixture.positions).toHaveLength(100);
    expect(fixture.features).toBe(LC1_NET.features);
    const repeated = fixture.positions.filter((p) => p.occurrences_before > 0);
    expect(repeated.length).toBeGreaterThanOrEqual(30);
  });

  it("replays every position to the same board, with its history", () => {
    for (const p of fixture.positions) {
      const s = replay(p);
      expect(s.board).toEqual(p.cells.map((c) => c.map((x) => (x === "White" ? "W" : "R"))));
      expect(s.positionHistory).toHaveLength(p.moves.length);
    }
  });

  it("agrees on every policy logit and value within 1e-5", async () => {
    let worst = 0;
    for (const p of fixture.positions) {
      const { policyLogits, value } = await model.infer(replay(p));
      expect(policyLogits).toHaveLength(p.logits.length);
      p.logits.forEach((l, i) => {
        worst = Math.max(worst, Math.abs(l - policyLogits[i]!));
      });
      worst = Math.max(worst, Math.abs(p.value - value));
    }
    expect(worst).toBeLessThan(TOLERANCE);
    console.log(`ONNX / Rust parity: largest difference ${worst.toExponential(2)}`);
  });

  it("fails when the repetition input is dropped (the check can fail)", async () => {
    const p = fixture.positions.find((q) => q.occurrences_before > 0)!;
    const { value } = await model.infer({ ...replay(p), positionHistory: [] });
    expect(Math.abs(p.value - value)).toBeGreaterThan(TOLERANCE);
  });
});

describe("feature check at load", () => {
  // Regression: a net paired with the wrong features failed only at the
  // first move of a game, in the browser.
  it("refuses a net whose input size does not match the features", async () => {
    const wrong = new OnnxModel("absolute");
    const bytes = readFileSync(resolve(__dirname, "../../public/models/lc1-2", LC1_NET.file));
    await expect(wrong.load(bytes)).rejects.toThrow(/does not take "absolute" features/);
  });
});

describe("absolute features (round-1 nets)", () => {
  it("keep the round-1 layout: 12 slots per cell, then the player to move", async () => {
    const { encodeFeatures, initialState } = await import("../engine/engine");
    const s = initialState();
    const x = encodeFeatures(s, "absolute");
    expect(x).toHaveLength(109);
    s.board.forEach((cell, i) =>
      cell.forEach((p, slot) => expect(x[i * 12 + slot]).toBe(p === "W" ? 1 : -1)),
    );
    expect(x[108]).toBe(s.currentPlayer === "W" ? 1 : -1);
  });
});
