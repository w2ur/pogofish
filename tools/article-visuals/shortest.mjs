import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });
const L = { White: 'W', Red: 'R' };
const show = s => s.cells.map(c => c.map(p => L[p]).join('') || '.').join(' ');
let frontier = [{ s: w.initial_state(), path: [] }];
const seen = new Set();
for (let d = 1; d <= 9; d++) {
  const next = []; const wins = [];
  for (const { s, path } of frontier) {
    for (const m of w.legal_moves(s)) {
      const t = w.apply_move(s, m); t.history = [];
      const k = w.state_key(t); if (seen.has(k)) continue; seen.add(k);
      const p = [...path, [m.from_cell, m.num_pieces, m.to_cell]];
      if (w.winner(t)) wins.push({ p, t }); else next.push({ s: t, path: p });
    }
  }
  console.log('depth', d, 'states', next.length, 'wins', wins.length);
  if (wins.length) { for (const x of wins.slice(0, 5)) console.log(JSON.stringify(x.p), w.winner(x.t), show(x.t)); break; }
  frontier = next;
}
