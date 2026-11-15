// Round 5's still sheets (docs/experiments/v5-video.md, addendum 2), seed 1:
//
//   node v5sheets.mjs OUT.png mosaic    one mosaic per program and stage: the first 50 pairs of
//                                       the bench's arena against greedy, one square per game
//   node v5sheets.mjs OUT.png puzzle    puzzle 1 as AlphaZero sees it at each stage: the net's
//                                       prior alone, then the visits of its 100-simulation search
//
// Every figure is read from docs/experiments/v5/ (curves.json, puzzles/). The puzzle's board is
// rebuilt from its diagram and refused unless the engine's legal moves equal the file's list.
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, mode] = process.argv.slice(2);
const V5 = new URL('../../docs/experiments/v5/', import.meta.url);
const curves = JSON.parse(fs.readFileSync(new URL('curves.json', V5), 'utf8'));
const L = { White: 'W', Red: 'R' };
const pct = (x, d = 1) => (100 * x).toFixed(d).replace('.', ',') + ' %';
const int = n => n.toLocaleString('fr-FR').replace(/ | /g, ' ');
const MUTED = '#726453';

const css = fs.readFileSync(new URL('./board.css', import.meta.url), 'utf8') + `
.sheet{width:1280px;box-sizing:border-box;padding:40px 48px 36px;background:var(--page);color:var(--paper)}
h1{font-size:30px;font-weight:650;margin:0 0 6px}
.sub{font-size:18px;line-height:1.45;color:${MUTED};margin:0 0 22px;max-width:1120px}
.note{font-size:15px;line-height:1.45;color:${MUTED};margin:18px 0 0;max-width:1150px}
.grid{display:grid;grid-template-columns:70px repeat(3,1fr);column-gap:28px;row-gap:14px;align-items:start}
.colh{font-size:20px;font-weight:650;padding-bottom:4px}
.colh span{display:block;font-size:15px;font-weight:400;color:${MUTED}}
.rowh{font-size:18px;font-weight:650;padding-top:2px}
.mos{display:grid;grid-template-columns:repeat(20,1fr);gap:2px}
.sq{aspect-ratio:1;border-radius:2px}
.lab{font-size:14px;line-height:1.3;color:${MUTED};margin-top:5px}
.lab b{color:var(--paper);font-weight:650}
.pz{display:grid;grid-template-columns:auto 1fr;column-gap:44px}
.axis{font-size:15px;color:${MUTED}}
table{border-collapse:collapse;width:100%;font-size:17px}
td,th{padding:7px 8px;white-space:nowrap;text-align:left;vertical-align:middle}
th{font-size:15px;font-weight:600;color:${MUTED};border-bottom:1px solid #dcd0bd}
tr+tr td{border-top:1px solid #e6dccb}
.bar{position:relative;height:14px;background:#e6dccb;border-radius:3px;width:110px;display:inline-block;vertical-align:middle;margin-right:8px}
.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:3px}
.mv{font-variant-numeric:tabular-nums}
.ok{color:var(--paper);font-weight:650}`;

async function render(html) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
  await p.locator('.sheet').screenshot({ path: out });
  await b.close();
}

if (mode === 'mosaic') {
  const cols = [['az100', 'AlphaZero', '100 simulations par coup', '#b54a33'], ['td', 'Réseau TD(λ)', 'au réflexe, sans recherche', '#1f6fa0'], ['qtab', 'Q-learning tabulaire', 'au réflexe, sans recherche', '#a07a12']];
  const stages = curves.stages_pct;
  let g = '<div></div>' + cols.map(([k, n, sub]) => `<div class="colh">${n}<span>${sub} · budget ${int(curves.programs[k].budget_games)} parties</span></div>`).join('');
  for (const [i, pc] of stages.entries()) {
    g += `<div class="rowh">${pc} %</div>`;
    for (const [k, , , color] of cols) {
      const m = curves.mosaics[k][i];
      const st = curves.programs[k].seeds['1'][i];
      if (m.pct !== pc || st.pct !== pc || m.results.length !== 100 || m.unfinished !== 0) throw new Error(`${k} ${pc}: unexpected mosaic`);
      if (m.results.filter(r => r === 'win').length !== m.wins) throw new Error(`${k} ${pc}: wins differ`);
      const sq = m.results.map(r => `<div class="sq" style="background:${r === 'win' ? color : '#ffffff00'};box-shadow:inset 0 0 0 1px ${r === 'win' ? color : '#cbbda8'}"></div>`).join('');
      g += `<div><div class="mos">${sq}</div><div class="lab">après ${int(st.games_trained)} parties · <b>${m.wins} gagnées sur 100</b><br>erreurs ${pct(m.mistake_share, 0)} · score mesuré ${pct(st.score)}</div></div>`;
    }
  }
  await render(`<div class="sheet"><h1>Cent parties contre le glouton, à chaque étape de l’entraînement</h1>
    <p class="sub">Une case par partie : pleine si le programme gagne, vide s’il perd. Ce sont les 100 premières parties de la mesure, depuis des ouvertures tirées au hasard, le programme jouant une fois chaque couleur.</p>
    <div class="grid">${g}</div>
    <p class="note">Score mesuré : sur les 2 000 parties de la mesure (règle : la troisième apparition d’une position perd pour qui la provoque). Erreurs : part des coups du programme qui dégradent la valeur exacte de la position (une position gagnée devient nulle ou perdue, une nulle devient perdue), selon la table de l’analyse rétrograde, qui ignore la règle de répétition ; les coups joués d’une position déjà perdue ne comptent pas. Les étapes sont des parts du budget de chaque programme, pas un nombre égal de parties.</p></div>`);
  console.log('mosaic', out);
} else if (mode === 'puzzle') {
  const files = curves.puzzles.az.map(e => e.file);
  const runs = files.map(f => JSON.parse(fs.readFileSync(new URL(f, V5), 'utf8')));
  const pz = runs[0].puzzle_list[0];
  for (const r of runs) {
    const q = r.puzzle_list[0];
    if (q.puzzle !== 1 || q.key_move !== pz.key_move || JSON.stringify(q.moves) !== JSON.stringify(pz.moves)) throw new Error('puzzle 1 differs between stages');
    if (r.simulations !== 100) throw new Error('expected 100 simulations');
  }
  // Rebuild the position: rows top first, each cell bottom to top (retro.rs `diagram`).
  const lines = pz.diagram.split('\n');
  const cells = [];
  for (let r = 0; r < 3; r++) for (const c of lines[r].trim().split(/\s+/).slice(1)) cells.push(c === '.' ? [] : [...c].map(x => (x === 'W' ? 'White' : 'Red')));
  const toMove = /White to move/.test(pz.diagram) ? 'White' : 'Red';
  const state = { cells, to_move: toMove, move_count: 0, history: [] };
  const name = i => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;
  const legal = w.legal_moves(state).map(m => `${name(m.from_cell)}-${m.num_pieces}-${name(m.to_cell)}`);
  if (JSON.stringify([...legal].sort()) !== JSON.stringify([...pz.moves].sort())) throw new Error(`legal moves differ: ${legal}`);
  const [kf, kn, kt] = pz.key_move.split('-');
  const cellOf = s => 'abc'.indexOf(s[0]) + 3 * (Number(s[1]) - 1);
  const mark = { from_cell: cellOf(kf), num_pieces: Number(kn), to_cell: cellOf(kt) };
  const board = '<div class="g">' + cells.map((cell, i) => {
    const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
    const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mark.from_cell === i && k < mark.num_pieces ? 'mv' : ''}"></div>`).join('');
    const body = cell.length ? `<div class="st">${pcs}</div>` : '<div class="e"></div>';
    return `<div class="c ${mark.from_cell === i ? 'sel' : ''}">${body}${mark.to_cell === i ? '<div class="dot"></div>' : ''}<span class="n" style="font-size:13px">${name(i)}</span></div>`;
  }).join('') + '</div>';
  const ki = pz.moves.indexOf(pz.key_move);
  const argmax = a => a.indexOf(Math.max(...a));
  const bar = (v, c) => `<span class="bar"><i style="width:${(100 * v).toFixed(1)}%;background:${c}"></i></span>`;
  let rows = '';
  for (const [i, r] of runs.entries()) {
    const q = r.puzzle_list[0];
    const st = curves.programs.az100.seeds['1'][i];
    const total = q.visits.reduce((a, b) => a + b, 0);
    const pBest = argmax(q.prior), vBest = argmax(q.visits);
    const vTies = q.visits.filter(v => v === q.visits[vBest]).length;
    const pick = (j, ties, solved) => (solved === 1 ? `<span class="ok">${pz.moves[j]} ✓</span>` : solved > 0 ? `${ties} coups à égalité` : pz.moves[j]);
    rows += `<tr><td><b>${curves.stages_pct[i]} %</b><br><span class="axis">${int(st.games_trained)} parties</span></td>
      <td class="mv">${bar(q.prior[ki], '#c98b7c')}${pct(q.prior[ki], 0)}</td><td class="mv">${pick(pBest, 1, q.solved_without_search)}</td>
      <td class="mv">${bar(q.visits[ki] / total, '#b54a33')}${q.visits[ki]} / ${total}</td><td class="mv">${pick(vBest, vTies, q.solved_with_search)}</td></tr>`;
  }
  await render(`<div class="sheet"><h1>Ce que voit AlphaZero : un problème, à chaque étape</h1>
    <p class="sub">Les Blancs jouent et gagnent en ${pz.win_in_plies} coups, par un seul coup sur ${pz.moves.length} : <b style="color:var(--paper)">${pz.key_move}</b> (une pièce de ${kf} vers ${kt}, marquée sur le plateau). Le glouton jouerait ${pz.greedy_would_play_one_of.join(' ou ')}. L’intuition, c’est le réseau seul : la part qu’il donne à chaque coup. La recherche, ce sont ses 100 simulations : combien vont au bon coup.</p>
    <div class="pz"><div>${board}</div>
    <table><tr><th>Étape</th><th>Intuition :<br>part du bon coup</th><th>Elle choisit</th><th>Recherche :<br>visites du bon coup</th><th>Elle choisit</th></tr>${rows}</table></div>
    <p class="note">Position résolue dans le jeu sans répétition et jouée sans historique ; la table confirme ${pz.key_move} comme seul coup gagnant. Un problème montre comment le programme choisit, pas sa force : celle-ci se mesure sur les 2 000 parties contre le glouton.</p></div>`);
  console.log('puzzle', out);
} else {
  console.error('mode: mosaic | puzzle'); process.exit(2);
}
