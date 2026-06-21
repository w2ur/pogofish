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
        id: "/",
        name: "Pogofish",
        short_name: "Pogofish",
        description: "Play Pogo against an AI trained by reinforcement learning. A longform article with an inlined board game.",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        orientation: "portrait-primary",
        categories: ["games", "education"],
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          {
            name: "Play Pogo",
            short_name: "Play",
            description: "Jump straight to the board game",
            url: "/#chapter-x",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
        ],
        screenshots: [
          {
            src: "/og-image.png",
            sizes: "1200x630",
            type: "image/png",
            label: "Pogofish — three boards in three acts",
            // "wide" form_factor covers desktop install prompts
            form_factor: "wide",
          },
          {
            src: "/og-image.png",
            sizes: "1200x630",
            type: "image/png",
            label: "Pogofish — play Pogo against an AI",
            // "narrow" form_factor covers mobile install prompts
            form_factor: "narrow",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html}"],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        // The SPA navigation fallback serves the precached (English) index.html
        // for navigations. Exclude /fr so the French document is fetched from
        // the network instead of being shadowed by the English shell.
        navigateFallbackDenylist: [/^\/fr(\/|$)/],
        // Precache the offline fallback page so it is available without a network.
        // The page is served by the registerType:autoUpdate SW when the SPA shell
        // cannot be hydrated (e.g., user opens a deep-link while offline before
        // the SW has cached the shell).
        additionalManifestEntries: [{ url: "/offline.html", revision: null }],
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
          {
            // Google Fonts stylesheet — StaleWhileRevalidate so offline reads
            // from cache while the SW refreshes it in the background.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Google Fonts binary files (woff2) are content-addressed and
            // immutable — CacheFirst with a long TTL is appropriate.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxAgeSeconds: 60 * 60 * 24 * 365,
                maxEntries: 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
