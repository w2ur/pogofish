import { describe, expect, it } from "vitest";
import { guardedHandler } from "./guardedHandler";

describe("guardedHandler", () => {
  it("answers with an error response when the player failed to start", async () => {
    const posted: unknown[] = [];
    const handler = guardedHandler(
      () => Promise.reject(new Error("wasm init failed")),
      async () => {},
      (r) => posted.push(r),
    );
    await handler({ id: 7 });
    expect(posted).toEqual([{ type: "error", id: 7, message: "wasm init failed" }]);
  });

  it("answers with an error response when handling throws", async () => {
    const posted: unknown[] = [];
    const handler = guardedHandler(
      async () => "player",
      async () => {
        throw new Error("boom");
      },
      (r) => posted.push(r),
    );
    await handler({ id: 1 });
    expect(posted).toEqual([{ type: "error", id: 1, message: "boom" }]);
  });

  it("posts nothing on success", async () => {
    const posted: unknown[] = [];
    const handler = guardedHandler(
      async () => "player",
      async () => {},
      (r) => posted.push(r),
    );
    await handler({ id: 2 });
    expect(posted).toEqual([]);
  });
});
