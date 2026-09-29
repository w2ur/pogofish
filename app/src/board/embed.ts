/**
 * The board-only build's contract with its host page: language and theme come
 * from the URL, the theme can then be changed by a `message` from the host.
 */

export type Lang = "fr" | "en";
export type Theme = "light" | "dark";
export type Level = "easy" | "normal" | "hard";

/** MCTS simulations per level — the same numbers as the CLI
 *  (crates/cli/src/main.rs). Only "normal" is a measured level. */
export const LEVEL_SIMS: Record<Level, number> = { easy: 25, normal: 100, hard: 400 };

export const DEFAULT_LEVEL: Level = "normal";

/** `?lang=fr|en`; anything else is English. */
export function parseLang(search: string): Lang {
  return new URLSearchParams(search).get("lang") === "fr" ? "fr" : "en";
}

/** `?theme=light|dark`; anything else follows the system preference. */
export function parseTheme(search: string, prefersDark: boolean): Theme {
  const value = new URLSearchParams(search).get("theme");
  if (value === "light" || value === "dark") return value;
  return prefersDark ? "dark" : "light";
}

/** The one payload the host may send: exactly `{ pogofishTheme: "light" | "dark" }`. */
export function themeFromMessage(
  event: { origin: string; data: unknown },
  ownOrigin: string,
): Theme | null {
  if (event.origin !== ownOrigin) return null;
  const data = event.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== "pogofishTheme") return null;
  const value = (data as { pogofishTheme: unknown }).pogofishTheme;
  return value === "light" || value === "dark" ? value : null;
}

/** Applies a host message to `root` (the `<html>` element); ignores anything else. */
export function handleThemeMessage(
  event: { origin: string; data: unknown },
  ownOrigin: string,
  root: { dataset: Record<string, string | undefined> },
): void {
  const theme = themeFromMessage(event, ownOrigin);
  if (theme) root.dataset.theme = theme;
}

/** A setting button only restarts the game when it changes something. */
export function isChange<T>(current: T, next: T): boolean {
  return current !== next;
}

/** The status line pulses while the net is working, never after a failure. */
export function shouldPulse(thinking: boolean, failed: boolean): boolean {
  return thinking && !failed;
}
