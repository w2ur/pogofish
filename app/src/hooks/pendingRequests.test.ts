import { describe, expect, it } from "vitest";
import { rejectAllPending, type PendingMap } from "./pendingRequests";

describe("rejectAllPending", () => {
  it("rejects every pending request and empties the map", async () => {
    const pending: PendingMap = new Map();
    const a = new Promise((_, reject) => pending.set(1, { reject }));
    const b = new Promise((_, reject) => pending.set(2, { reject }));
    rejectAllPending(pending, new Error("worker crashed"));
    await expect(a).rejects.toThrow("worker crashed");
    await expect(b).rejects.toThrow("worker crashed");
    expect(pending.size).toBe(0);
  });
});
