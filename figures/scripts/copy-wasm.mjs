// Copies the committed wasm-pack build next to the other public binaries so
// Vite emits it verbatim into dist/ instead of inlining it as base64.
import { copyFileSync, mkdirSync } from 'node:fs';

const from = new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url);
const to = new URL('../public/pogofish_wasm_bg.wasm', import.meta.url);
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
copyFileSync(from, to);
