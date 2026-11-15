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
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'pogo-figures.js',
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
  },
});
