// TD(λ) targets for one game, computed backwards one position per frame, for the article.
// The net is a real TD checkpoint exported to .pfv (export_td); its forward pass is ported here
// from crates/infer/src/value.rs (ReLU hidden layers, tanh output). Targets follow
// crates/train/src/td.rs `lambda_returns` (λ = 0.7), computed in the mover's view as there and
// shown from White's view, where they reduce to: target_k = 0.7 × target_{k+1} + 0.3 × note_{k+1}.
// The script refuses to draw if the two computations disagree.
//
//   node tdsteps.mjs OUT NET.pfv 'MOVES_JSON' GAMES_LABEL
//   gifski --fps 1 --width 1400 -o out.gif OUT/f*.png
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, netPath, movesJ, gamesLabel] = process.argv.slice(2);
const LAMBDA = 0.7, RULES = { LC1: { repetitions: 2 } };

function loadPfv(path) {
  const b = fs.readFileSync(path);
  if (b.subarray(0, 5).toString() !== 'PFV1\n') throw new Error('not a PFV1 file');
  const nl = b.indexOf(10, 5);
  const header = JSON.parse(b.subarray(5, nl).toString());
  if (header.features !== 'mover-relative-repetition') throw new Error(`unexpected features ${header.features}`);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let off = nl + 1;
  const layers = header.layers.map(s => {
    const n = s.inputs * s.outputs + s.outputs, v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = dv.getFloat32(off + 4 * i, true);
    off += 4 * n;
    return { ...s, W: v.subarray(0, s.inputs * s.outputs), B: v.subarray(s.inputs * s.outputs) };
  });
  if (off !== b.length) throw new Error('trailing bytes after the last layer');
  return layers;
}
const layers = loadPfv(netPath);
const value = s => { // V(s) for the player to move
  let a = Array.from(w.encode_features(s, 'mover-relative-repetition'));
  layers.forEach((l, k) => {
    const o = new Array(l.outputs);
    for (let j = 0; j < l.outputs; j++) {
      let z = l.B[j];
      for (let i = 0; i < l.inputs; i++) z += l.W[j * l.inputs + i] * a[i];
      o[j] = k < layers.length - 1 ? Math.max(0, z) : Math.tanh(z);
    }
    a = o;
  });
  return a[0];
};

const states = [w.initial_state()];
for (const [a, n, b] of JSON.parse(movesJ)) states.push(w.apply_move(states.at(-1), { from_cell: a, num_pieces: n, to_cell: b }));
const last = states.at(-1);
if (!w.is_terminal(last, RULES)) throw new Error('the line must end the game');
const winner = w.winner_with_rules(last, RULES); // 'W' or 'R'
const T = states.length - 1;
const toWhite = (s, v) => (s.to_move === 'White' ? v : -v);

// As td.rs: values V(s_0..s_T), V(s_T) = exact outcome for the mover; G_t = −[(1−λ)V_{t+1} + λG_{t+1}].
const vals = states.map((s, t) => (t === T ? ((winner === 'W') === (s.to_move === 'White') ? 1 : -1) : value(s)));
const g = new Array(T); let next = vals[T];
for (let t = T - 1; t >= 0; t--) { g[t] = -((1 - LAMBDA) * vals[t + 1] + LAMBDA * next); next = g[t]; }
const note = states.map((s, t) => toWhite(s, vals[t]));
const target = g.map((x, t) => toWhite(states[t], x));
// Same targets, White's view, as the article states them.
const simple = new Array(T); simple[T - 1] = 0.7 * note[T] + 0.3 * note[T];
for (let t = T - 2; t >= 0; t--) simple[t] = LAMBDA * simple[t + 1] + (1 - LAMBDA) * note[t + 1];
if (simple.some((x, t) => Math.abs(x - target[t]) > 1e-6)) throw new Error('White-view targets disagree with td.rs');

const L = { White: 'W', Red: 'R' };
const fr = (x, d = 2) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d).replace('.', ',');
const board = st => '<div class="g">' + st.cells.map(cell => {
  const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
  const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''}"></div>`).join('');
  return `<div class="c">${cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>'}</div>`;
}).join('') + '</div>';
const css = fs.readFileSync(new URL('board.css', import.meta.url), 'utf8');
const winFr = winner === 'W' ? 'Blancs' : 'Rouges';

// filled: targets known from index `filled` to T−1; cur: the one being computed.
function frame(filled, cur, caption, calc) {
  const cols = states.map((s, t) => {
    const isEnd = t === T;
    const tg = !isEnd && t >= filled ? fr(target[t]) : '';
    const cls = t === cur ? 'col cur' : t === cur + 1 && cur >= 0 ? 'col src' : 'col';
    return `<div class="${cls}"><div class="b">${board(s)}</div>
      <div class="who">${isEnd ? `victoire des ${winFr}` : `aux ${s.to_move === 'White' ? 'Blancs' : 'Rouges'}`}</div>
      <div class="nt">${isEnd ? (winner === 'W' ? '+1' : '−1') : fr(note[t])}</div>
      <div class="tg ${tg ? 'on' : ''}">${tg || '·'}</div></div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  .sheet{padding:26px 30px;background:var(--page);width:max-content;color:var(--paper)}
  h1{font-size:24px;font-weight:700;margin:0 0 4px}
  .lead{font-size:15px;color:var(--paper3);margin:0 0 16px}
  .row{display:flex;gap:8px;align-items:flex-start}
  .lab{display:flex;flex-direction:column;justify-content:flex-end;gap:0;font-size:14px;color:var(--paper3);padding-top:132px;text-align:right;width:92px}
  .lab div{height:34px;display:flex;align-items:center;justify-content:flex-end}
  .col{width:116px;border-radius:8px;padding:6px 0 8px;text-align:center}
  .col.cur{box-shadow:0 0 0 3px var(--rf);background:#efe3d3}
  .col.src{box-shadow:0 0 0 2px var(--hair)}
  .b{zoom:.27;margin:0 auto;width:max-content}
  .who{font-size:12px;color:var(--paper3);height:22px;display:flex;align-items:center;justify-content:center}
  .nt,.tg{height:34px;display:flex;align-items:center;justify-content:center;font:600 17px system-ui,-apple-system,sans-serif}
  .nt{color:var(--paper)}
  .tg{color:var(--paper3);font-weight:400}
  .tg.on{color:var(--rf);font-weight:700}
  .cap{margin-top:16px;font-size:18px;min-height:26px}
  .calc{margin-top:6px;font-size:17px;color:var(--paper3);min-height:24px;font-variant-numeric:tabular-nums}
  </style></head><body><div class="sheet">
  <h1>TD(λ) : la cible remonte la partie</h1>
  <div class="lead">Notes d’un vrai réseau TD après ${gamesLabel} parties d’entraînement, vues des Blancs (+1 : les Blancs gagnent, −1 : les Rouges gagnent).</div>
  <div class="row"><div class="lab"><div>note du réseau</div><div style="color:var(--rf)">cible</div></div>${cols}</div>
  <div class="cap">${caption}</div><div class="calc">${calc || ''}</div>
  </div></body></html>`;
}

fs.mkdirSync(out, { recursive: true });
const pages = [];
pages.push([frame(T, -1, 'Une partie vient de se terminer. Le réseau avait noté chaque position.', ''), 3]);
pages.push([frame(T - 1, T - 1, `Les ${winFr} ont gagné : la cible de la dernière position est le résultat.`, `cible = ${winner === 'W' ? '1' : '−1'}`), 2]);
for (let t = T - 2; t >= 0; t--) {
  pages.push([frame(t, t, 'On remonte : 70 % de la cible suivante, 30 % de la note suivante.',
    `cible = 70 % × ${fr(target[t + 1])} + 30 % × ${fr(note[t + 1])} = <b style="color:var(--rf)">${fr(target[t])}</b>`), 2]);
}
pages.push([frame(0, -1, 'Le réseau est ensuite réglé un peu, pour que chaque note se rapproche de sa cible.', 'Une seule partie a suffi pour que la victoire atteigne la première position.'), 5]);

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
let k = 0;
for (const [html, hold] of pages) {
  await page.setContent(html);
  const png = await page.locator('.sheet').screenshot();
  for (let i = 0; i < hold; i++) fs.writeFileSync(`${out}/f${String(k++).padStart(3, '0')}.png`, png);
}
await browser.close();
console.log('notes', note.map(x => fr(x)).join(' '));
console.log('targets', target.map(x => fr(x)).join(' '));
