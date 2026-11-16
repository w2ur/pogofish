// Whether the reader has a game saved, read without the store or the engine: the
// entry asks it before deciding to define a follow board at load (registry.ts),
// and the store's hasSaved() is this same test.

export const STORAGE_KEY = 'pogo-figures:game';

/** Whether a stored file holds a game (finished or not); saved preferences alone do not count. */
export function holdsGame(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const file = JSON.parse(raw) as { v?: unknown; current?: unknown } | null;
    return file?.v === 1 && file.current !== null && typeof file.current === 'object';
  } catch {
    return false;
  }
}

/** The page's sessionStorage answer; a storage that throws holds nothing. */
export function sessionHoldsGame(): boolean {
  try {
    return holdsGame(globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return false;
  }
}
