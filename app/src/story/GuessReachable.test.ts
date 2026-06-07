import { describe, it, expect } from "vitest";
import { sliderToValue } from "./GuessReachable";

describe("sliderToValue", () => {
  it("maps the endpoints to the log-scale bounds", () => {
    expect(sliderToValue(0)).toBe(100_000);
    expect(sliderToValue(1000)).toBe(100_000_000);
  });

  it("passes through the decade marks", () => {
    // 1/3 of the way ≈ 1e6, 2/3 ≈ 1e7
    expect(sliderToValue(1000 / 3)).toBe(1_000_000);
    expect(sliderToValue((1000 * 2) / 3)).toBe(10_000_000);
  });

  it("is monotonically increasing", () => {
    let prev = -1;
    for (let s = 0; s <= 1000; s += 50) {
      const v = sliderToValue(s);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it("clamps out-of-range inputs", () => {
    expect(sliderToValue(-100)).toBe(100_000);
    expect(sliderToValue(5000)).toBe(100_000_000);
  });
});
