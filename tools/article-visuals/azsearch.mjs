// AlphaZero's search on one puzzle, simulation by simulation, for the article.
// A JavaScript port of crates/infer/src/mcts.rs (PUCT, c = 1.5, no root noise, a new leaf is
// evaluated by the net, a terminal position by its exact result, a position met again on the
// path is a leaf) and of the AlphaZero MLP forward pass of crates/infer/src/mlp.rs, reading a
// real .pfw. Control: the final visits must equal those the Rust bench (`v5puzzles`) wrote for
// the same net and puzzle, else the script refuses to draw.
//
//   node azsearch.mjs OUT NET.pfw PUZZLES_JSON PUZZLE_NUMBER [SIMS]
//   (PUZZLES_JSON: v5puzzles' --out for net:NET.pfw)
//   gifski --fps 1 --width 1400 -o out.gif OUT/f*.png
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, netPath, puzzlesPath, puzzleN, simsS = '100'] = process.argv.slice(2);
const SIMS = Number(simsS), C_PUCT = 1.5, RULES = { LC1: { repetitions: 2 } };
const f = Math.fround;

// --- the net (PFW: magic line, JSON header line, little-endian f32 weights then biases) ---
const raw = fs.readFileSync(netPath);
const nl1 = raw.indexOf(10), nl2 = raw.indexOf(10, nl1 + 1);
const header = JSON.parse(raw.subarray(nl1 + 1, nl2).toString());
if (header.features !== 'mover-relative-repetition') throw new Error(`unexpected features ${header.features}`);
const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
let off = nl2 + 1;
const L = {};
for (const s of header.layers) {
  const n = s.inputs * s.outputs + s.outputs, v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = dv.getFloat32(off + 4 * i, true);
  off += 4 * n;
  L[s.name] = { ...s, W: v.subarray(0, s.inputs * s.outputs), B: v.subarray(s.inputs * s.outputs) };
}
if (off !== raw.length) throw new Error('trailing bytes after the last layer');
const lin = (l, x) => { const o = new Float32Array(l.outputs); for (let j = 0; j < l.outputs; j++) { let z = l.B[j]; for (let i = 0; i < l.inputs; i++) z = f(z + f(l.W[j * l.inputs + i] * x[i])); o[j] = z; } return o; };
const relu = x => x.map(v => Math.max(0, v));
const trunk = Object.keys(L).filter(k => k.startsWith('trunk_')).sort();
let evals = 0;
function evaluate(state, moves) {
  evals++;
  let h = Float32Array.from(w.encode_features(state, 'mover-relative-repetition'));
  for (const k of trunk) h = relu(lin(L[k], h));
  const logits = lin(L.policy_fc2, relu(lin(L.policy_fc1, h)));
  const value = f(Math.tanh(lin(L.value_fc2, relu(lin(L.value_fc1, h)))[0]));
  const picked = moves.map(m => logits[m.from_cell * 27 + (m.num_pieces - 1) * 9 + m.to_cell]);
  const max = Math.max(...picked);
  const exp = picked.map(l => f(Math.exp(f(l - max))));
  const total = exp.reduce((a, b) => f(a + b), 0);
  return { priors: exp.map(e => f(e / total)), value };
}

// --- the search (mcts.rs) ---
const keyOf = s => w.state_key(s) + '|' + s.history.map(k => k.map(b => b.toString(16).padStart(2, '0')).join('')).sort().join(',');
const nodes = new Map();
function expandIfNeeded(state) {
  const key = keyOf(state);
  if (nodes.has(key)) return null;
  const moves = w.legal_moves(state);
  if (!moves.length) return null;
  const { priors, value } = evaluate(state, moves);
  nodes.set(key, { edges: moves.map((mv, i) => ({ mv, visits: 0, sum: 0, prior: priors[i] })) });
  return value;
}
function simulate(state, path) {
  if (w.is_terminal(state, RULES)) return w.winner_with_rules(state, RULES) === (state.to_move === 'White' ? 'W' : 'R') ? 1 : -1;
  const key = keyOf(state);
  const revisit = path.has(key); path.add(key);
  if (revisit || !nodes.has(key)) { const v = expandIfNeeded(state); return v ?? evaluate(state, w.legal_moves(state)).value; }
  const node = nodes.get(key);
  const total = node.edges.reduce((a, e) => a + e.visits, 0);
  const sq = f(Math.sqrt(total + 1));
  let best = -Infinity, bi = 0;
  node.edges.forEach((e, i) => {
    const q = e.visits === 0 ? 0 : f(e.sum / e.visits);
    const score = f(q + f(f(f(C_PUCT * e.prior) * sq) / (1 + e.visits)));
    if (score > best) { best = score; bi = i; }
  });
  const e = node.edges[bi];
  const v = f(-simulate(w.apply_move(state, e.mv), path));
  e.visits += 1; e.sum = f(e.sum + v);
  return v;
}

// --- the puzzle, from its diagram (left = bottom of the stack), no history ---
const pz = JSON.parse(fs.readFileSync(puzzlesPath, 'utf8')).puzzle_list[Number(puzzleN) - 1];
const rows = pz.diagram.split('\n').slice(0, 3).map(r => r.trim().split(/\s+/).slice(1));
const cells = [];
for (const r of rows) for (const c of r) cells.push(c === '.' ? [] : [...c].map(ch => (ch === 'W' ? 'White' : 'Red')));
const root = { cells, to_move: /White to move/.test(pz.diagram) ? 'White' : 'Red', move_count: 0, history: [] };
const name = i => 'abc'[i % 3] + (Math.floor(i / 3) + 1);
const mname = m => `${name(m.from_cell)}-${m.num_pieces}-${name(m.to_cell)}`;
const rootMoves = w.legal_moves(root).map(mname);
if (rootMoves.join() !== pz.moves.join()) throw new Error('root moves differ from the bench file');

const STOPS = [1, 2, 3, 5, 10, 20, 50, SIMS];
const snaps = [];
expandIfNeeded(root);
for (let k = 1; k <= SIMS; k++) {
  simulate(root, new Set());
  if (STOPS.includes(k)) snaps.push({ k, positions: nodes.size, edges: nodes.get(keyOf(root)).edges.map(e => ({ ...e })) });
}
const final = snaps.at(-1).edges.map(e => e.visits);
if (final.join() !== pz.visits.join()) throw new Error(`visits differ from the Rust bench:\n js   ${final}\n rust ${pz.visits}`);
const priorsJs = snaps.at(-1).edges.map(e => e.prior);
if (priorsJs.some((p, i) => Math.abs(p - pz.prior[i]) > 1e-5)) throw new Error('priors differ from the Rust bench');

// --- frames ---
const LC = { White: 'W', Red: 'R' };
const keyIdx = pz.moves.indexOf(pz.key_move);
const mover = root.to_move === 'White' ? 'Blancs' : 'Rouges';
const board = st => '<div class="g">' + st.cells.map((cell, i) => {
  const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
  const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${LC[p]} ${k > 0 ? 'low' : ''}"></div>`).join('');
  return `<div class="c">${cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>'}<span class="n">${name(i)}</span></div>`;
}).join('') + '</div>';
const pct = x => Math.round(100 * x) + ' %';
const fr = x => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(2).replace('.', ',');
const css = fs.readFileSync(new URL('board.css', import.meta.url), 'utf8');
function page(snap, caption, reveal) {
  const order = pz.moves.map((_, i) => i).sort((a, b) => pz.prior[b] - pz.prior[a]);
  const top = Math.max(...snap.edges.map(e => e.visits), 1);
  const rowsH = order.map(i => {
    const e = snap.edges[i], key = i === keyIdx && reveal;
    return `<div class="mv ${key ? 'key' : ''}">${pz.moves[i]}${key ? ' ✓' : ''}</div>
      <div class="bar"><div class="pr" style="width:${Math.max(1, 100 * e.prior * 1.6)}%"></div><span>${pct(e.prior)}</span></div>
      <div class="bar"><div class="vi" style="width:${(100 * e.visits) / Math.max(top, snap.k)}%"></div><span>${e.visits}</span></div>
      <div class="q">${e.visits ? fr(e.sum / e.visits) : ''}</div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  .sheet{padding:26px 32px;background:var(--page);width:max-content;color:var(--paper)}
  h1{font-size:24px;font-weight:700;margin:0 0 4px}.lead{font-size:15px;color:var(--paper3);margin:0 0 16px;max-width:1260px}
  .row{display:flex;gap:30px;align-items:flex-start}.b{zoom:.62}
  .t{display:grid;grid-template-columns:90px 330px 330px 70px;gap:6px 14px;align-items:center}
  .hd{font-size:14px;color:var(--paper3)}
  .mv{font:600 15px system-ui,-apple-system,sans-serif}.mv.key{color:var(--rf)}
  .bar{position:relative;height:20px;display:flex;align-items:center}
  .bar>div{height:16px;border-radius:3px}.pr{background:var(--hair);opacity:.55}.vi{background:var(--rf)}
  .bar span{margin-left:8px;font-size:14px;font-variant-numeric:tabular-nums}
  .q{font-size:14px;color:var(--paper3);font-variant-numeric:tabular-nums}
  .big{font-size:20px;font-weight:650;margin:2px 0 6px}.cap{font-size:17px;margin-top:14px;max-width:1260px}
  </style></head><body><div class="sheet">
  <h1>La recherche d’AlphaZero, simulation par simulation</h1>
  <div class="lead">Aux ${mover} de jouer. Un seul coup gagne, ${pz.key_move}, en ${pz.win_in_plies} coups. Chaque simulation suit une piste jusqu’à une position nouvelle, la fait noter par le réseau, et rapporte la note au coup de départ.</div>
  <div class="row"><div><div class="b">${board(root)}</div></div>
  <div><div class="big">${snap.k} simulation${snap.k > 1 ? 's' : ''} · ${snap.positions} positions notées par le réseau</div>
  <div class="t"><div class="hd">coup</div><div class="hd">préférence du réseau</div><div class="hd">passages</div><div class="hd">note moyenne</div>${rowsH}</div></div></div>
  <div class="cap">${caption}</div></div></body></html>`;
}
const pages = snaps.map((s, i) => [page(s, i === 0 ? 'La première piste suit le coup que le réseau préfère.' : i < snaps.length - 1 ? 'Les pistes vont vers les coups préférés, puis vers ceux dont la note moyenne est la meilleure.' : `Après ${SIMS} simulations, il joue le coup le plus visité : ${pz.key_move}, celui qui gagne, que le réseau seul ne préférait pas.`, i === snaps.length - 1), i === 0 ? 3 : i === snaps.length - 1 ? 6 : 2]);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const pg = await browser.newPage({ deviceScaleFactor: 2 });
let n = 0;
for (const [html, hold] of pages) {
  await pg.setContent(html);
  const png = await pg.locator('.sheet').screenshot();
  for (let i = 0; i < hold; i++) fs.writeFileSync(`${out}/f${String(n++).padStart(3, '0')}.png`, png);
}
await browser.close();
console.log('visits', final.join(' '), '| matches the Rust bench | net evaluations', evals);
