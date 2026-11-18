import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// scripts/check-dist.sh run on a doctored dist/: a copy of the scripts next to a
// built package of five files, whose entry and engine chunk each case writes.
const ENGINE = 'assets/engine-AAAAAAAA.js';
const ELEMENT = 'assets/pogo-x-BBBBBBBB.js';
const LOADER = `const LOADERS = { "pogo-x": () => import("./${ELEMENT}").then((m) => m.PogoX) };\nexport { LOADERS };\n`;
let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function check(entry: string, engine = 'export const s = 1;\n'): { status: number | null; out: string } {
  root = mkdtempSync(join(tmpdir(), 'check-dist-'));
  mkdirSync(join(root, 'scripts'));
  for (const f of ['check-dist.sh', 'dist-imports.mjs'])
    if (existsSync(resolve(process.cwd(), 'scripts', f))) cpSync(resolve(process.cwd(), 'scripts', f), join(root, 'scripts', f));
  mkdirSync(join(root, 'dist/assets'), { recursive: true });
  const files: Record<string, string> = {
    'pogo-figures.js': entry,
    'search-worker.js': 'self.onmessage = () => {};\n',
    'manifest.json': '["pogo-x"]\n',
    [ENGINE]: engine,
    [ELEMENT]: 'export class PogoX {}\n',
  };
  for (const [f, text] of Object.entries(files)) writeFileSync(join(root, 'dist', f), text);
  const run = spawnSync('bash', [join(root, 'scripts/check-dist.sh')], { encoding: 'utf8', timeout: 30_000 });
  return { status: run.status, out: run.stdout + run.stderr };
}

describe('check-dist: the entry imports statically only the engine chunk', () => {
  it('passes a dist whose entry imports the engine and loads the element on demand (the control)', () => {
    expect(check(`import { s as E } from "./${ENGINE}";\n${LOADER}`)).toMatchObject({ status: 0 });
  });

  // Regression: ec3f90c — the check matched only `import … from "…"` at a line's start, double-quoted:
  // a side-effect, single-quoted, minified or re-exporting import, or one made by the engine chunk, passed.
  it.each([
    ['a side-effect import', `import "./${ELEMENT}";\n`],
    ['a single-quoted import', `import { PogoX } from './${ELEMENT}';\n`],
    ['a minified import, second on its line', `import{s as E}from"./${ENGINE}";import{PogoX as P}from"./${ELEMENT}";\n`],
    ['a re-export', `export { PogoX } from "./${ELEMENT}";\n`],
  ])('fails on %s of an element chunk', (_name, line) => {
    const run = check(`import { s as E } from "./${ENGINE}";\n${line}${LOADER}`);
    expect(run.status, run.out).toBe(1);
    expect(run.out).toContain(ELEMENT);
  });

  it('fails on an element chunk the engine chunk imports statically', () => {
    const run = check(`import { s as E } from "./${ENGINE}";\n${LOADER}`, `import "./pogo-x-BBBBBBBB.js";\nexport const s = 1;\n`);
    expect(run.status, run.out).toBe(1);
    expect(run.out).toContain(ELEMENT);
  });
});
