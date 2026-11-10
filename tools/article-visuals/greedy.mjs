// The greedy player, shown: games where both sides play greedy, and a sheet of every candidate
// move with the score greedy gives it. Moves come from the real engine (wasm); greedy is a port
// of crates/search/src/players.rs (score = own tops minus the opponent's after the move; a win
// beats everything, a loss is worst; ties broken at random).
//
//   node greedy.mjs OUT search SEEDS            prints one line per seeded game (length, winner)
//   node greedy.mjs OUT game SEED               one PNG per ply in OUT, captioned
//   node greedy.mjs OUT sheet SEED PLY          every move greedy weighs at PLY of that game
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, mode, a1, a2] = process.argv.slice(2);
const RULES = { LC1: { repetitions: 2 } }; // lc1-2: the third occurrence loses for whoever produced it
const MAX_PLIES = 200;
const L = { White: 'W', Red: 'R' };
const NAME = { White: 'Blancs', Red: 'Rouges' };

function rng(seed) { // mulberry32
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const tops = (s, c) => s.cells.filter(x => x.length && x[x.length - 1] === c).length;
const other = c => (c === 'White' ? 'Red' : 'White');

// Every legal move with greedy's score, in engine order.
function weigh(s) {
  const me = s.to_move;
  return w.legal_moves(s).map(m => {
    const next = w.apply_move(s, m);
    const term = w.is_terminal(next, RULES);
    let score, label;
    if (term) {
      const win = w.winner_with_rules(next, RULES) === L[me];
      score = win ? Infinity : -Infinity; label = win ? 'gagne' : 'perd';
    } else {
      score = tops(next, me) - tops(next, other(me)); label = (score > 0 ? '+' : '') + score;
    }
    return { m, next, score, label };
  });
}

function play(seed) {
  const r = rng(seed);
  let s = w.initial_state();
  const plies = [];
  while (plies.length < MAX_PLIES) {
    const cands = weigh(s);
    const best = Math.max(...cands.map(c => c.score));
    const tied = cands.filter(c => c.score === best);
    const pick = tied[Math.floor(r() * tied.length)];
    plies.push({ s, cands, pick, tied: tied.length });
    s = pick.next;
    if (w.is_terminal(s, RULES)) return { plies, end: s, winner: w.winner_with_rules(s, RULES) };
  }
  return { plies, end: s, winner: null };
}

const css = fs.readFileSync(new URL('./board.css', import.meta.url), 'utf8') + `
.wrap{padding:10px 14px 14px;width:max-content;background:var(--page)}
.cap{font-size:17px;color:var(--paper);line-height:1.35;width:405px;height:72px;overflow:hidden;padding:0 14px}
.cap b{font-weight:650}
.sheet{display:grid;grid-template-columns:repeat(4,max-content);gap:22px 18px;padding:22px;background:var(--page);width:max-content}
.panel{border-radius:6px;padding:4px}.panel.best{box-shadow:0 0 0 4px var(--acc)}
.v{text-align:center;font-size:30px;font-weight:600;color:var(--paper);height:42px;line-height:42px}
.panel.best .v{color:var(--acc)}`;

function board(s, mark) {
  return '<div class="g">' + s.cells.map((cell, i) => {
    const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
    const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mark && mark.from_cell === i && k < mark.num_pieces ? 'mv' : ''}"></div>`).join('');
    const body = cell.length ? `<div class="st">${pcs}</div>${cell.length > 1 ? `<span class="n">${cell.map(p => L[p]).join('')}</span>` : ''}` : '<div class="e"></div>';
    return `<div class="c ${mark && mark.from_cell === i ? 'sel' : ''}">${body}${mark && mark.to_cell === i ? '<div class="dot"></div>' : ''}</div>`;
  }).join('') + '</div>';
}
const page = async () => { const b = await chromium.launch(); return [b, await b.newPage({ deviceScaleFactor: 2 })]; };
const shot = async (p, html, sel, path) => { await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`); await p.locator(sel).screenshot({ path }); };
const count = s => `${tops(s, 'White')} sommet${tops(s, 'White') > 1 ? 's' : ''} blanc${tops(s, 'White') > 1 ? 's' : ''}, ${tops(s, 'Red')} rouge${tops(s, 'Red') > 1 ? 's' : ''}`;

if (mode === 'search') {
  const [lo, hi] = a1.split('-').map(Number);
  for (let seed = lo; seed <= hi; seed++) {
    const g = play(seed);
    const firstBlunder = g.plies.findIndex((p, i) => g.plies[i + 1] && g.plies[i + 1].pick.label === 'gagne' && p.pick.label !== 'gagne');
    console.log(`seed ${seed}: ${g.plies.length} plies, winner ${g.winner}, last move by ${NAME[g.plies.at(-1).s.to_move]}, blunder at ply ${firstBlunder}`);
  }
} else if (mode === 'moves') {
  console.log(JSON.stringify(play(Number(a1)).plies.map(p => [p.pick.m.from_cell, p.pick.m.num_pieces, p.pick.m.to_cell])));
} else if (mode === 'game') {
  const g = play(Number(a1));
  const [b, p] = await page();
  let n = 0;
  const f = () => `${out}/f${String(n++).padStart(3, '0')}.png`;
  await shot(p, `<div class="wrap">${board(g.plies[0].s, null)}<div class="cap">Départ. ${count(g.plies[0].s)}.</div></div>`, '.wrap', f());
  for (const [i, pl] of g.plies.entries()) {
    const who = NAME[pl.s.to_move];
    const why = pl.pick.label === 'gagne' ? 'un coup gagne sur-le-champ : il le joue.'
      : `il essaie les ${pl.cands.length} coups et garde le meilleur écart, <b>${pl.pick.label}</b>${pl.tied > 1 ? ` (${pl.tied} coups à égalité, tirés au sort)` : ''}.`;
    await shot(p, `<div class="wrap">${board(pl.s, pl.pick.m)}<div class="cap">${i + 1}. <b>${who}</b> : ${why}</div></div>`, '.wrap', f());
    const after = g.plies[i + 1] ? pl.pick.next : g.end;
    const tail = g.plies[i + 1] ? `${count(after)}.` : `<b>${NAME[g.winner === 'W' ? 'White' : 'Red']} gagnent</b> : tous les sommets sont à eux.`;
    await shot(p, `<div class="wrap">${board(after, null)}<div class="cap">${i + 1}. ${tail}</div></div>`, '.wrap', f());
  }
  await b.close();
  console.log(n, 'frames,', g.plies.length, 'plies, winner', g.winner);
} else if (mode === 'sheet') {
  const g = play(Number(a1));
  const pl = g.plies[Number(a2)];
  const best = Math.max(...pl.cands.map(c => c.score));
  const panels = [`<div class="panel"><div class="b">${board(pl.s, null)}</div><div class="v" style="font-size:17px">${NAME[pl.s.to_move]} au trait</div></div>`]
    .concat(pl.cands.map(c => `<div class="panel ${c.score === best ? 'best' : ''}"><div class="b">${board(pl.s, c.m)}</div><div class="v">${c.label}</div></div>`));
  const [b, p] = await page();
  await shot(p, `<div class="sheet">${panels.join('')}</div>`, '.sheet', out);
  await b.close();
  console.log('panels', panels.length, 'best', best, 'tied', pl.tied);
} else {
  console.error('mode: search | game | sheet'); process.exit(2);
}
