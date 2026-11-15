// The AlphaZero net drawn for the article: a position goes in, a shared trunk, then two heads,
// one preference per move (policy) and one score (value). Layer sizes are read from the header of
// a real exported net (.pfw), so the drawing cannot drift from the measured one; only a sample of
// each layer's neurons is drawn. Text is limited to the layer sizes and the two heads' names.
//   node aznetwork.mjs OUT.png NET.pfw [MOVES_JSON]
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, netPath, movesJ = '[[2,1,1],[7,2,1],[0,1,1]]'] = process.argv.slice(2);
const raw = fs.readFileSync(netPath);
const nl1 = raw.indexOf(10), nl2 = raw.indexOf(10, nl1 + 1);
const header = JSON.parse(raw.subarray(nl1 + 1, nl2).toString());
const by = Object.fromEntries(header.layers.map(l => [l.name, l]));
for (const n of ['trunk_0', 'trunk_1', 'policy_fc1', 'policy_fc2', 'value_fc1', 'value_fc2'])
  if (!by[n]) throw new Error(`missing layer ${n} in ${netPath}`);
const size = {
  in: by.trunk_0.inputs, t0: by.trunk_0.outputs, t1: by.trunk_1.outputs,
  p1: by.policy_fc1.outputs, p2: by.policy_fc2.outputs, v1: by.value_fc1.outputs, v2: by.value_fc2.outputs,
};
const params = header.layers.reduce((a, l) => a + l.inputs * l.outputs + l.outputs, 0);

let s = w.initial_state();
for (const [a, n, b] of JSON.parse(movesJ)) s = w.apply_move(s, { from_cell: a, num_pieces: n, to_cell: b });
const L = { White: 'W', Red: 'R' };
const board = st => '<div class="g">' + st.cells.map(cell => {
  const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
  const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''}"></div>`).join('');
  return `<div class="c">${cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>'}</div>`;
}).join('') + '</div>';

// Columns: x, sampled node count, vertical band [y0, y1], label.
const W = 1000, H = 560;
const col = (x, n, y0, y1, label, out = false) => ({ x, n, y0, y1, label, out });
const inp = col(50, 12, 40, 500, `${size.in} entrées`);
const t0 = col(230, 11, 50, 490, `${size.t0} neurones`);
const t1 = col(400, 9, 80, 460, `${size.t1} neurones`);
const p1 = col(580, 6, 20, 220, `${size.p1}`);
const p2 = col(760, 8, 10, 230, `${size.p2} préférences, une par coup`, true);
const v1 = col(580, 6, 320, 520, `${size.v1}`);
const v2 = col(760, 1, 420, 420, 'la note', true);
const ys = c => Array.from({ length: c.n }, (_, i) => (c.n === 1 ? c.y0 : c.y0 + (i * (c.y1 - c.y0)) / (c.n - 1)));
let svg = '';
const edges = (a, b) => { for (const y1 of ys(a)) for (const y2 of ys(b)) svg += `<line x1="${a.x}" y1="${y1}" x2="${b.x}" y2="${y2}" stroke="var(--hair)" stroke-width="0.6" opacity="0.5"/>`; };
[[inp, t0], [t0, t1], [t1, p1], [p1, p2], [t1, v1], [v1, v2]].forEach(([a, b]) => edges(a, b));
// Policy outputs as bars of uneven length: a preference per move (illustrative lengths, no data).
const bars = [0.15, 0.05, 0.6, 0.1, 0.3, 0.85, 0.2, 0.05];
for (const c of [inp, t0, t1, p1, p2, v1, v2]) {
  const pts = ys(c);
  pts.forEach((y, i) => {
    if (c === v2) svg += `<circle cx="${c.x}" cy="${y}" r="14" fill="var(--rf)" stroke="var(--paper)" stroke-width="1.6"/>`;
    else if (c === p2) {
      svg += `<circle cx="${c.x}" cy="${y}" r="7" fill="var(--page)" stroke="var(--paper)" stroke-width="1.6"/>`;
      svg += `<rect x="${c.x + 14}" y="${y - 5}" width="${Math.round(90 * bars[i])}" height="10" rx="2" fill="var(--rf)" opacity="0.85"/>`;
    } else svg += `<circle cx="${c.x}" cy="${y}" r="7" fill="var(--page)" stroke="var(--paper)" stroke-width="1.6"/>`;
  });
  if (c.n > 1) {
    const mid = (pts[Math.floor(c.n / 2) - 1] + pts[Math.floor(c.n / 2)]) / 2;
    svg += `<rect x="${c.x - 10}" y="${mid - 6}" width="20" height="12" fill="var(--page)"/>`;
    for (const d of [-4, 0, 4]) svg += `<circle cx="${c.x}" cy="${mid + d}" r="1.5" fill="var(--paper3)"/>`;
  }
}
const lbl = (x, y, t, anchor = 'middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="lbl">${t}</text>`;
svg += lbl(inp.x, H - 6, inp.label) + lbl(t0.x, H - 6, t0.label) + lbl(t1.x, H - 6, t1.label);
svg += lbl(p1.x, p1.y1 + 26, p1.label) + lbl(v1.x, v1.y1 + 26, v1.label);
svg += lbl(p2.x + 6, p2.y1 + 30, p2.label, 'start') + lbl(v2.x + 24, v2.y0 + 5, v2.label, 'start');

const css = fs.readFileSync(new URL('board.css', import.meta.url), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
.sheet{padding:30px 36px;background:var(--page);width:max-content;color:var(--paper);display:flex;align-items:center;gap:18px}
.b{zoom:.62}.arrow{font-size:40px;color:var(--paper3)}
.lbl{font:600 15px system-ui,-apple-system,sans-serif;fill:var(--paper)}
</style></head><body><div class="sheet"><div class="b">${board(s)}</div><div class="arrow">→</div>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg></div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
await page.locator('.sheet').screenshot({ path: out });
await browser.close();
console.log(JSON.stringify(size), 'params', params);
