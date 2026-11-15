// What the TD(λ) value net is, drawn for the article: a position goes in, a score comes out.
// The layer sizes are the measured net's (rounds 4 and 5: mover-relative-repetition features,
// 9 × 14 + 1 = 127 inputs, hidden 128 and 64, one tanh output); only a sample of each layer's
// neurons is drawn, and the caption says so.
// Usage: node network.mjs OUT.png [MOVES_JSON] [--bare]   (MOVES_JSON: moves from the start; --bare: no text)
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const args = process.argv.slice(2);
const bare = args.includes('--bare'); // no text at all: the article's prose carries it
const [out, movesJ = '[[2,1,1],[7,2,1],[0,1,1]]'] = args.filter(a => a !== '--bare');
let s = w.initial_state();
for (const [a, n, b] of JSON.parse(movesJ)) s = w.apply_move(s, { from_cell: a, num_pieces: n, to_cell: b });

const INPUTS = 9 * 14 + 1, HIDDEN = [128, 64];
const params = [INPUTS, ...HIDDEN, 1].reduce((acc, n, i, a) => (i ? acc + a[i - 1] * n + n : 0), 0);
const fmt = n => n.toLocaleString('fr-FR').replace(/[  ]/g, ' ');

const L = { White: 'W', Red: 'R' };
const board = st => '<div class="g">' + st.cells.map(cell => {
  const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
  const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''}"></div>`).join('');
  return `<div class="c">${cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>'}</div>`;
}).join('') + '</div>';

// Network as SVG: sampled neurons per layer, every edge between drawn neighbours.
const W = 760, H = 470, top = 40, bot = H - 40;
const layers = [
  { n: 12, x: 60, label: `${INPUTS} entrées`, sub: 'la position en nombres' },
  { n: 10, x: 290, label: `${HIDDEN[0]} neurones`, sub: '' },
  { n: 8, x: 500, label: `${HIDDEN[1]} neurones`, sub: '' },
  { n: 1, x: 690, label: '1 sortie', sub: 'la note, de −1 à +1' },
];
const ys = l => Array.from({ length: l.n }, (_, i) => l.n === 1 ? (top + bot) / 2 : top + (i * (bot - top)) / (l.n - 1));
let svg = '';
for (let i = 0; i + 1 < layers.length; i++) {
  const a = layers[i], b = layers[i + 1];
  for (const y1 of ys(a)) for (const y2 of ys(b))
    svg += `<line x1="${a.x}" y1="${y1}" x2="${b.x}" y2="${y2}" stroke="var(--hair)" stroke-width="0.6" opacity="0.55"/>`;
}
for (const l of layers) {
  const pts = ys(l);
  for (const y of pts) svg += `<circle cx="${l.x}" cy="${y}" r="${l.n === 1 ? 14 : 8}" fill="${l.n === 1 ? 'var(--rf)' : 'var(--page)'}" stroke="var(--paper)" stroke-width="1.6"/>`;
  if (l.n > 1) { // a gap with dots in the middle of each sampled column
    const mid = (pts[Math.floor(l.n / 2) - 1] + pts[Math.floor(l.n / 2)]) / 2;
    svg += `<rect x="${l.x - 11}" y="${mid - 9}" width="22" height="18" fill="var(--page)"/>`;
    for (const d of [-5, 0, 5]) svg += `<circle cx="${l.x}" cy="${mid + d}" r="1.8" fill="var(--paper3)"/>`;
  }
  if (bare) continue;
  svg += `<text x="${l.x}" y="${H - 8}" text-anchor="middle" class="lbl">${l.label}</text>`;
  if (l.sub) svg += `<text x="${l.x}" y="${l.n === 1 ? (top + bot) / 2 + 40 : 18}" text-anchor="middle" class="sub">${l.sub}</text>`;
}

const css = fs.readFileSync(new URL('board.css', import.meta.url), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
.sheet{padding:30px 36px;background:var(--page);width:max-content;color:var(--paper)}
h1{font-size:28px;font-weight:700;margin:0 0 6px}
.lead{font-size:17px;color:var(--paper3);margin:0 0 22px;max-width:1120px;line-height:1.4}
.row{display:flex;align-items:center;gap:18px}
.b{zoom:.62}
.arrow{font-size:40px;color:var(--paper3)}
.lbl{font:600 15px system-ui,-apple-system,sans-serif;fill:var(--paper)}
.sub{font:14px system-ui,-apple-system,sans-serif;fill:var(--paper3)}
.foot{font-size:14px;color:var(--paper3);margin-top:16px;max-width:1120px;line-height:1.45}
</style></head><body><div class="sheet">
${bare ? '' : `<h1>Un réseau de neurones qui note une position</h1>
<p class="lead">La position est traduite en ${INPUTS} nombres (pour chaque case, à qui appartient chaque pièce de la pile, qui est au sommet, la hauteur ; et combien de fois la position est déjà apparue). Chaque neurone fait une somme pondérée des nombres de la couche précédente, la passe dans une fonction simple, et transmet le résultat. Au bout : une note, de −1 (perdu) à +1 (gagné). Apprendre, c’est ajuster les poids, un peu après chaque partie.</p>`}
<div class="row"><div class="b">${board(s)}</div><div class="arrow">→</div>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg></div>
${bare ? '' : `<p class="foot">Le réseau TD(λ) de l’article : ${INPUTS} entrées, deux couches de ${HIDDEN[0]} et ${HIDDEN[1]} neurones, une sortie, soit ${fmt(params)} poids réglables. Seule une partie des neurones et des liaisons est dessinée.</p>`}
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
await page.locator('.sheet').screenshot({ path: out });
await browser.close();
console.log('inputs', INPUTS, 'params', params);
