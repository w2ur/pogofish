// The size budget and the shape of the built package, read from dist/ after
// `npm run build`. Run it as `npm run budget` (node runs the file itself, so a
// missing build exits 2 before any test: could not run, never a pass); CI runs it
// after the build. Caps live in budget.json, each with its reason.
//
// The shape: the entry imports statically only the engine glue, never an element
// module, the wasm, a net or a data file; every tag of the manifest has a loader
// in the entry pointing at its own chunk, which exports the element's class; and
// there are as many tags as element modules in src/elements/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const ENTRY = 'pogo-figures.js';

if (!existsSync(resolve(DIST, ENTRY)) || !existsSync(resolve(DIST, 'manifest.json'))) {
  console.error('budget: no dist/pogo-figures.js or dist/manifest.json; run npm run build first');
  process.exit(2);
}

const budget = JSON.parse(readFileSync(resolve(ROOT, 'budget.json'), 'utf8'));
const text = (f) => readFileSync(resolve(DIST, f), 'utf8');
const gz = (f) => gzipSync(readFileSync(resolve(DIST, f))).length;
const jsFiles = readdirSync(DIST).filter((f) => f.endsWith('.js'));

/** The chunks a file imports statically: `import … from "./x.js"` and `import "./x.js"`. */
const staticImports = (f) =>
  [...text(f).matchAll(/^import\s+(?:[^'";]*?\s+from\s+)?["']\.\/([^"']+)["']/gm)].map((m) => m[1]);

/** The entry and every chunk reachable from it by static imports. */
function eagerClosure() {
  const seen = new Set([ENTRY]);
  const queue = [ENTRY];
  while (queue.length) for (const dep of staticImports(queue.pop())) if (!seen.has(dep)) seen.add(dep), queue.push(dep);
  return [...seen];
}

/** `"pogo-x": () => import("./pogo-x-HASH.js").then((m) => m.PogoX)` in the entry, as tag → [chunk, export]. */
function loaders() {
  const out = new Map();
  for (const m of text(ENTRY).matchAll(/"(pogo-[a-z-]+)":\s*\(\)\s*=>\s*import\("\.\/([^"]+)"\)\.then\(\(?(\w+)\)?\s*=>\s*\3\.(\w+)\)/g))
    out.set(m[1], [m[2], m[4]]);
  return out;
}

const manifest = JSON.parse(text('manifest.json'));

test('the entry is under its gzip cap, and under the plan’s 120 000', () => {
  const size = gz(ENTRY);
  assert.ok(budget.js.entry.gzip <= 120000, 'the entry cap is above the plan’s ceiling');
  assert.ok(size <= budget.js.entry.gzip, `${ENTRY}: ${size} gzip bytes > ${budget.js.entry.gzip}`);
});

test('what loads before any figure nears the screen is under its cap', () => {
  const files = eagerClosure();
  const size = files.reduce((n, f) => n + gz(f), 0);
  assert.ok(size <= budget.js.eager.gzip, `eager ${files.join(' + ')}: ${size} gzip bytes > ${budget.js.eager.gzip}`);
});

test('no other JS file is over the largest-chunk cap, and all of them together under the total cap', () => {
  let total = 0;
  for (const f of jsFiles) {
    const size = gz(f);
    total += size;
    if (f !== ENTRY) assert.ok(size <= budget.js.largestChunk.gzip, `${f}: ${size} gzip bytes > ${budget.js.largestChunk.gzip}`);
  }
  assert.ok(total <= budget.js.total.gzip, `all JS: ${total} gzip bytes > ${budget.js.total.gzip}`);
});

test('the entry imports statically only the engine glue: no element, wasm, net or data file', () => {
  const eager = eagerClosure();
  assert.deepEqual(
    eager.filter((f) => f !== ENTRY && !/^engine-[\w-]+\.js$/.test(f)),
    [],
    'the entry statically imports more than the engine chunk',
  );
  for (const f of eager) {
    const source = text(f);
    assert.doesNotMatch(source, /^import[^;]*\.wasm["']/m, `${f} imports the wasm statically`);
    assert.doesNotMatch(source, /nets\/|\.pfw|\.pfv/, `${f} names a net`);
    assert.doesNotMatch(source, /data\/[\w-]+\.json/, `${f} names a data file`);
  }
});

test('every tag of the manifest has a loader in the entry, pointing at its own chunk that exports the class', () => {
  const table = loaders();
  assert.deepEqual([...table.keys()].sort(), [...manifest].sort(), 'the entry’s loaders and manifest.json disagree');
  const chunks = new Set();
  for (const [tag, [chunk, name]] of table) {
    assert.ok(chunk.startsWith(`${tag}-`), `<${tag}> loads ${chunk}, not a chunk of its own module`);
    assert.ok(existsSync(resolve(DIST, chunk)), `<${tag}>: ${chunk} is missing`);
    assert.match(text(chunk), new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`), `${chunk} does not export ${name}`);
    chunks.add(chunk);
  }
  assert.equal(chunks.size, table.size, 'two tags share a chunk');
});

test('there are as many tags as element modules', () => {
  const dir = resolve(ROOT, 'src/elements');
  const modules = readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && /\bextends PogoFigure\b/.test(readFileSync(resolve(dir, f), 'utf8')),
  );
  assert.deepEqual(modules.map((f) => f.replace(/\.ts$/, '')).sort(), [...manifest].sort());
});

test('each data file is under its cap', () => {
  for (const [file, cap] of Object.entries(budget.data)) {
    const path = `data/${file}`;
    assert.ok(existsSync(resolve(DIST, path)), `${path} is missing from dist/`);
    assert.ok(gz(path) <= cap.gzip, `${path}: ${gz(path)} gzip bytes > ${cap.gzip}`);
    if (cap.raw !== undefined) assert.ok(readFileSync(resolve(DIST, path)).length <= cap.raw, `${path} raw > ${cap.raw}`);
  }
});
