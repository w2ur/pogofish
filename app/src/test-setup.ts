import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initSync } from "pogofish-wasm";

// Load WASM bytes synchronously for vitest (Node environment)
const wasmPath = resolve(__dirname, "../node_modules/pogofish-wasm/pogofish_wasm_bg.wasm");
const wasmBytes = readFileSync(wasmPath);
initSync({ module: wasmBytes });
