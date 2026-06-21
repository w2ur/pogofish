/**
 * Generates raster PWA icons from icon.svg using Playwright (already a devDep).
 * Produces:
 *   public/icons/icon-192.png          — standard 192×192
 *   public/icons/icon-512.png          — standard 512×512
 *   public/icons/icon-maskable-512.png — maskable with safe-zone padding (~10%)
 */

import { chromium } from "playwright-core";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const SVG_PATH = path.join(projectRoot, "public", "icon.svg");
const OUT_DIR = path.join(projectRoot, "public", "icons");

const SIZES = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
];

/** Maskable icons need ~10% safe-zone padding on each side (Google spec: 40% "bleed" area). */
const MASKABLE_PADDING_PERCENT = 0.1;

async function generate() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const { name, size, maskable } of SIZES) {
    const padding = maskable ? Math.round(size * MASKABLE_PADDING_PERCENT) : 0;
    const iconSize = size - padding * 2;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${size}px; height: ${size}px; overflow: hidden; }
  .bg {
    width: ${size}px;
    height: ${size}px;
    background: #09090b;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  img {
    width: ${iconSize}px;
    height: ${iconSize}px;
  }
</style>
</head>
<body>
<div class="bg">
  <img src="file://${SVG_PATH}" />
</div>
</body>
</html>`;

    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html, { waitUntil: "networkidle" });

    const outPath = path.join(OUT_DIR, name);
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`Generated ${outPath}`);
  }

  await browser.close();
}

generate().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
