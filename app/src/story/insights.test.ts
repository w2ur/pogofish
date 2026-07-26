import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { InsightsPayload } from "./insights";

const payload: InsightsPayload = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../public/data/lc3-29-insights.json", import.meta.url)),
    "utf8",
  ),
);

describe("capture timing histogram", () => {
  // Regression: LearningsScene rendered "1353 of 500 games record a capture in
  // plies 6-10" — a count larger than its denominator. Each bin counts games
  // that captured at that ply (so bin <= games_played), but a window sum counts
  // capture *events*, which can exceed games_played. These tests pin both facts
  // so the sentence cannot silently drift back to a per-game reading.
  it("never has a single ply bin above games_played", () => {
    for (const [ply, count] of payload.capture_timing_histogram.entries()) {
      expect(count, `ply ${ply}`).toBeLessThanOrEqual(payload.games_played);
    }
  });

  it("sums plies 6-10 to more capture events than there are games", () => {
    const window = payload.capture_timing_histogram
      .slice(6, 11)
      .reduce((a, b) => a + b, 0);
    expect(window).toBeGreaterThan(payload.games_played);
  });
});
