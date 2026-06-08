import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  test: {
    setupFiles: ["./src/test-setup.ts"],
  },
  worker: {
    format: "es",
  },
  resolve: {
    // Use the extern-wasm variant of onnxruntime-web so Vite does not emit
    // wasm asset copies into dist/assets/. The actual wasm files are served
    // from /ort/ via viteStaticCopy and referenced by ort.env.wasm.wasmPaths.
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
  optimizeDeps: {
    exclude: ["pogofish-wasm"],
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          // Copy only the JSEP wasm + its loader mjs to dist/ort/ (flat).
          // stripBase:true strips the node_modules/onnxruntime-web/dist/ prefix.
          src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.{wasm,mjs}",
          dest: "ort",
          rename: { stripBase: true },
        },
        {
          // Base wasm + mjs as fallback when JSEP is unavailable.
          src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.{wasm,mjs}",
          dest: "ort",
          rename: { stripBase: true },
        },
      ],
    }),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Pogofish",
        short_name: "Pogofish",
        description: "Play Pogo against AI trained by reinforcement learning",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html}"],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        // The SPA navigation fallback serves the precached (English) index.html
        // for navigations. Exclude /fr so the French document is fetched from
        // the network instead of being shadowed by the English shell.
        navigateFallbackDenylist: [/^\/fr(\/|$)/],
        runtimeCaching: [
          {
            // Runtime-cache same-origin ORT wasm (CacheFirst; not precached due to size).
            urlPattern: /\/ort\/.*\.wasm$/,
            handler: "CacheFirst",
            options: {
              cacheName: "ort-wasm",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/models\/.*\.onnx$/,
            handler: "CacheFirst",
            options: {
              cacheName: "onnx-models",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/models\/minimax_table\.json\.gz$/,
            handler: "CacheFirst",
            options: {
              cacheName: "minimax-table",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
