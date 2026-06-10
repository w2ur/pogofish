// Post-build prerender — emits per-language static HTML.
//
// The app is a client-rendered React SPA whose entire article body only exists
// after JS + WASM execute. That leaves non-JS consumers blind: Bing/DuckDuckGo,
// AI crawlers (GPTBot/ClaudeBot/PerplexityBot), social and RSS unfurlers — and
// it delays first paint (bad LCP for a text piece).
//
// This drives the real production build in headless Chromium and writes two
// fully-rendered documents:
//   /     → dist/index.html      (English, x-default)
//   /fr   → dist/fr/index.html   (French)
// Language is URL-authoritative (see LangContext), so each path renders its own
// language. React still boots and re-renders on the client — we deliberately do
// NOT hydrate, because the gsap/motion/lenis scroll stack initialises
// imperatively and would mismatch.
//
// Failure is non-fatal: on any error we keep the vite-built CSR shell, so a
// prerender hiccup degrades gracefully instead of blocking the deploy.

import { preview } from "vite";
import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 4178;
const BASE = "https://pogofish.revah.paris";
const MIN_TEXT = 15000; // the full article renders ~25k chars; guard a thin snapshot

// French SEO copy. The page <title> is already localised at runtime by the app,
// so only the social/search description needs supplying here (the English
// equivalents live statically in index.html).
const FR_DESCRIPTION =
  "Un jeu de plateau, une confiance mal placée dans une IA, six jours de calcul " +
  "gâchés — et une réécriture. L'histoire honnête derrière Pogofish.";

// Read the vite-built shell BEFORE we overwrite dist/index.html, so the /fr
// render (which vite preview won't serve as a file) can be fulfilled with it.
const SHELL = readFileSync(resolve("dist/index.html"), "utf8");

async function render(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("main#content article", { timeout: 30000 });
  await page.waitForFunction(
    (min) => (document.getElementById("root")?.innerText || "").length > min,
    MIN_TEXT,
    { timeout: 30000 },
  );
  await page.evaluate(() => document.fonts?.ready?.then(() => true)).catch(() => {});
  await page.waitForTimeout(300); // let the last lazy chunk paint
}

async function check(page, label) {
  const chars = await page.evaluate(
    () => (document.getElementById("root")?.innerText || "").length,
  );
  const html = await page.content();
  if (html.length < 50000 || chars < MIN_TEXT) {
    throw new Error(`${label} snapshot too thin (${chars} text chars, ${html.length} bytes)`);
  }
  return { html, chars };
}

// Rewrite the French document's head: the body + <title> are already French
// (URL-driven), but the static head metadata is English and the canonical must
// point at /fr.
async function localiseFrHead(page) {
  await page.evaluate(
    ({ base, desc }) => {
      const set = (sel, attr, val) => {
        const el = document.querySelector(sel);
        if (el) el.setAttribute(attr, val);
      };
      const url = base + "/fr/"; // canonical 200 URL (bare /fr 301s to /fr/ on Netlify)
      const title = document.title; // already French (set by the app at runtime)
      set('link[rel="canonical"]', "href", url);
      set('meta[property="og:url"]', "content", url);
      set('meta[property="og:locale"]', "content", "fr_FR");
      set('meta[property="og:locale:alternate"]', "content", "en_US");
      set('meta[property="og:title"]', "content", title);
      set('meta[name="twitter:title"]', "content", title);
      set('meta[name="description"]', "content", desc);
      set('meta[property="og:description"]', "content", desc);
      set('meta[name="twitter:description"]', "content", desc);
      const ld = document.querySelector('script[type="application/ld+json"]');
      if (ld) {
        try {
          const data = JSON.parse(ld.textContent);
          data.headline = title;
          data.description = desc;
          if (data.mainEntityOfPage) data.mainEntityOfPage["@id"] = url;
          ld.textContent = JSON.stringify(data, null, 2);
        } catch {}
      }
    },
    { base: BASE, desc: FR_DESCRIPTION },
  );
}

try {
  const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const origin =
    server.resolvedUrls?.local?.[0]?.replace(/\/$/, "") ?? `http://localhost:${PORT}`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  // vite preview has no file at /fr — serve it the built shell so the SPA boots
  // there and reads pathname=/fr (→ French). Assets/other routes pass through.
  await context.route("**/fr", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: SHELL }),
  );
  const page = await context.newPage();

  // English (x-default) → dist/index.html. dist/index.html still holds the shell
  // here; we overwrite it only after capturing the snapshot.
  await render(page, origin + "/");
  const en = await check(page, "EN");
  writeFileSync(resolve("dist/index.html"), en.html, "utf8");
  console.log(`[prerender] ✓ EN  ${en.html.length} bytes (${en.chars} chars) → dist/index.html`);

  // French → dist/fr/index.html.
  await render(page, origin + "/fr");
  const lang = await page.evaluate(() => document.documentElement.lang);
  if (lang !== "fr") throw new Error(`FR snapshot did not switch language (html lang=${lang})`);
  await localiseFrHead(page);
  const fr = await check(page, "FR");
  mkdirSync(resolve("dist/fr"), { recursive: true });
  writeFileSync(resolve("dist/fr/index.html"), fr.html, "utf8");
  console.log(`[prerender] ✓ FR  ${fr.html.length} bytes (${fr.chars} chars) → dist/fr/index.html`);

  await browser.close();
  process.exit(0);
} catch (err) {
  console.error(
    "\n⚠️  [prerender] FAILED — shipping the CSR shell for this build " +
      "(site still works; SEO/LCP benefit skipped).",
  );
  console.error("   ", err?.message || err);
  process.exit(0); // non-fatal: never block a deploy on prerender
}
