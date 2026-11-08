// One panel per candidate move from a position, with the solver's verdict under each (= keeps the draw, ✗ loses).
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });
const [out, prefixJ, verdictJ] = process.argv.slice(2);
const L = { White: 'W', Red: 'R' };
let s = w.initial_state();
for (const [a, n, b] of JSON.parse(prefixJ)) s = w.apply_move(s, { from_cell: a, num_pieces: n, to_cell: b });
const verdict = JSON.parse(verdictJ); // {"from,n,to": "=" | "x"}
const legal = w.legal_moves(s).map(m => [m.from_cell, m.num_pieces, m.to_cell]);
if (legal.length !== Object.keys(verdict).length || !legal.every(m => verdict[m.join(',')])) { console.error('verdicts do not match legal moves', legal); process.exit(1); }
const css = fs.readFileSync(new URL('./board.css', import.meta.url), 'utf8');
function board(mark) {
  return '<div class="g">' + s.cells.map((cell, i) => {
    const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
    const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ""}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mark && mark[0] === i && k < mark[1] ? 'mv' : ''}"></div>`).join('');
    const body = cell.length ? `<div class="st">${pcs}</div>${cell.length > 1 ? `<span class="n">${cell.map(p => L[p]).join('')}</span>` : ''}` : '<div class="e"></div>';
    return `<div class="c ${mark && mark[0] === i ? 'sel' : ''}">${body}${mark && mark[2] === i ? '<div class="dot"></div>' : ''}</div>`;
  }).join('') + '</div>';
}
const panels = [`<div class="panel"><div class="b">${board(null)}</div><div class="v">&nbsp;</div></div>`]
  .concat(legal.map(m => { const v = verdict[m.join(',')]; return `<div class="panel ${v === '=' ? 'keep' : ''}"><div class="b">${board(m)}</div><div class="v">${v === '=' ? '=' : '✗'}</div></div>`; }));
const html = `<!doctype html><html><head><style>${css}
.sheet{display:grid;grid-template-columns:repeat(4,max-content);gap:28px 22px;padding:24px;background:var(--page);width:max-content}
.panel{border-radius:6px;padding:6px}.panel.keep{box-shadow:0 0 0 4px var(--acc)}
.v{text-align:center;font-size:40px;font-weight:600;color:var(--acc);height:52px;line-height:52px}
</style></head><body><div class="sheet">${panels.join('')}</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
await page.locator('.sheet').screenshot({ path: out });
await browser.close();
console.log('panels', panels.length);
