import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm}"],
        runtimeCaching: [
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
