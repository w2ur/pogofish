// Renders a Pogo move sequence in the portfolio board's look; every move is checked by the real engine (wasm).
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const out = process.argv[2];
const moves = JSON.parse(process.argv[3]);
const L = { White: 'W', Red: 'R' };

let s = w.initial_state();
const frames = [{ s, mark: null }];
for (const m of moves) {
  const legal = w.legal_moves(s).some(x => x.from_cell === m[0] && x.num_pieces === m[1] && x.to_cell === m[2]);
  if (!legal) { console.error('ILLEGAL', JSON.stringify(m), 'in', JSON.stringify(s.cells)); process.exit(1); }
  frames.push({ s, mark: { from: m[0], n: m[1], to: m[2] } });
  s = w.apply_move(s, { from_cell: m[0], num_pieces: m[1], to_cell: m[2] });
  frames.push({ s, mark: null });
  console.log(`${s.to_move === 'White' ? 'R' : 'W'} ${m[1]}p ${m[0]}->${m[2]}`, JSON.stringify(s.cells.map(c => c.map(p => L[p]).join(''))));
}

const css = `
:root{--page:#f3ede3;--ink:#dcd0bd;--ink2:#e6dccb;--paper:#24190f;--paper3:#726453;--hair:#938576;--acc:#4c1c00;
--wf:#fffdf8;--wt:#e9e0cf;--rf:#b54a33;--rt:#7f2614;--edge:#6b5a48}
body{margin:0;background:var(--page);font-family:system-ui,-apple-system,sans-serif}
.g{display:grid;grid-template-columns:repeat(3,123px);gap:6px;padding:14px;width:max-content}
.c{position:relative;width:123px;height:123px;border-radius:3px;display:flex;align-items:center;justify-content:center;
background:linear-gradient(180deg,var(--ink2) 0%,var(--ink) 100%);box-shadow:inset 0 0 0 1px var(--hair),0 8px 24px -14px rgba(0,0,0,.8)}
.c.sel{box-shadow:inset 0 0 0 5px var(--paper)}
.st{display:flex;flex-direction:column;align-items:center}
.p{width:72px;height:22px;border-radius:50%;outline:1px solid var(--edge)}
.p.low{opacity:.7}
.p.W{background:linear-gradient(180deg,var(--wf),var(--wt));box-shadow:0 1px 0 rgba(255,255,255,.55) inset,0 -1px 0 rgba(80,70,50,.35) inset,0 3px 6px rgba(0,0,0,.45)}
.p.R{background:linear-gradient(180deg,var(--rf),var(--rt));box-shadow:0 1px 0 rgba(255,200,180,.5) inset,0 -1px 0 rgba(40,15,5,.5) inset,0 3px 6px rgba(0,0,0,.45)}
.p.mv{outline:3px solid var(--acc);opacity:1}
.n{position:absolute;bottom:2px;right:4px;font-size:9px;color:var(--paper3)}
.e{width:4px;height:4px;border-radius:50%;background:var(--paper3);opacity:.25}
.dot{position:absolute;top:9px;left:9px;width:26px;height:26px;border-radius:50%;background:var(--acc)}`;

function html({ s, mark }) {
  const cells = s.cells.map((cell, i) => {
    const top = [...cell].reverse();
    const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
    const pieces = top.map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ""}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mark && mark.from === i && k < mark.n ? 'mv' : ''}"></div>`).join('');
    const body = cell.length ? `<div class="st">${pieces}</div>${cell.length > 1 ? `<span class="n">${cell.map(p => L[p]).join('')}</span>` : ''}` : '<div class="e"></div>';
    const cls = mark && mark.from === i ? 'c sel' : 'c';
    const dot = mark && mark.to === i ? '<div class="dot"></div>' : '';
    return `<div class="${cls}">${body}${dot}</div>`;
  }).join('');
  return `<!doctype html><html><head><style>${css}</style></head><body><div class="g">${cells}</div></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const [i, f] of frames.entries()) {
  await page.setContent(html(f));
  await page.locator('.g').screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.png` });
}
await browser.close();
console.log(frames.length, 'frames');
