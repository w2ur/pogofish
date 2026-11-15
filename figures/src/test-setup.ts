import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ready } from './engine';
import { IntersectionObserverMock, matchMediaMock } from './test-dom';

globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
globalThis.matchMedia = matchMediaMock;
window.matchMedia = matchMediaMock;

// Node has no fetch for file: URLs; engine.ts reads those bytes from disk.
// import.meta.url is an http URL under happy-dom, so anchor on the cwd (figures/).
await ready(pathToFileURL(resolve(process.cwd(), '../wasm-pkg/pogofish_wasm_bg.wasm')).href);
