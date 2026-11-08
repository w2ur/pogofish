import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
const out = process.argv[2];
const scheme = process.argv[3] || 'light';
const shots = [
  ['1-depart', null, null],
  ['2-milieu-1piece', 'b3, W over W', '1'],
  ['3-milieu-2pieces', 'b3, W over W', '2'],
  ['4-coin-1piece', 'a3, W over W', '1'],
  ['5-coin-2pieces', 'a3, W over W', '2'],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 780 }, deviceScaleFactor: 2, colorScheme: scheme });
for (const [name, cell, n] of shots) {
  await page.goto('https://william.revah.paris/pogofish/', { waitUntil: 'networkidle' });
  const board = page.getByRole('button', { name: 'a3, W over W' }).locator('..');
  if (cell) {
    await page.getByRole('button', { name: cell }).click();
    await page.getByRole('button', { name: n, exact: true }).click();
  }
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const dests = await page.evaluate(() => {
    const out = [];
    for (const c of document.querySelectorAll(".animate-pulse[aria-label]")) {
      out.push(c.getAttribute("aria-label").split(",")[0]);
      c.classList.remove("animate-pulse");
      c.style.boxShadow = "inset 0 0 0 1px var(--color-hair)";
      const dot = document.createElement("div");
      dot.style.cssText = "position:absolute;top:9px;left:9px;width:26px;height:26px;border-radius:50%;background:var(--color-vermilion)";
      c.appendChild(dot);
    }
    const sel = document.querySelector("[aria-pressed=true][aria-label]");
    if (sel) sel.style.boxShadow = "inset 0 0 0 5px var(--color-paper)";
    return out;
  });
  console.log(name, dests.join(" "));
  await page.waitForTimeout(200);
  await board.screenshot({ path: `${out}/${scheme}-${name}.png` });
}
await browser.close();
