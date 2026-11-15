// Every reply from a position, drawn as the board AFTER the reply, grouped by the solver's verdict.
// Usage: node replies.mjs OUT.png PREFIX_JSON VALUES_TXT  (VALUES_TXT = output of `pogoq values`)
import fs from 'node:fs';
const R = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const w = await import(`${R}/wasm-pkg/pogofish_wasm.js`);
const { chromium } = await import(`${R}/app/node_modules/playwright-core/index.mjs`);
w.initSync({ module: fs.readFileSync(`${R}/wasm-pkg/pogofish_wasm_bg.wasm`) });
const [out, prefixJ, valuesF] = process.argv.slice(2);
const L = { White: 'W', Red: 'R' };
const name = i => 'abc'[i % 3] + (Math.floor(i / 3) + 1);
let s = w.initial_state();
const prefix = JSON.parse(prefixJ);
for (const [a, n, b] of prefix) s = w.apply_move(s, { from_cell: a, num_pieces: n, to_cell: b });
// verdicts from pogoq: "f n t -> opponent Draw|Win(d)"
const verdict = {};
for (const line of fs.readFileSync(valuesF, 'utf8').split('\n')) {
  const m = line.match(/^(\d) (\d) (\d) -> opponent (Draw|Win\((\d+)\))/);
  if (m) verdict[`${m[1]},${m[2]},${m[3]}`] = m[4] === 'Draw' ? 0 : Number(m[5]) + 1;
}
const legal = w.legal_moves(s).map(m => [m.from_cell, m.num_pieces, m.to_cell]);
if (legal.length !== Object.keys(verdict).length || !legal.every(m => m.join(',') in verdict)) {
  console.error('verdicts do not match legal moves'); process.exit(1);
}
const css = fs.readFileSync(`${R}/tools/article-visuals/board.css`, 'utf8');
function board(st, mark) {
  return '<div class="g">' + st.cells.map((cell, i) => {
    const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
    const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mark && mark[2] === i && k < mark[1] ? 'mv' : ''}"></div>`).join('');
    const body = cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>';
    return `<div class="c ${mark && mark[0] === i ? 'from' : ''}">${body}</div>`;
  }).join('') + '</div>';
}
const panel = (m, cls) => {
  const after = w.apply_move(s, { from_cell: m[0], num_pieces: m[1], to_cell: m[2] });
  const d = verdict[m.join(',')];
  const pieces = m[1] === 1 ? '1 pièce' : `${m[1]} pièces`;
  return `<div class="panel ${cls}"><div class="b">${board(after, m)}</div>
    <div class="mv-l">${name(m[0])} → ${name(m[2])} · ${pieces}</div>
    <div class="v">${d === 0 ? 'garde la nulle' : `perd en ${d}`}</div></div>`;
};
const keep = legal.filter(m => verdict[m.join(',')] === 0);
const lose = legal.filter(m => verdict[m.join(',')] > 0).sort((a, b) => verdict[a.join(',')] - verdict[b.join(',')]);
const last = prefix[prefix.length - 1];
const html = `<!doctype html><html><head><style>${css}
.sheet{padding:28px 32px;background:var(--page);width:max-content;color:var(--paper)}
.row{display:flex;gap:26px;align-items:flex-start}
.grid{display:grid;grid-template-columns:repeat(7,max-content);gap:22px 18px}
.b{zoom:.55}
.panel{border-radius:8px;padding:8px 8px 10px;text-align:center}
.panel.keep{box-shadow:0 0 0 4px var(--acc);background:#ece2d2}
.c.from{box-shadow:inset 0 0 0 1px var(--hair);outline:4px dashed var(--paper);outline-offset:-8px}
.mv-l{font-size:15px;margin-top:6px}
.v{font-size:17px;font-weight:650;margin-top:2px}
.keep .v{color:var(--acc)}
.lose .v{color:var(--paper3);font-weight:500}
h2{font-size:22px;font-weight:650;margin:22px 0 12px}
h2:first-child{margin-top:0}
.start .v{font-weight:500}
</style></head><body><div class="sheet">
<div class="row">
  <div><h2>Position de départ</h2><div class="panel start"><div class="b">${board(s, null)}</div>
    <div class="mv-l">Les Blancs ont joué ${name(last[0])} → ${name(last[2])}</div><div class="v">aux Rouges de jouer</div></div></div>
  <div><h2>Gardent la nulle : ${keep.length} réponses sur ${legal.length}</h2><div class="row">${keep.map(m => panel(m, 'keep')).join('')}</div></div>
</div>
<h2>Perdent : ${lose.length} réponses, du gain blanc le plus rapide au plus lent</h2>
<div class="grid">${lose.map(m => panel(m, 'lose')).join('')}</div>
</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
await page.locator('.sheet').screenshot({ path: out });
await browser.close();
console.log('keep', keep.length, 'lose', lose.length);
