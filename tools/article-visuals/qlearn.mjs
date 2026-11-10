// Tabular Q-learning at work, shown on one position: the endgame after PREFIX is replayed
// GAMES times with the learner of crates/search/src/qtab.rs (one value V per position, before
// each move V(s) += alpha * (max_a Q(s,a) - V(s)), Q(s,a) = +-1 if the move ends the game
// under lc1-2, else -V(s'); epsilon-greedy, epsilon linear from 1.0 to 0.05). One frame per
// checkpoint, each showing every move from the position with its learned Q.
//
//   node qlearn.mjs OUT 'PREFIX_JSON' 'VERDICT_JSON' GAMES SEED
// VERDICT_JSON maps "from,n,to" to a short label (the exact value, from pogoq), printed small.
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, prefixJ, verdictJ, gamesS, seedS] = process.argv.slice(2);
const GAMES = Number(gamesS), ALPHA = 0.1, EPS0 = 1.0, EPS1 = 0.05, MAX_PLIES = 200;
const RULES = { LC1: { repetitions: 2 } };
const L = { White: 'W', Red: 'R' };
const verdict = JSON.parse(verdictJ);

function rng(seed) { // mulberry32
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const r = rng(Number(seedS));
const V = new Map();
const key = s => w.state_key({ ...s, history: [] });
const v = s => V.get(key(s)) ?? 0;

let start = w.initial_state();
for (const [a, n, b] of JSON.parse(prefixJ)) start = w.apply_move(start, { from_cell: a, num_pieces: n, to_cell: b });
const startMoves = w.legal_moves(start);
if (startMoves.length !== Object.keys(verdict).length || !startMoves.every(m => verdict[[m.from_cell, m.num_pieces, m.to_cell].join(',')])) {
  console.error('verdicts do not match legal moves', JSON.stringify(startMoves)); process.exit(1);
}

function q(s, m) {
  const next = w.apply_move(s, m);
  if (w.is_terminal(next, RULES)) return { next, q: w.winner_with_rules(next, RULES) === L[s.to_move] ? 1 : -1, end: true };
  return { next, q: -v(next), end: false };
}
function episode(eps) {
  let s = start;
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    const cands = w.legal_moves(s).map(m => ({ m, ...q(s, m) }));
    const best = Math.max(...cands.map(c => c.q));
    V.set(key(s), v(s) + ALPHA * (best - v(s)));
    const pool = r() < eps ? cands : cands.filter(c => c.q === best);
    const pick = pool[Math.floor(r() * pool.length)];
    if (pick.end) return true;
    s = pick.next;
  }
  return false;
}

// Optional LINE_JSON: moves played from the position; the top row shows V along that line,
// every value from the point of view of the side to move at the position.
const line = [start];
for (const [a, n, b] of JSON.parse(process.argv[7] || '[]')) line.push(w.apply_move(line.at(-1), { from_cell: a, num_pieces: n, to_cell: b }));
const pov = s => (s.to_move === start.to_move ? v(s) : -v(s));
const snap = () => startMoves.map(m => q(start, m).q);
const snapLine = () => line.map(pov);
const checkpoints = new Set([0, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, GAMES].filter(n => n <= GAMES));
const frames = [];
for (let g = 0; g <= GAMES; g++) {
  if (checkpoints.has(g)) frames.push({ g, qs: snap(), ls: snapLine() });
  if (g < GAMES) episode(EPS0 + (EPS1 - EPS0) * (g / Math.max(1, GAMES - 1)));
}

const css = fs.readFileSync(new URL('./board.css', import.meta.url), 'utf8') + `
.sheet{display:grid;grid-template-columns:repeat(${startMoves.length + 1},max-content);gap:18px;padding:22px 22px 8px;background:var(--page);width:max-content}
.panel{border-radius:6px;padding:4px}
.v{text-align:center;font-size:30px;font-weight:600;color:var(--paper);height:40px;line-height:40px;font-variant-numeric:tabular-nums}
.bar{position:relative;height:10px;margin:4px 14px 0;background:var(--ink);border-radius:5px}
.bar i{position:absolute;top:0;bottom:0;background:var(--acc);border-radius:5px}
.bar:after{content:'';position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;background:var(--paper3)}
.ex{text-align:center;font-size:15px;color:var(--paper3);height:26px;line-height:26px}
.cap{font-size:20px;color:var(--paper);padding:0 26px 22px;background:var(--page)}
.all{background:var(--page);width:max-content}
.rt{font-size:18px;font-weight:600;color:var(--paper);padding:22px 26px 0}
.line{display:flex;align-items:flex-start;gap:6px;padding:12px 22px 0}
.arr{font-size:34px;color:var(--paper3);padding-top:150px}`;
function board(s, mark) {
  return '<div class="g">' + s.cells.map((cell, i) => {
    const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
    const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mark && mark.from_cell === i && k < mark.num_pieces ? 'mv' : ''}"></div>`).join('');
    const body = cell.length ? `<div class="st">${pcs}</div>${cell.length > 1 ? `<span class="n">${cell.map(p => L[p]).join('')}</span>` : ''}` : '<div class="e"></div>';
    return `<div class="c ${mark && mark.from_cell === i ? 'sel' : ''}">${body}${mark && mark.to_cell === i ? '<div class="dot"></div>' : ''}</div>`;
  }).join('') + '</div>';
}
const fmt = x => (x > 0.0005 ? '+' : x < -0.0005 ? '−' : '') + Math.abs(x).toFixed(2).replace('.', ',');
const bar = x => { const p = Math.abs(x) * 50; return `<div class="bar"><i style="left:${x >= 0 ? 50 : 50 - p}%;width:${p}%"></i></div>`; };
const who = start.to_move === 'White' ? 'Blancs' : 'Rouges';

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const [i, f] of frames.entries()) {
  const panels = [`<div class="panel"><div class="b">${board(start, null)}</div><div class="v" style="font-size:17px">${who} au trait</div><div class="ex">&nbsp;</div></div>`]
    .concat(startMoves.map((m, j) => `<div class="panel"><div class="b">${board(start, m)}</div><div class="v">${fmt(f.qs[j])}</div>${bar(f.qs[j])}<div class="ex">${verdict[[m.from_cell, m.num_pieces, m.to_cell].join(',')]}</div></div>`));
  const toMove = s => (s.to_move === 'White' ? 'Blancs' : 'Rouges');
  const top = line.length > 1 ? `<div class="row"><div class="rt">Le long de la partie gagnante, note pour les ${who} :</div><div class="line">` + line.map((s, j) =>
    `${j ? '<div class="arr">→</div>' : ''}<div class="panel"><div class="b">${board(s, null)}</div><div class="v">${fmt(f.ls[j])}</div>${bar(f.ls[j])}<div class="ex">${toMove(s)} au trait</div></div>`).join('') + '</div></div>' : '';
  const cap = f.g === 0 ? 'Carnet vierge : toutes les notes valent zéro.' : `Après ${f.g.toLocaleString('fr-FR')} partie${f.g > 1 ? 's' : ''} rejouée${f.g > 1 ? 's' : ''} depuis cette position.`;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="all">${top}<div class="rt">Les coups possibles, et la note que le carnet leur donne :</div><div class="sheet">${panels.join('')}</div><div class="cap">${cap}</div></div></body></html>`);
  await page.locator('.all').screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.png` });
  console.log(f.g, f.qs.map(fmt).join(' '));
}
await browser.close();
console.log(frames.length, 'frames,', V.size, 'positions in the notebook');
