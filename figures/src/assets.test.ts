import { describe, expect, it } from 'vitest';
import { packageRoot } from './assets';

// dist/ keeps the entry at its root and every hashed chunk under assets/; this module
// is bundled into one of those chunks, and must still resolve the binaries from the root.
describe('packageRoot', () => {
  it('is the folder of a module at the root', () => {
    expect(packageRoot('https://example.org/pogo/pogo-figures.js')).toBe('https://example.org/pogo/');
  });

  it('is the parent of the chunk folder for a module under assets/', () => {
    expect(packageRoot('https://example.org/pogo/assets/engine-AbCd1234.js')).toBe('https://example.org/pogo/');
  });

  it('only for a folder named exactly assets', () => {
    expect(packageRoot('https://example.org/my-assets/x.js')).toBe('https://example.org/my-assets/');
    expect(packageRoot('https://example.org/pogo/src/assets.ts')).toBe('https://example.org/pogo/src/');
  });
});
