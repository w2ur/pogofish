// Plays the greedy player (White) against the portfolio's AlphaZero net (Red, level "normal") on the live board.
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });
const L = { White: 'W', Red: 'R' };
const name = i => 'abc'[i % 3] + (3 - Math.floor(i / 3));
const tops = (s, c) => s.cells.filter(x => x.length && x[x.length - 1] === c).length;
function greedy(s) {
  let best = null, bv = -1e9;
  for (const m of w.legal_moves(s)) {
    const t = w.apply_move(s, m);
    const v = tops(t, 'White') - tops(t, 'Red') + (tops(t, 'Red') === 0 ? 1000 : 0);
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}
const sig = s => JSON.stringify(s.cells.map(c => c.map(p => L[p]).join('')));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
await page.goto('https://william.revah.paris/pogofish/', { waitUntil: 'networkidle' });
async function readBoard(order) {
  const labels = await page.$$eval('[role=button][aria-label*=","]', els => els.map(e => e.getAttribute('aria-label')));
  const cells = Array(9).fill('');
  for (const l of labels) { const [c, p] = l.split(', '); const i = (3 - +c[1]) * 3 + 'abc'.indexOf(c[0]); const ps = p === 'empty' ? [] : p.split(' over '); cells[i] = (order ? ps : ps.reverse()).join(''); }
  return JSON.stringify(cells);
}
let s = w.initial_state(); const moves = [];
for (let ply = 0; ply < 80; ply++) {
  const st = await page.locator('[role=status]').innerText();
  if (s.to_move === 'White') {
    if (!/your turn/i.test(st)) { console.log('status', st); break; }
    const m = greedy(s);
    await page.getByRole('button', { name: new RegExp('^' + name(m.from_cell) + ',') }).click();
    const cnt = page.getByRole('button', { name: String(m.num_pieces), exact: true });
    if (await cnt.count()) await cnt.click();
    await page.getByRole('button', { name: new RegExp('^' + name(m.to_cell) + ',') }).click();
    s = w.apply_move(s, m); moves.push([m.from_cell, m.num_pieces, m.to_cell]);
    console.log(ply + 1, 'W', name(m.from_cell), m.num_pieces, name(m.to_cell), sig(s));
    if (tops(s, 'Red') === 0) { console.log('White wins'); break; }
    await page.waitForFunction(() => /your turn|win|won|lost|lose|over/i.test(document.querySelector('[role=status]')?.innerText || '') , null, { timeout: 60000 });
    await page.waitForTimeout(300);
  } else {
    let found = null;
    for (const order of [true, false]) { const b = await readBoard(order);
      for (const m of w.legal_moves(s)) { const t = w.apply_move(s, m); if (sig(t) === b) { found = { m, t, order }; break; } } if (found) break; }
    if (!found) { console.log('cannot match red move; status', st, await readBoard(true)); break; }
    s = found.t; moves.push([found.m.from_cell, found.m.num_pieces, found.m.to_cell]);
    console.log(ply + 1, 'R', name(found.m.from_cell), found.m.num_pieces, name(found.m.to_cell), sig(s), 'order', found.order);
    if (tops(s, 'White') === 0) { console.log('Red wins'); break; }
  }
}
console.log('final status:', await page.locator('[role=status]').innerText());
console.log('MOVES', JSON.stringify(moves));
await browser.close();
