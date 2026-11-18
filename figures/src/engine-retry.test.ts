import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const WASM = pathToFileURL(resolve(process.cwd(), '../wasm-pkg/pogofish_wasm_bg.wasm')).href;

describe('ready()', () => {
  // Regression: 67520a4 — a failed load was kept forever: every later ready() rejected without trying again.
  it('a load that failed is tried again by the next call', async () => {
    // A fresh module: the setup file has already loaded this one's engine.
    vi.resetModules();
    const engine = await import('./engine');
    await expect(engine.ready(pathToFileURL(resolve(process.cwd(), 'no-such.wasm')).href)).rejects.toThrow();
    await expect(engine.ready(WASM)).resolves.toBeUndefined();
    expect(engine.legal(engine.initial()).length).toBeGreaterThan(0);
  });
});
