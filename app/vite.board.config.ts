import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

/** The entry is `board.html` (next to the main `index.html`); the hub serves
 *  the folder, so it must come out as `index.html`. */
function boardAsIndex(): Plugin {
  return {
    name: "board-as-index",
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        const page = bundle["board.html"];
        if (!page) throw new Error("board.html missing from the bundle");
        delete bundle["board.html"];
        page.fileName = "index.html";
        bundle["index.html"] = page;
      },
    },
  };
}

// Board-only build for the hub, served under /pogofish/. Ships the engine wasm,
// the one net it plays (az-lc1-s1) and the non-JSEP ORT pair; `publicDir` is
// off so nothing else from public/ (minimax table, LC3 / DQN nets) is copied.
export default defineConfig({
  base: "/pogofish/",
  publicDir: false,
  worker: { format: "es" },
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm"],
    // The default onnxruntime-web entry probes for the JSEP (WebGPU) wasm, which
    // this build does not ship; the `/wasm` entry is the CPU build and asks for
    // ort-wasm-simd-threaded.{wasm,mjs} only.
    alias: [{ find: /^onnxruntime-web$/, replacement: "onnxruntime-web/wasm" }],
  },
  optimizeDeps: { exclude: ["pogofish-wasm"] },
  build: {
    outDir: "dist-board",
    emptyOutDir: true,
    rollupOptions: { input: "board.html" },
  },
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.{wasm,mjs}",
          dest: "ort",
          rename: { stripBase: true },
        },
        {
          src: "public/models/lc1-2/az-lc1-s1.onnx",
          dest: "models/lc1-2",
          rename: { stripBase: true },
        },
      ],
    }),
    boardAsIndex(),
  ],
});
