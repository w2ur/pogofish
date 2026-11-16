// Where the package finds its own files at run time. In dist/ the entry, the
// worker, the wasm, nets/ and data/ sit at the root, and every content-hashed
// chunk under assets/ (the site caches that folder for a year): the base is the
// root, derived once here from whichever file this module was bundled into. The
// dev harness serves the sources from elsewhere and sets both by `configureAssets`.

// Variables, not literals: Vite rewrites `new URL('literal', import.meta.url)`,
// and a library build would inline a literal worker as base64.
const HERE = '.';
const UP = '..';
const WORKER_FILE = 'search-worker.js';

/** The folder of dist/ that holds the content-hashed chunks (vite.config.ts `chunkFileNames`). */
export const CHUNK_DIR = 'assets';

/** The package's root, from the URL of a module in it: its folder, or the parent of the chunk folder. */
export function packageRoot(moduleUrl: string): string {
  const dir = new URL(HERE, moduleUrl);
  return dir.pathname.endsWith(`/${CHUNK_DIR}/`) ? new URL(UP, dir).href : dir.href;
}

let base = packageRoot(import.meta.url);
let worker = new URL(WORKER_FILE, base).href;

export const WASM_FILE = 'pogofish_wasm_bg.wasm';
export const NET_FILE = 'nets/az-lc1-s1.pfw';
/** The net the board plays and the footer names. */
export const NET_NAME = 'az-lc1-s1';
/** The TD(λ) value net: models/v4-td-lc1-s1/td.pfv (seed 1, lc1-2), copied under this name. */
export const TD_FILE = 'nets/td-s1.pfv';
/** The checkpoint the TD figures name: the directory it was trained in. */
export const TD_NAME = 'v4-td-lc1-s1';

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
