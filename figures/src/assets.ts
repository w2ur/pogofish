// Where the package finds its own files at run time. In dist/ everything sits
// next to the bundle, so the base is the bundle's own URL. The dev harness
// serves the sources from elsewhere and sets both by `configureAssets`.

// Variables, not literals: Vite rewrites `new URL('literal', import.meta.url)`,
// and a library build would inline a literal worker as base64.
const HERE = '.';
const WORKER_FILE = 'search-worker.js';

let base = new URL(HERE, import.meta.url).href;
let worker = new URL(WORKER_FILE, import.meta.url).href;

export const WASM_FILE = 'pogofish_wasm_bg.wasm';
export const NET_FILE = 'nets/az-lc1-s1.pfw';
/** The net the board plays and the footer names. */
export const NET_NAME = 'az-lc1-s1';

export function assetUrl(name: string): string {
  return new URL(name, base).href;
}

export function workerUrl(): string {
  return worker;
}

/** For the harness: the base the binaries are served from, and the worker module. */
export function configureAssets(o: { base?: string; worker?: string }): void {
  const origin = globalThis.location?.href;
  if (o.base !== undefined) base = new URL(o.base, origin).href;
  if (o.worker !== undefined) worker = new URL(o.worker, origin).href;
}
