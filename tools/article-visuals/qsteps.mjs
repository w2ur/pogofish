// Tabular Q-learning, one update at a time, on a real endgame: the line A -> B -> C_k -> win,
// with a small notebook (A, B and the C positions) and the computation of each update, using the
// rule of crates/search/src/qtab.rs (V(s) += alpha * (max_a Q(s,a) - V(s)); Q = +-1 if the move
// ends the game, else -V(next)). No exploration: every side plays its best Q, ties to the first
// move in engine order, except at A where White is assumed to play LINE's first move.
//
//   node qsteps.mjs OUT 'PREFIX_JSON' 'FIRST_MOVE_JSON' GAMES
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, prefixJ, firstJ, gamesS] = process.argv.slice(2);
const ALPHA = 0.1, RULES = { LC1: { repetitions: 2 } };
const L = { White: 'W', Red: 'R' };
const NAME = { White: 'Blancs', Red: 'Rouges' };
const mv = ([a, n, b]) => ({ from_cell: a, num_pieces: n, to_cell: b });
const same = (m, x) => m.from_cell === x.from_cell && m.num_pieces === x.num_pieces && m.to_cell === x.to_cell;

let A = w.initial_state();
for (const m of JSON.parse(prefixJ)) A = w.apply_move(A, mv(m));
const first = mv(JSON.parse(firstJ));
if (!w.legal_moves(A).some(m => same(m, first))) { console.error('first move is illegal at A'); process.exit(1); }
const B = w.apply_move(A, first);
const Cs = w.legal_moves(B).map(m => ({ m, s: w.apply_move(B, m) }));
for (const c of Cs) if (!w.legal_moves(c.s).some(m => w.is_terminal(w.apply_move(c.s, m), RULES))) { console.error('a C position has no immediate win'); process.exit(1); }

const key = s => w.state_key({ ...s, history: [] });
const V = new Map();
const v = s => V.get(key(s)) ?? 0;
const label = new Map([[key(A), 'A'], [key(B), 'B'], ...Cs.map((c, i) => [key(c.s), `C${i + 1}`])]);
const nameOf = s => label.get(key(s)) ?? 'inconnue';
const rows = ['A', 'B', ...Cs.map((_, i) => `C${i + 1}`)];
const stateOf = { A, B, ...Object.fromEntries(Cs.map((c, i) => [`C${i + 1}`, c.s])) };

const nb = x => { const a = Math.abs(x); const t = a !== 0 && a < 0.01 ? a.toFixed(3) : a.toFixed(2); return (x < 0 && a >= 0.0005 ? '−' : '') + t.replace('.', ','); };
const sg = x => (x > 0.0005 ? '+' : '') + nb(x);

// One update at s; returns the move played and the explanation.
function step(s, forced) {
  const me = NAME[s.to_move];
  const cands = w.legal_moves(s).map(m => {
    const next = w.apply_move(s, m);
    if (w.is_terminal(next, RULES)) return { m, next, q: w.winner_with_rules(next, RULES) === L[s.to_move] ? 1 : -1, end: true };
    return { m, next, q: -v(next), end: false };
  });
  const best = Math.max(...cands.map(c => c.q));
  const old = v(s);
  const nu = old + ALPHA * (best - old);
  V.set(key(s), nu);
  const pick = forced ? cands.find(c => same(c.m, forced)) : cands.find(c => c.q === best);
  const n = nameOf(s);
  let how;
  if (cands.some(c => c.end && c.q === 1)) how = `Un coup gagne sur-le-champ : il vaut +1.`;
  else {
    const known = cands.filter(c => label.has(key(c.next)));
    const unknown = cands.length - known.length;
    how = 'Coups : ' + known.map(c => `vers ${nameOf(c.next)}, ${sg(c.q)}`).join(' ; ')
      + (unknown ? `${known.length ? ' ; ' : ''}${unknown} autre${unknown > 1 ? 's' : ''}, vers des positions jamais vues, 0` : '') + '.';
  }
  const par = x => (x < -0.0005 ? `(${nb(x)})` : nb(x));
  const calc = `Note de ${n} : ${nb(old)} + 10 % × (${nb(best)} − ${par(old)}) = <b>${nb(nu)}</b>`;
  return { pick, text: `En <b>${n}</b>, ${me} au trait. ${how} Meilleur coup pour les ${me} : ${sg(best)}.`, calc, changed: n };
}

const frames = [];
const snap = () => Object.fromEntries(rows.map(r => [r, v(stateOf[r])]));
frames.push({ g: 0, line: [A], at: -1, text: 'Le carnet est vierge : toutes les notes valent 0.', calc: '', notes: snap(), changed: null });
for (let g = 1; g <= Number(gamesS); g++) {
  let s = A; const line = [A]; const played = [];
  for (let ply = 0; ; ply++) {
    const r = step(s, ply === 0 ? first : null);
    played.push(r.pick.m);
    frames.push({ g, line: [...line], played: [...played], at: line.length - 1, text: r.text, calc: r.calc, notes: snap(), changed: r.changed });
    s = r.pick.next; line.push(s);
    if (r.pick.end) {
      frames.push({ g, line: [...line], played: [...played], at: line.length - 1, text: `<b>${NAME[s.to_move === 'White' ? 'Red' : 'White']} gagnent.</b> Partie suivante, depuis A.`, calc: '', notes: snap(), changed: null, end: true });
      break;
    }
  }
}

const css = fs.readFileSync(new URL('./board.css', import.meta.url), 'utf8') + `
.all{background:var(--page);width:1800px;padding:18px 22px 22px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;color:var(--paper)}
.hd{font-size:22px;font-weight:650;margin:0 4px 6px}
.line{display:flex;align-items:flex-start;gap:4px;height:470px}
.slot{width:409px}.slot.cur .g{outline:5px solid var(--acc);outline-offset:-2px;border-radius:6px}
.tag{font-size:20px;font-weight:650;text-align:center;height:28px}
.arr{font-size:34px;color:var(--paper3);padding-top:200px;width:24px;text-align:center}
.txt{font-size:20px;line-height:1.45;height:62px;margin:6px 4px 0}
.calc{font-size:21px;height:32px;margin:0 4px 10px;font-variant-numeric:tabular-nums}
table{border-collapse:collapse;font-size:20px;font-variant-numeric:tabular-nums}
td{padding:5px 22px 5px 10px;border-bottom:1px solid var(--ink)}
td.nm{font-weight:650}td.v{text-align:right;min-width:80px}
tr.on td{background:var(--ink);font-weight:700}
.ttl{font-size:18px;font-weight:600;color:var(--paper3);margin:0 4px 6px}`;
function board(s, mark) {
  return '<div class="g">' + s.cells.map((cell, i) => {
    const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
    const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mark && mark.from_cell === i && k < mark.num_pieces ? 'mv' : ''}"></div>`).join('');
    return `<div class="c ${mark && mark.from_cell === i ? 'sel' : ''}">${cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>'}${mark && mark.to_cell === i ? '<div class="dot"></div>' : ''}</div>`;
  }).join('') + '</div>';
}
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1.5 });
for (const [i, f] of frames.entries()) {
  const slots = f.line.map((s, j) => `${j ? '<div class="arr">→</div>' : ''}<div class="slot ${j === f.at && !f.end ? 'cur' : ''}"><div class="tag">${f.end && j === f.line.length - 1 ? 'fin' : nameOf(s)}</div>${board(s, f.played && f.played[j])}</div>`).join('');
  const table = '<table>' + rows.map(r => `<tr class="${r === f.changed ? 'on' : ''}"><td class="nm">${r}</td><td class="v">${nb(f.notes[r])}</td></tr>`).join('') + '</table>';
  const html = `<div class="all"><div class="hd">${f.g ? `Partie ${f.g}` : 'Avant la première partie'}</div><div class="line">${slots}</div><div class="txt">${f.text}</div><div class="calc">${f.calc || '&nbsp;'}</div><div class="ttl">Le carnet (note pour le joueur au trait)</div>${table}</div>`;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="margin:0">${html}</body></html>`);
  await page.locator('.all').screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.png` });
  console.log(f.g, f.changed ?? '-', rows.map(r => `${r}=${nb(f.notes[r])}`).join(' '));
}
await browser.close();
console.log(frames.length, 'frames');
