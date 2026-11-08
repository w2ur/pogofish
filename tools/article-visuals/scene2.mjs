// Retrograde analysis, first three steps, as a small tree revealed right to left. Moves checked by the engine.
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });
const out = process.argv[2];
const L = { White: 'W', Red: 'R' };
const play = (s, [a, n, b]) => { if (!w.legal_moves(s).some(x => x.from_cell === a && x.num_pieces === n && x.to_cell === b)) throw new Error(`illegal ${a} ${n} ${b}`); return w.apply_move(s, { from_cell: a, num_pieces: n, to_cell: b }); };
let C = w.initial_state();
for (const m of [[0,2,4],[6,2,4],[1,1,0],[7,1,4],[0,1,3],[4,1,3],[1,1,4],[7,1,4],[2,1,1],[3,2,1]]) C = play(C, m);
const B = play(C, [2,1,1]), B2 = play(C, [2,1,5]);
const A = play(B, [4,3,1]), A2 = play(B2, [8,1,5]);
const noTop = (s, c) => !s.cells.some(x => x.length && x[x.length - 1] === c);
if (!noTop(A, 'White') || !noTop(A2, 'White') || w.legal_moves(C).length !== 2) throw new Error('scene does not hold');
const css = `:root{--page:#f3ede3;--ink:#dcd0bd;--ink2:#e6dccb;--paper:#24190f;--paper3:#726453;--hair:#938576;--acc:#4c1c00;--wf:#fffdf8;--wt:#e9e0cf;--rf:#b54a33;--rt:#7f2614;--edge:#6b5a48}
body{margin:0;background:var(--page);font-family:system-ui,-apple-system,sans-serif;color:var(--paper)}
.wrap{position:relative;width:1280px;padding:22px 26px 26px;box-sizing:border-box;background:var(--page)}
.title{font-size:26px;font-weight:650;color:var(--acc)}
.text{font-size:19px;line-height:1.4;min-height:54px;margin:6px 0 14px;max-width:1120px}
.cols{display:grid;grid-template-columns:1fr 1fr 1fr;column-gap:200px;align-items:center;justify-items:center;row-gap:6px;width:max-content;margin:0 auto}
.node{display:flex;flex-direction:column;align-items:center;gap:8px}.hide{visibility:hidden}
.g{display:grid;grid-template-columns:repeat(3,74px);gap:4px}
.c{position:relative;width:74px;height:74px;border-radius:3px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,var(--ink2),var(--ink));box-shadow:inset 0 0 0 1px var(--hair)}
.c.sel{box-shadow:inset 0 0 0 4px var(--paper)}
.st{display:flex;flex-direction:column;align-items:center}
.p{width:44px;height:14px;border-radius:50%;outline:1px solid var(--edge)}.p.low{opacity:.7}
.p.W{background:linear-gradient(180deg,var(--wf),var(--wt))}.p.R{background:linear-gradient(180deg,var(--rf),var(--rt))}
.p.mv{outline:2.5px solid var(--acc);opacity:1}
.e{width:3px;height:3px;border-radius:50%;background:var(--paper3);opacity:.3}
.dot{position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:var(--acc)}
.tag{font-size:16px;font-weight:600;padding:3px 10px;border-radius:3px;border:2px solid var(--acc);color:var(--acc)}
.tag.lost{background:var(--acc);color:var(--page)}
.who{font-size:14px;color:var(--paper3)}
.cap{position:absolute;font-size:14px;line-height:1.25;color:var(--acc);background:var(--page);padding:2px 4px;text-align:center;width:190px;transform:translate(-50%,-50%)}
svg{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}`;
function board(s, mark, arrive) {
  return '<div class="g">' + s.cells.map((cell, i) => {
    const step = Math.min(12, Math.floor(56 / Math.max(1, cell.length - 1)));
    const pcs = [...cell].reverse().map((p, k) => {
      const mv = (mark && mark.from === i && k < mark.n) || (arrive && arrive[0] === i && k < arrive[1]);
      return `<div style="${k > 0 ? `margin-top:${step - 14}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mv ? 'mv' : ''}"></div>`;
    }).join('');
    return `<div class="c ${mark && mark.from === i ? 'sel' : ''}">${cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>'}${mark && mark.to.includes(i) ? '<div class="dot"></div>' : ''}</div>`;
  }).join('') + '</div>';
}
const node = (id, s, mark, arrive, who, tag, show) => `<div id="${id}" class="node ${show ? '' : 'hide'}"><div class="who">${who}</div>${board(s, mark, arrive)}<div class="tag ${tag.startsWith('perdue') ? 'lost' : ''}">${tag}</div></div>`;
// Arrows: [from, to, caption]. Moves: C→B (2,1,1), C→B2 (2,1,5), B→A (4,3,1), B2→A2 (8,1,5).
const AR = {
  BA: ['B', 'A', '3 pièces montent d’une case<br>(3 pas, dont un aller-retour)'],
  BA2: ['B2', 'A2', '1 pièce rouge monte<br>d’une case'],
  CB: ['C', 'B', '1 pièce blanche,<br>une case à gauche'],
  CB2: ['C', 'B2', '1 pièce blanche,<br>une case vers le bas'],
};
const steps = [
  { show: ['A', 'A2'], arrows: [], title: 'Perdue en 0', text: 'Une position où toutes les piles appartiennent à l’autre joueur est marquée « perdue en 0 ». Ici, c’est aux blancs de jouer, et toutes les piles ont un rouge au sommet.' },
  { show: ['A', 'A2', 'B', 'B2'], arrows: ['BA', 'BA2'], title: 'Gagnée en 1', text: 'Une position dont au moins un coup amène à une position « perdue en 0 » pour l’adversaire est une position « gagnée en 1 » pour le joueur.' },
  { show: ['A', 'A2', 'B', 'B2', 'C'], arrows: ['BA', 'BA2', 'CB', 'CB2'], title: 'Perdue en 2', text: 'Une position dont tous les coups amènent à une position « gagnée en 1 » pour l’adversaire est une position « perdue en 2 » pour le joueur. Ici, les blancs n’ont que ces deux coups.' },
  { show: ['A', 'A2', 'B', 'B2', 'C'], arrows: ['BA', 'BA2', 'CB', 'CB2'], title: 'Et ainsi de suite', text: '« Gagnée en 3 », « perdue en 4 », etc. Les positions qui n’ont aucune marque sont celles dans lesquelles aucun joueur ne peut forcer l’issue.' },
];
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1280, height: 900 } });
for (const [k, st] of steps.entries()) {
  const sh = id => st.show.includes(id);
  const showArr = id => st.arrows.includes(id);
  const html = `<!doctype html><html><head><style>${css}</style></head><body><div class="wrap"><div class="title">${st.title}</div><div class="text">${st.text}</div>
<div class="cols">
<div></div>${node('B', B, showArr('BA') ? { from: 4, n: 3, to: [1] } : null, showArr('CB') ? [1, 1] : null, 'aux rouges de jouer', 'gagnée en 1', sh('B'))}${node('A', A, null, showArr('BA') ? [1, 3] : null, 'aux blancs de jouer', 'perdue en 0', sh('A'))}
${node('C', C, { from: 2, n: 1, to: [1, 5] }, null, 'aux blancs de jouer', 'perdue en 2', sh('C'))}<div></div><div></div>
<div></div>${node('B2', B2, showArr('BA2') ? { from: 8, n: 1, to: [5] } : null, showArr('CB2') ? [5, 1] : null, 'aux rouges de jouer', 'gagnée en 1', sh('B2'))}${node('A2', A2, null, showArr('BA2') ? [5, 1] : null, 'aux blancs de jouer', 'perdue en 0', sh('A2'))}
</div><svg id="s"><defs><marker id="h" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#4c1c00"/></marker></defs></svg></div></body></html>`;
  await page.setContent(html);
  await page.evaluate(arrows => {
    const svg = document.getElementById('s'), wrap = document.querySelector('.wrap'), wr = wrap.getBoundingClientRect();
    for (const [f, t, cap] of arrows) {
      const a = document.querySelector(`#${f} .g`).getBoundingClientRect(), b = document.querySelector(`#${t} .g`).getBoundingClientRect();
      const x1 = a.right - wr.left + 10, y1 = a.top + a.height / 2 - wr.top, x2 = b.left - wr.left - 12, y2 = b.top + b.height / 2 - wr.top;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      Object.entries({ x1, y1, x2, y2, stroke: '#4c1c00', 'stroke-width': 3, 'marker-end': 'url(#h)' }).forEach(([k, v]) => l.setAttribute(k, v));
      svg.appendChild(l);
      const d = document.createElement('div'); d.className = 'cap'; d.innerHTML = cap;
      d.style.left = `${(x1 + x2) / 2}px`; d.style.top = `${(y1 + y2) / 2 - (Math.abs(y1 - y2) < 5 ? 34 : 0)}px`; wrap.appendChild(d);
    }
  }, st.arrows.map(id => AR[id]));
  await page.locator('.wrap').screenshot({ path: `${out}/s${k}.png` });
}
await browser.close();
console.log('ok');
