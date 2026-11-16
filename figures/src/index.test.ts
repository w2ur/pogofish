import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineAll, loadAll, manifest } from './index';
import { LOADERS } from './registry';

describe('defineAll and the manifest', () => {
  it('every tag of the manifest has a loader, and the eager path defines them all', async () => {
    expect(Object.keys(LOADERS).sort()).toEqual([...manifest].sort());
    expect(new Set(manifest).size).toBe(manifest.length);
    defineAll();
    defineAll();
    await loadAll();
    await loadAll();
    for (const name of manifest) expect(customElements.get(name), name).toBeDefined();
  });

  it('there are as many tags as element modules, so a new element cannot be forgotten in either list', () => {
    const dir = resolve(process.cwd(), 'src/elements');
    const modules = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && /\bextends PogoFigure\b/.test(readFileSync(resolve(dir, f), 'utf8')),
    );
    expect(modules.map((f) => f.replace(/\.ts$/, '')).sort()).toEqual([...manifest].sort());
  });
});
