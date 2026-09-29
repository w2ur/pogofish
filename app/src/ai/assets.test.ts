import { describe, expect, it } from "vitest";
import { assetUrl } from "./assets";
import { LC1_NET, alphazeroNet, DQN_PATH } from "./player";
import { RULES_LC1_2 } from "../engine/types";

describe("assetUrl", () => {
  it("resolves ort and models under the root base", () => {
    expect(assetUrl("ort/", "/")).toBe("/ort/");
    expect(assetUrl("models/lc1-2/az-lc1-s1.onnx", "/")).toBe("/models/lc1-2/az-lc1-s1.onnx");
  });

  it("resolves ort and models under the /pogofish/ base", () => {
    expect(assetUrl("ort/", "/pogofish/")).toBe("/pogofish/ort/");
    expect(assetUrl("models/lc1-2/az-lc1-s1.onnx", "/pogofish/")).toBe(
      "/pogofish/models/lc1-2/az-lc1-s1.onnx",
    );
  });

  it("tolerates a base without a trailing slash and a path with a leading one", () => {
    expect(assetUrl("/ort/", "/pogofish")).toBe("/pogofish/ort/");
  });

  it("is what the net path is built from (default base of a test run is /)", () => {
    expect(alphazeroNet(RULES_LC1_2).path).toBe(assetUrl(`models/lc1-2/${LC1_NET.file}`));
    expect(DQN_PATH).toBe(assetUrl("models/dqn_tiny.onnx"));
  });
});
