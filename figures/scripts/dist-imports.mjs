// What a built file imports, read from its text: one detection for scripts/budget.test.mjs
// and scripts/check-dist.sh, so the two cannot disagree on what the entry loads eagerly.
// It reads Rollup's output, formatted or minified: `import x from "./a.js"`, `import './a.js'`,
// `import{x}from"./a.js"` (several on one line), and `export { x } from "./a.js"`, which
// loads its module as eagerly as an import.
//
//   node scripts/dist-imports.mjs eager <dist> <entry>
//
// prints the entry and every file reachable from it by static imports, one path of <dist>
// per line. Exit 0 printed · 2 could not run (no such file, bad arguments).
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A static `import`, or an `export … from`, at a statement's start: its specifier, either quote, never spaced (a comment's « import's » is no import). */
const STATIC = /(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{][^'";]*?\s*from\s*)?["']([^"'\s]+)["']/g;
/** `import("./x.js")`. */
const DYNAMIC = /\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

const relative = (spec) => /^\.{1,2}\//.test(spec);
/** A relative specifier, as a path of dist/, from the file that holds it. */
const under = (from, spec) => posix.normalize(posix.join(posix.dirname(from), spec));
const text = (dist, f) => readFileSync(resolve(dist, f), 'utf8');

/** Every specifier `f` imports statically, relative or not, as written. */
export const staticSpecifiers = (dist, f) => [...text(dist, f).matchAll(STATIC)].map((m) => m[1]);

/** The files `f` imports statically, as paths of dist/. */
export const staticImports = (dist, f) => staticSpecifiers(dist, f).filter(relative).map((spec) => under(f, spec));

/** The files `f` imports dynamically, as paths of dist/. */
export const dynamicImports = (dist, f) => [...text(dist, f).matchAll(DYNAMIC)].map((m) => under(f, m[1]));

/** `entry` and every file reachable from it by static imports. */
export function eagerClosure(dist, entry) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) for (const dep of staticImports(dist, queue.pop())) if (!seen.has(dep)) seen.add(dep), queue.push(dep);
  return [...seen];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, dist, entry] = process.argv.slice(2);
  if (command !== 'eager' || !dist || !entry) {
    console.error('usage: node scripts/dist-imports.mjs eager <dist> <entry>');
    process.exit(2);
  }
  try {
    for (const f of eagerClosure(dist, entry)) console.log(f);
  } catch (error) {
    console.error(`dist-imports: ${error.message}`);
    process.exit(2);
  }
}
