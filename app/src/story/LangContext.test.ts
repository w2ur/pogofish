import { describe, it, expect } from "vitest";
import { detectInitialLang } from "./LangContext";

describe("detectInitialLang", () => {
  it("returns 'fr' at the /fr root", () => {
    expect(detectInitialLang("/fr")).toBe("fr");
  });

  it("returns 'fr' under /fr/…", () => {
    expect(detectInitialLang("/fr/")).toBe("fr");
    expect(detectInitialLang("/fr/whatever")).toBe("fr");
  });

  it("returns 'en' at the x-default root", () => {
    expect(detectInitialLang("/")).toBe("en");
  });

  it("returns 'en' for any other path", () => {
    expect(detectInitialLang("/play")).toBe("en");
    expect(detectInitialLang("/anything/else")).toBe("en");
  });

  it("does not treat a /fr-prefixed word as French", () => {
    expect(detectInitialLang("/french-toast")).toBe("en");
    expect(detectInitialLang("/frfr")).toBe("en");
  });
});
