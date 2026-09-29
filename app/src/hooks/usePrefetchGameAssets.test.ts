import { describe, expect, it } from "vitest";
import { assetsToPrefetch } from "./usePrefetchGameAssets";

describe("assetsToPrefetch", () => {
  it("resolves every URL under the build's base path", () => {
    const urls = assetsToPrefetch("/pogofish/");
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith("/pogofish/")).toBe(true);
    expect(urls).toContain("/pogofish/models/lc1-2/az-lc1-s1.onnx");
  });

  it("keeps the root paths for the main SPA", () => {
    expect(assetsToPrefetch("/")).toContain("/ort/ort-wasm-simd-threaded.wasm");
  });
});
