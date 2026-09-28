/**
 * Plan task 6.4: the ONNX net the site plays agrees with the Rust net the
 * terminal game plays, on 100 lc1-2 positions, within 1e-5. The reference
 * outputs come from crates/infer/examples/parity_fixture.rs (the pure-Rust
 * MLP reading crates/cli/assets/az-lc1-s1.pfw). The input goes through the
 * app's own path: the TS shim, the WASM encoding, then onnxruntime-web.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ort from "onnxruntime-web";
import { OnnxModel } from "./onnx";
import { LC1_NET } from "./player";
import { fromRustState, type RustState } from "../engine/engine";
import fixture from "./parity-lc1-2.json";

// onnx.ts points the runtime at the site's /ort/; under Node, load it from the package.
ort.env.wasm.wasmPaths = resolve(__dirname, "../../node_modules/onnxruntime-web/dist/") + "/";

const TOLERANCE = 1e-5;

describe("ONNX / Rust parity (lc1-2 net)", () => {
  it("covers 100 positions, a third of them repeated once", () => {
    expect(fixture.positions).toHaveLength(100);
    expect(fixture.features).toBe(LC1_NET.features);
    const repeated = fixture.positions.filter((p) => p.state.history.length > 0);
    expect(repeated.length).toBeGreaterThanOrEqual(30);
  });

  it("agrees on every policy logit and value within 1e-5", async () => {
    const model = new OnnxModel(LC1_NET.features);
    await model.load(readFileSync(resolve(__dirname, "../../public/models/lc1-2", LC1_NET.file)));
    let worst = 0;
    for (const p of fixture.positions) {
      const state = fromRustState(p.state as unknown as RustState);
      const { policyLogits, value } = await model.infer(state);
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
    const model = new OnnxModel(LC1_NET.features);
    await model.load(readFileSync(resolve(__dirname, "../../public/models/lc1-2", LC1_NET.file)));
    const p = fixture.positions.find((q) => q.state.history.length > 0)!;
    const stripped = fromRustState({ ...(p.state as unknown as RustState), history: [] });
    const { value } = await model.infer(stripped);
    expect(Math.abs(p.value - value)).toBeGreaterThan(TOLERANCE);
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
