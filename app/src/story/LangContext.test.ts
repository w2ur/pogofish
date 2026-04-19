import { describe, it, expect } from "vitest";
import { detectInitialLang } from "./LangContext";

describe("detectInitialLang", () => {
  it("returns the stored value when it is 'en'", () => {
    expect(detectInitialLang("en", "fr-FR")).toBe("en");
  });

  it("returns the stored value when it is 'fr'", () => {
    expect(detectInitialLang("fr", "en-US")).toBe("fr");
  });

  it("ignores invalid stored values and falls back to navigator.language", () => {
    expect(detectInitialLang("de", "fr-CA")).toBe("fr");
    expect(detectInitialLang("garbage", "en-GB")).toBe("en");
  });

  it("defaults to 'en' when nothing is stored and navigator.language is English", () => {
    expect(detectInitialLang(null, "en-US")).toBe("en");
  });

  it("defaults to 'fr' when nothing is stored and navigator.language starts with fr", () => {
    expect(detectInitialLang(null, "fr-FR")).toBe("fr");
    expect(detectInitialLang(null, "fr-CA")).toBe("fr");
  });

  it("defaults to 'en' when navigator.language is undefined", () => {
    expect(detectInitialLang(null, undefined)).toBe("en");
  });
});
