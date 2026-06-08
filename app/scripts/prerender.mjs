// Post-build prerender.
//
// The app is a client-rendered React SPA whose entire article body only
// exists after JS + WASM execute. That leaves non-JS consumers blind:
// Bing/DuckDuckGo, AI crawlers (GPTBot/ClaudeBot/PerplexityBot), social and
// RSS unfurlers — and it delays first paint (bad LCP for a text piece).
//
// This drives the *real* production build in headless Chromium, waits for the
// whole article (including the lazy Act III chunks) to render, then writes the
// fully-rendered HTML back over dist/index.html. React still boots on the
// client and re-renders — we deliberately do NOT hydrate, because the
// gsap/motion/lenis scroll stack initialises imperatively and would mismatch.
//
// Failure is non-fatal: on any error we keep the vite-built CSR shell, so a
// prerender hiccup degrades gracefully to today's behaviour instead of
// blocking the deploy.

import { preview } from "vite";
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 4178;
const OUT = resolve("dist/index.html");
const MIN_TEXT = 15000; // the full article renders ~25k chars; guard a thin snapshot

try {
  const server = await preview({
    preview: { port: PORT, strictPort: true },
    logLevel: "warn",
  });
  const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${PORT}/`;

  const browser = await chromium.launch();
  // Block service workers so a previously-cached build can't poison the snapshot.
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("main#content article", { timeout: 30000 });
  await page.waitForFunction(
    (min) => (document.getElementById("root")?.innerText || "").length > min,
    MIN_TEXT,
    { timeout: 30000 },
  );
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(300); // let the last lazy chunk paint

  const chars = await page.evaluate(
    () => (document.getElementById("root")?.innerText || "").length,
  );
  const html = await page.content();
  await browser.close();

  if (html.length < 50000 || chars < MIN_TEXT) {
    throw new Error(`snapshot too thin (${chars} text chars, ${html.length} bytes)`);
  }

  writeFileSync(OUT, html, "utf8");
  console.log(
    `[prerender] ✓ wrote ${html.length} bytes (${chars} text chars) → dist/index.html`,
  );
  process.exit(0);
} catch (err) {
  console.error(
    "\n⚠️  [prerender] FAILED — shipping the CSR shell for this build " +
      "(site still works; SEO/LCP benefit skipped).",
  );
  console.error("   ", err?.message || err);
  process.exit(0); // non-fatal: never block a deploy on prerender
}
