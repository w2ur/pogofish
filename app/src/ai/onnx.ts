import * as ort from "onnxruntime-web";
import { type Features, type GameState, type Move } from "../engine/types";
import { encodeFeatures, initialState, legalMoves } from "../engine/engine";
import { actionToIndex, indexToAction, maskedSoftmax } from "../engine/encoding";

// Load WASM binaries from same-origin /ort/ (served via viteStaticCopy).
// The PWA service worker caches these after first load for offline use.
ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = 1;

export class OnnxModel {
  private session: ort.InferenceSession | null = null;
  private isDualHead = false;

  /** `features` must be the input features the net was trained with. */
  constructor(private readonly features: Features = "absolute") {}

  async load(source: string | Uint8Array): Promise<void> {
    const options = { executionProviders: ["wasm"] };
    // Two identical calls: `create` has one overload per source type, and a
    // union argument matches neither.
    this.session =
      typeof source === "string"
        ? await ort.InferenceSession.create(source, options)
        : await ort.InferenceSession.create(source, options);
    // Dual-head (AlphaZero) has 2 outputs; single-head (DQN) has 1
    this.isDualHead = this.session.outputNames.length >= 2;
    // The features are not stored in the file: check the net accepts their
    // size now, rather than on the first move of a game.
    try {
      await this.infer(initialState());
    } catch (e) {
      this.session = null;
      throw new Error(`The net does not take "${this.features}" features: ${String(e)}`);
    }
  }

  async infer(
    state: GameState,
  ): Promise<{ policyLogits: Float32Array; value: number }> {
    if (!this.session) throw new Error("Model not loaded");

    const input = encodeFeatures(state, this.features);
    const tensor = new ort.Tensor("float32", input, [1, input.length]);
    const inputName = this.session.inputNames[0]!;
    const results = await this.session.run({ [inputName]: tensor });

    const policyOutput = results[this.session.outputNames[0]!];
    if (!policyOutput) throw new Error("No policy output from model");
    const policyLogits = new Float32Array(policyOutput.data as Float32Array);

    let value = 0;
    if (this.isDualHead) {
      const valueOutput = results[this.session.outputNames[1]!];
      if (valueOutput) {
        const valueData = valueOutput.data as Float32Array;
        value = valueData[0] ?? 0;
      }
    }

    return { policyLogits, value };
  }

  async bestMove(state: GameState): Promise<Move> {
    const moves = legalMoves(state);
    if (moves.length === 0) throw new Error("No legal moves");
    if (moves.length === 1) return moves[0]!;

    const { policyLogits } = await this.infer(state);

    let bestIdx = -1;
    let bestVal = -Infinity;
    for (const move of moves) {
      const idx = actionToIndex(move);
      const val = policyLogits[idx] ?? -Infinity;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = idx;
      }
    }

    return indexToAction(bestIdx);
  }

  async evalForMcts(
    state: GameState,
  ): Promise<{ policy: Float32Array; value: number }> {
    const moves = legalMoves(state);
    const { policyLogits, value } = await this.infer(state);

    const legalIndices = moves.map((m) => actionToIndex(m));
    const policy = maskedSoftmax(policyLogits, legalIndices);

    return { policy, value };
  }
}
