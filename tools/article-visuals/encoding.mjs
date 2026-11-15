// A position as the TD(λ) net reads it: the board, then its 127 inputs, computed by the engine's
// own encoder (`encode_features`, mover-relative-repetition), one row of 14 per cell.
// Usage: node encoding.mjs OUT.png [MOVES_JSON]
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, movesJ = '[[2,1,1],[7,2,1],[0,1,1]]'] = process.argv.slice(2);
let s = w.initial_state();
for (const [a, n, b] of JSON.parse(movesJ)) s = w.apply_move(s, { from_cell: a, num_pieces: n, to_cell: b });
const x = Array.from(w.encode_features(s, 'mover-relative-repetition'));
if (x.length !== 127) throw new Error(`expected 127 inputs, got ${x.length}`);

const L = { White: 'W', Red: 'R' };
const name = i => 'abc'[i % 3] + (Math.floor(i / 3) + 1);
const board = st => '<div class="g">' + st.cells.map((cell, i) => {
  const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
  const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''}"></div>`).join('');
  return `<div class="c">${cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>'}<span class="n">${name(i)}</span></div>`;
}).join('') + '</div>';

// The mover's pieces are +1: colour each value by the piece it stands for.
const mover = s.to_move, other = mover === 'White' ? 'Red' : 'White';
const num = v => (v === 0 ? '0' : Number.isInteger(v) ? (v > 0 ? '+1' : '−1') : v.toFixed(2).replace('.', ','));
const cls = v => (v === 1 ? L[mover] : v === -1 ? L[other] : v === 0 ? 'z' : 'h');
const cell = (v, extra = '') => `<div class="v ${cls(v)} ${extra}">${num(v)}</div>`;
let rows = '';
for (let c = 0; c < 9; c++) {
  const r = x.slice(c * 14, c * 14 + 14);
  rows += `<div class="nm">${name(c)}</div>${r.slice(0, 12).map(v => cell(v)).join('')}<div class="gap"></div>${cell(r[12])}${cell(r[13])}`;
}

const moverFr = mover === 'White' ? 'Blancs' : 'Rouges', otherFr = mover === 'White' ? 'Rouges' : 'Blancs';
const css = fs.readFileSync(new URL('board.css', import.meta.url), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
.sheet{padding:30px 36px;background:var(--page);width:max-content;color:var(--paper);display:flex;align-items:center;gap:26px}
.b{zoom:.75}
.arrow{font-size:40px;color:var(--paper3)}
.t{display:grid;grid-template-columns:34px repeat(12,40px) 14px 62px 62px;gap:5px;align-items:center}
.hd{font-size:13px;color:var(--paper3);text-align:center;align-self:end;padding-bottom:2px}
.nm{font-size:15px;color:var(--paper3);text-align:right;padding-right:6px}
.v{height:34px;border-radius:5px;display:flex;align-items:center;justify-content:center;font:600 14px system-ui,-apple-system,sans-serif}
.v.R{background:var(--rf);color:#fff}
.v.W{background:var(--wf);color:var(--paper);box-shadow:inset 0 0 0 1px var(--hair)}
.v.z{color:var(--paper3);font-weight:400;opacity:.6;box-shadow:inset 0 0 0 1px var(--ink)}
.v.h{background:var(--ink);color:var(--paper)}
.rep{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:14px;color:var(--paper3)}
.rep .v{width:40px}
.key{font-size:14px;color:var(--paper3);margin-bottom:12px}
</style></head><body><div class="sheet">
<div class="b">${board(s)}</div><div class="arrow">→</div>
<div>
<div class="key">Aux ${moverFr} de jouer : +1 = pièce ${moverFr === 'Rouges' ? 'rouge' : 'blanche'}, −1 = pièce ${otherFr === 'Rouges' ? 'rouge' : 'blanche'}</div>
<div class="t"><div></div><div class="hd" style="grid-column:span 12">pile, du bas vers le haut</div><div></div><div class="hd">sommet</div><div class="hd">hauteur</div>${rows}</div>
<div class="rep"><span style="width:34px"></span>${cell(x[126])}<span>nombre de fois où la position est déjà apparue, ÷ 2</span></div>
</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
await page.locator('.sheet').screenshot({ path: out });
await browser.close();
console.log('mover', mover, 'inputs', x.length);
