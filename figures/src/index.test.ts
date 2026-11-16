import { describe, expect, it } from 'vitest';
import { defineAll, manifest } from './index';

describe('defineAll and the manifest', () => {
  it('register the same elements, and defineAll is safe to call twice', () => {
    defineAll();
    defineAll();
    for (const name of manifest) expect(customElements.get(name), name).toBeDefined();
    expect(new Set(manifest).size).toBe(manifest.length);
  });
});
