import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { manifest } from './src/manifest';

/** Writes the list of custom-element names the article page can look up. */
function manifestPlugin(): Plugin {
  return {
    name: 'pogo-figures-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  base: '/pogo/',
  plugins: [manifestPlugin()],
  build: {
    outDir: 'dist',
    // Binaries live in public/ and are fetched by URL; never inlined.
    assetsInlineLimit: 0,
    lib: {
      // Two entries: the elements, and the search worker they start by URL.
      // A worker built as its own entry is never inlined as a data: URL.
      entry: { 'pogo-figures': 'src/index.ts', 'search-worker': 'src/search.worker.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
  },
});
