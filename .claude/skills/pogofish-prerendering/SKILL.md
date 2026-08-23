---
name: pogofish-prerendering
description: Load before touching scripts/prerender.mjs, app/netlify.toml build settings, vite-plugin-pwa precache config, or the /fr routing — explains how the SPA gets prerendered into static English/French documents and where that pipeline is fragile.
---

# Prerendering pipeline (pogofish)

`npm run build` ends with `node scripts/prerender.mjs`: it serves the fresh
`dist/` with `vite preview`, drives it in headless Chromium (Playwright), waits
for the whole article (including the lazy Act III chunks) to render, and writes
two per-language documents: `dist/index.html` (English, x-default) and
`dist/fr/index.html` (French). Language is URL-authoritative (see `LangContext`),
so `/` and `/fr` each render their own language; the French head
(canonical/og:url/og:locale/title/description) is rewritten during the snapshot.
The app is otherwise a pure client-rendered SPA, so this is what lets non-JS
consumers (Bing, AI crawlers like GPTBot/ClaudeBot/PerplexityBot, social/RSS
unfurlers) and first paint see the article. React still boots and re-renders on
the client — deliberately **no hydration**, because the gsap/motion/lenis scroll
stack initialises imperatively and would mismatch.

- Needs Chromium: `npm install` pulls `@playwright/browser-chromium` +
  `playwright-core`. CI sets `PLAYWRIGHT_BROWSERS_PATH=0` (in `app/netlify.toml`)
  so the binary lands in `node_modules` and Netlify's cache keeps it.
- Failure is non-fatal: a prerender error logs a warning and ships the CSR shell
  instead, so it never blocks a deploy.
- i18n: `/fr` is a real prerendered URL with reciprocal `hreflang`
  (en/fr/x-default) and its own canonical. `app/netlify.toml` routes `/fr` → the
  French document; `vite.config.ts` `navigateFallbackDenylist` stops the service
  worker shadowing `/fr` with the English shell; and an inline script in
  `index.html` redirects French browsers from `/` to `/fr` on first visit
  (honouring an explicit stored choice).
- Caveat: vite-plugin-pwa computes its precache manifest during `vite build`,
  before the prerender rewrite, so the recorded `index.html` revision is the
  shell's. In practice the shell's asset hashes change whenever content changes,
  so the service worker still updates (returning users may see the previous
  render for one extra navigation under `autoUpdate`).

## Deployment context

Netlify — static deploy of the `app/` build output. No server-side code. Live at
`https://pogofish.revah.paris`.

- Netlify **base directory must be `app`** — that is where `netlify.toml` lives
  (it sets `publish = "dist"`, the SPA redirect, and immutable cache headers).
- `app/netlify.toml` `[build.environment]` sets `NODE_VERSION = "20"` and
  `PLAYWRIGHT_BROWSERS_PATH = "0"` (so the prerender step's Chromium is cached
  across builds).
