import { describe, expect, it } from "vitest";
import { STRINGS, failureText } from "./strings";

describe("failure text", () => {
  it("names the button that retries, in each language", () => {
    for (const lang of ["fr", "en"] as const) {
      expect(failureText(lang)).toContain(STRINGS[lang].newGame);
    }
  });

  it("is in the right language", () => {
    expect(failureText("fr")).toContain("Cliquez");
    expect(failureText("en")).toContain("Press");
    expect(failureText("fr")).not.toBe(failureText("en"));
  });
});
