import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEVEL,
  LEVEL_SIMS,
  handleThemeMessage,
  parseLang,
  parseTheme,
} from "./embed";

const ORIGIN = "https://william.revah.paris";

function root(theme = "light") {
  return { dataset: { theme } as Record<string, string | undefined> };
}

describe("parseLang", () => {
  it("accepts fr and en", () => {
    expect(parseLang("?lang=fr")).toBe("fr");
    expect(parseLang("?theme=dark&lang=en")).toBe("en");
  });
  it("falls back to en for unknown or missing values", () => {
    expect(parseLang("?lang=de")).toBe("en");
    expect(parseLang("?lang=FR")).toBe("en");
    expect(parseLang("")).toBe("en");
  });
});

describe("parseTheme", () => {
  it("accepts light and dark whatever the system prefers", () => {
    expect(parseTheme("?theme=light", true)).toBe("light");
    expect(parseTheme("?theme=dark", false)).toBe("dark");
  });
  it("falls back to the system preference for unknown or missing values", () => {
    expect(parseTheme("?theme=sepia", true)).toBe("dark");
    expect(parseTheme("?theme=sepia", false)).toBe("light");
    expect(parseTheme("", true)).toBe("dark");
  });
});

describe("handleThemeMessage", () => {
  it("sets data-theme from a well-formed same-origin message", () => {
    const el = root("light");
    handleThemeMessage({ origin: ORIGIN, data: { pogofishTheme: "dark" } }, ORIGIN, el);
    expect(el.dataset.theme).toBe("dark");
  });

  it("ignores a foreign origin", () => {
    const el = root("light");
    handleThemeMessage(
      { origin: "https://evil.example", data: { pogofishTheme: "dark" } },
      ORIGIN,
      el,
    );
    expect(el.dataset.theme).toBe("light");
  });

  it.each([
    ["an unknown theme", { pogofishTheme: "sepia" }],
    ["an extra key", { pogofishTheme: "dark", extra: 1 }],
    ["another key", { theme: "dark" }],
    ["a bare string", "dark"],
    ["null", null],
    ["an array", [{ pogofishTheme: "dark" }]],
    ["a non-string theme", { pogofishTheme: 1 }],
  ])("ignores %s", (_name, data) => {
    const el = root("light");
    handleThemeMessage({ origin: ORIGIN, data }, ORIGIN, el);
    expect(el.dataset.theme).toBe("light");
  });
});

describe("levels", () => {
  it("map to the CLI's simulation counts", () => {
    expect(LEVEL_SIMS).toEqual({ easy: 25, normal: 100, hard: 400 });
  });
  it("default to the measured level", () => {
    expect(DEFAULT_LEVEL).toBe("normal");
  });
});
