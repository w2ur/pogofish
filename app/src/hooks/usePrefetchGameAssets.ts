import { useEffect, useRef } from "react";

/**
 * Warms the Workbox runtime caches for WASM and ONNX model files when the
 * user is approaching the game section (chapter-x), so the offline game
 * does not cold-start fail.
 *
 * Strategy: fire-and-forget background fetch once, triggered by an
 * IntersectionObserver on the target element. Assets are large so they are
 * explicitly NOT in the SW precache list — this hook handles warm-up instead.
 */

const ASSETS_TO_PREFETCH = [
  // ORT wasm files
  "/ort/ort-wasm-simd-threaded.jsep.wasm",
  "/ort/ort-wasm-simd-threaded.wasm",
  // ONNX models (the two shipped variants)
  "/models/lc1-2/alphazero.onnx",
  "/models/lc3-29/alphazero.onnx",
  // minimax lookup table (gzip-compressed)
  "/models/minimax_table.json.gz",
];

/**
 * Returns true if the page is currently serving through a registered service
 * worker (i.e. the SW caching layer is active).
 */
function hasActiveServiceWorker(): boolean {
  return (
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller !== null
  );
}

/**
 * Fires background fetches for game assets without blocking the main thread.
 * Each fetch is issued in "no-cors" mode so cross-origin opaque responses are
 * accepted where needed; same-origin assets return full responses.
 */
async function prefetchAll(): Promise<void> {
  const queue = ASSETS_TO_PREFETCH.map((url) =>
    fetch(url, { mode: url.startsWith("/") ? "same-origin" : "no-cors", priority: "low" } as RequestInit).catch(() => {
      // Silently swallow network errors — this is a best-effort warm-up only.
    })
  );
  await Promise.allSettled(queue);
}

/**
 * Attaches an IntersectionObserver to `targetId` (defaults to "chapter-x",
 * the play section). When the target becomes visible with a generous rootMargin
 * (2 full screens above), prefetch fires once.
 *
 * Safe to call unconditionally — the observer disconnects after the first
 * trigger and the hook is a no-op on the server.
 */
export function usePrefetchGameAssets(targetId = "chapter-x"): void {
  const prefetchedRef = useRef(false);

  useEffect(() => {
    // Do nothing if the SW is not yet controlling the page (e.g. first visit
    // before SW installation). The network is available anyway on first visit.
    if (!hasActiveServiceWorker()) return;
    if (prefetchedRef.current) return;

    const el = document.getElementById(targetId);
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !prefetchedRef.current) {
            prefetchedRef.current = true;
            observer.disconnect();
            prefetchAll();
          }
        }
      },
      // Start prefetching when the game section is within ~200% of the viewport
      // height above the fold — gives plenty of lead time while scrolling.
      { rootMargin: "200% 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [targetId]);
}
