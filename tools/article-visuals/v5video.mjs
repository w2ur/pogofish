// Round 5's learning videos (docs/experiments/v5-video.md): one program at each stage of its
// training, the game shown (game 0 of the bench's arena, the program as White against greedy)
// replayed through the real engine, and the curve of measured scores building up; or the race,
// every program's curve against games trained. Writes 1280x720 frames and an ffmpeg concat list.
//
//   node v5video.mjs OUT qtab|td|az100     one program, seed 1
//   node v5video.mjs OUT race              every program's curve against games trained, seed 1
//   ffmpeg -f concat -safe 0 -i OUT/list.txt -vf fps=30,format=yuv420p -c:v libx264 -crf 18 out.mp4
//
// Every score comes from docs/experiments/v5/curves.json (generated from the bench JSON).
// The game illustrates, the score measures: the caption carries the score, and the script
// refuses to render if the replayed outcome differs from the one the game JSON records.
import fs from 'node:fs';
import * as w from '../../wasm-pkg/pogofish_wasm.js';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
w.initSync({ module: fs.readFileSync(new URL('../../wasm-pkg/pogofish_wasm_bg.wasm', import.meta.url)) });

const [out, prog] = process.argv.slice(2);
const V5 = new URL('../../docs/experiments/v5/', import.meta.url);
const curves = JSON.parse(fs.readFileSync(new URL('curves.json', V5), 'utf8'));
const RULES = { LC1: { repetitions: 2 } }; // lc1-2
const L = { White: 'W', Red: 'R' };
const NAME = {
  qtab: { bare: 'Q-learning', short: 'Le Q-learning', long: 'Q-learning tabulaire', color: '#a07a12' },
  td: { bare: 'TD(λ)', short: 'Le réseau TD(λ)', long: 'Réseau TD(λ)', color: '#1f6fa0' },
  az100: { bare: 'AlphaZero', short: 'AlphaZero', long: 'AlphaZero, 100 simulations par coup', color: '#b54a33' },
  az0: { bare: 'AlphaZero sans recherche', short: 'AlphaZero sans recherche', long: 'AlphaZero sans recherche', color: '#b54a33' },
};
const REF = curves.references;

const pct = x => (100 * x).toFixed(1).replace('.', ',') + ' %';
const int = n => n.toLocaleString('fr-FR').replace(/ | /g, ' ');
const ciTxt = ci => `${(100 * ci[0]).toFixed(1).replace('.', ',')}–${(100 * ci[1]).toFixed(1).replace('.', ',')}`;

const css = fs.readFileSync(new URL('./board.css', import.meta.url), 'utf8') + `
html,body{width:1280px;height:720px;overflow:hidden}
.f{width:1280px;height:720px;box-sizing:border-box;padding:40px 56px;display:grid;grid-template-columns:409px 1fr;
  grid-template-rows:auto 1fr auto;column-gap:56px;color:var(--paper);background:var(--page)}
.hd{grid-column:1/3;display:flex;align-items:baseline;gap:20px;margin-bottom:18px}
.hd h1{font-size:30px;font-weight:650;margin:0}
.hd .st{display:block;font-size:22px;color:var(--paper3)}
.bd{align-self:start}
.cap{grid-column:1/3;font-size:22px;line-height:1.4;min-height:62px;margin-top:14px}
.cap b{font-weight:650}
.score{font-size:20px;line-height:1.45;margin:0 0 10px}
.score b{font-size:34px;font-weight:650}
.card{width:1280px;height:720px;box-sizing:border-box;padding:0 120px;display:flex;flex-direction:column;justify-content:center;
  background:var(--page);color:var(--paper)}
.card h1{font-size:54px;font-weight:650;margin:0 0 20px}
.card p{font-size:26px;line-height:1.45;margin:0 0 10px;color:var(--paper3);max-width:1000px}
.card p b{color:var(--paper);font-weight:650}
svg text{font-family:system-ui,-apple-system,sans-serif}`;

function board(s, mark) {
  return '<div class="g">' + s.cells.map((cell, i) => {
    const step = Math.min(19, Math.floor(92 / Math.max(1, cell.length - 1)));
    const pcs = [...cell].reverse().map((p, k) => `<div style="${k > 0 ? `margin-top:${step - 22}px` : ''}" class="p ${L[p]} ${k > 0 ? 'low' : ''} ${mark && mark.from_cell === i && k < mark.num_pieces ? 'mv' : ''}"></div>`).join('');
    const body = cell.length ? `<div class="st">${pcs}</div>${cell.length > 1 ? `<span class="n">${cell.map(p => L[p]).join('')}</span>` : ''}` : '<div class="e"></div>';
    return `<div class="c ${mark && mark.from_cell === i ? 'sel' : ''}">${body}${mark && mark.to_cell === i ? '<div class="dot"></div>' : ''}</div>`;
  }).join('') + '</div>';
}

// The stage curve of one program: stages evenly spaced (they are fractions of the budget, not a
// linear scale), score on 0-100 %, the three references as dashed lines, points up to `upto`.
function stageChart(stages, upto, color) {
  const W = 640, H = 440, x0 = 70, x1 = W - 120, y0 = H - 50, y1 = 16;
  const X = i => x0 + (i * (x1 - x0)) / (stages.length - 1);
  const Y = v => y0 - v * (y0 - y1);
  let g = '';
  for (const v of [0, 0.25, 0.5, 0.75, 1]) g += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="#dcd0bd" stroke-width="1"/><text x="${x0 - 10}" y="${Y(v) + 6}" font-size="16" fill="#726453" text-anchor="end">${v * 100} %</text>`;
  const refs = [['table', REF.table.score], ['glouton', REF.greedy.score], ['hasard', REF.random.score]];
  for (const [n, v] of refs) g += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="#726453" stroke-width="1.5" stroke-dasharray="5 5"/><text x="${x1 + 10}" y="${Y(v) + 6}" font-size="17" fill="#726453">${n} ${pct(v).replace(' %', '')}</text>`;
  stages.forEach((s, i) => { g += `<text x="${X(i)}" y="${y0 + 28}" font-size="16" fill="#726453" text-anchor="middle">${s.pct} %</text>`; });
  g += `<text x="${(x0 + x1) / 2}" y="${H - 2}" font-size="16" fill="#726453" text-anchor="middle">part du budget d’entraînement</text>`;
  const pts = stages.slice(0, upto + 1);
  if (pts.length > 1) g += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts.map((s, i) => `${X(i)},${Y(s.score)}`).join(' ')}"/>`;
  pts.forEach((s, i) => {
    const cur = i === upto;
    g += `<line x1="${X(i)}" x2="${X(i)}" y1="${Y(s.ci95[0])}" y2="${Y(s.ci95[1])}" stroke="${color}" stroke-width="2" opacity=".55"/>`;
    g += `<circle cx="${X(i)}" cy="${Y(s.score)}" r="${cur ? 9 : 5}" fill="${color}" stroke="#f3ede3" stroke-width="2"/>`;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

// Replays a game's move list through the engine; checks legality and the recorded outcome.
function replay(game) {
  let s = w.initial_state();
  const plies = [];
  for (const [f, n, t] of game.moves) {
    const m = { from_cell: f, num_pieces: n, to_cell: t };
    if (!w.legal_moves(s).some(x => x.from_cell === f && x.num_pieces === n && x.to_cell === t)) throw new Error(`illegal move ${f},${n},${t}`);
    const next = w.apply_move(s, m);
    plies.push({ s, m, next });
    s = next;
  }
  if (!w.is_terminal(s, RULES)) throw new Error('game does not end');
  const winner = w.winner_with_rules(s, RULES); // 'W' | 'R'
  const res = (winner === L[game.player_colour]) ? 'win' : 'loss';
  if (res !== game.player_result) throw new Error(`replayed ${res}, JSON says ${game.player_result}`);
  return { plies, end: s, winner };
}

const frames = []; // { html, dur }
const add = (html, dur) => frames.push({ html, dur });
const pieces = n => `${n} pièce${n > 1 ? 's' : ''}`;

if (prog in NAME && prog !== 'az0') {
  const p = curves.programs[prog];
  const stages = p.seeds['1'];
  const nm = NAME[prog];
  for (const s of stages) if (s.unfinished !== 0) throw new Error(`${s.file}: unfinished games`);
  add(`<div class="card"><h1>${nm.long}</h1>
    <p>Le même programme à huit moments de son entraînement, de 0 à ${int(p.budget_games)} parties jouées contre lui-même.</p>
    <p>À chaque étape : son <b>score contre le glouton</b>, mesuré sur 2 000 parties (règle : la troisième apparition d’une position perd pour qui la provoque), et <b>une</b> partie contre le glouton, toujours depuis la même ouverture tirée au hasard. Le programme a les blancs.</p>
    <p>La partie illustre ; le score mesure.</p></div>`, 6);
  for (const [k, st] of stages.entries()) {
    const game = JSON.parse(fs.readFileSync(new URL(st.game.file, V5), 'utf8'));
    if (game.player_colour !== 'White' || game.opening_plies !== 4) throw new Error(`${st.game.file}: unexpected game`);
    const g = replay(game);
    const head = `<div class="hd"><h1>${nm.short}</h1><span class="st">après ${int(st.games_trained)} parties d’entraînement (${st.pct} % du budget)</span></div>`;
    const score = `<p class="score">Score contre le glouton : <b>${pct(st.score)}</b><br><span style="color:#726453">intervalle à 95 % : ${ciTxt(st.ci95)}</span></p>`;
    const frame = (s, mark, cap, upto = k) => `<div class="f">${head}<div class="bd">${board(s, mark)}</div><div>${score}${stageChart(stages, upto, nm.color)}</div><div class="cap">${cap}</div></div>`;
    add(frame(g.plies[0].s, null, `Étape ${k + 1} sur ${stages.length}. Score mesuré : <b>${pct(st.score)}</b>. Voici une de ses parties.`), 2.6);
    for (const [i, pl] of g.plies.entries()) {
      const opening = i < game.opening_plies;
      const mover = pl.s.to_move === 'White' ? `${nm.short} (blancs)` : 'le glouton (rouges)';
      const cap = opening
        ? `Coup ${i + 1} : ouverture tirée au hasard, la même à chaque étape.`
        : `Coup ${i + 1} : ${mover} déplace ${pieces(pl.m.num_pieces)}.`;
      add(frame(pl.s, pl.m, cap), opening ? 0.45 : 0.85);
      if (!opening) add(frame(pl.next, null, cap), 0.45);
    }
    const won = game.player_result === 'win';
    const why = game.ended_by_repetition_rule ? 'par la règle de répétition' : 'tous les sommets lui reviennent';
    add(frame(g.end, null, `${won ? `<b>${nm.short} gagne</b>` : '<b>Le glouton gagne</b>'} au coup ${g.plies.length} : ${why}. Score mesuré sur 2 000 parties : ${pct(st.score)}.`), 2.8);
  }
  const last = stages.at(-1);
  add(`<div class="card"><h1>${pct(stages[0].score)} → ${pct(last.score)}</h1>
    <p>${nm.short} contre le glouton, avant tout entraînement puis après ${int(last.games_trained)} parties.</p>
    <p>Repères : le hasard ${pct(REF.random.score)}, le glouton contre lui-même ${pct(REF.greedy.score)}, la table de l’analyse rétrograde ${pct(REF.table.score)}.</p></div>`, 5);
} else if (prog === 'race') {
  // Log axis over games trained; stage 0 sits on its own tick left of the axis break.
  const W = 1168, H = 520, x0 = 150, x1 = W - 150, y0 = H - 60, y1 = 20, xz = 80;
  const lo = 2, hi = Math.log10(5e6);
  const X = gm => (gm === 0 ? xz : x0 + ((Math.log10(gm) - lo) * (x1 - x0)) / (hi - lo));
  const Y = v => y0 - v * (y0 - y1);
  const series = ['qtab', 'td', 'az100', 'az0'].map(k => ({ k, ...NAME[k], st: curves.programs[k].seeds['1'] }));
  function chart(upto) { // upto: log10 games revealed (-1 = only stage 0)
    let g = '';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) g += `<line x1="${xz}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="#dcd0bd"/><text x="${xz - 14}" y="${Y(v) + 6}" font-size="17" fill="#726453" text-anchor="end">${v * 100} %</text>`;
    for (const [n, r] of [['table', REF.table], ['glouton', REF.greedy], ['hasard', REF.random]]) g += `<line x1="${xz}" x2="${x1}" y1="${Y(r.score)}" y2="${Y(r.score)}" stroke="#726453" stroke-width="1.5" stroke-dasharray="5 5"/><text x="${x1 + 12}" y="${Y(r.score) + 6}" font-size="18" fill="#726453">${n}</text>`;
    const ticks = [[0, '0'], [1e2, '100'], [1e3, '1 000'], [1e4, '10 000'], [1e5, '100 000'], [1e6, '1 million'], [5e6, '5 millions']];
    for (const [t, l] of ticks) g += `<text x="${X(t)}" y="${y0 + 28}" font-size="16" fill="#726453" text-anchor="middle">${l}</text>`;
    g += `<text x="${(x0 + x1) / 2}" y="${H - 6}" font-size="17" fill="#726453" text-anchor="middle">parties d’entraînement (échelle logarithmique)</text>`;
    for (const s of series) {
      const pts = s.st.filter(p => p.games_trained === 0 || Math.log10(p.games_trained) <= upto + 1e-9);
      const dash = s.k === 'az0' ? ' stroke-dasharray="7 5"' : '';
      // Stage 0 sits left of the axis break: joined to the first measured stage by a thin dotted
      // connector only, so the gap does not read as measurements in between.
      const on = pts.filter(p => p.games_trained > 0);
      if (on.length) g += `<line x1="${X(0)}" y1="${Y(pts[0].score)}" x2="${X(on[0].games_trained)}" y2="${Y(on[0].score)}" stroke="${s.color}" stroke-width="1.2" stroke-dasharray="2 4" opacity=".7"/>`;
      if (on.length > 1) g += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5"${dash} points="${on.map(p => `${X(p.games_trained)},${Y(p.score)}`).join(' ')}"/>`;
      for (const p of pts) g += s.k === 'az0'
        ? `<circle cx="${X(p.games_trained)}" cy="${Y(p.score)}" r="5" fill="#f3ede3" stroke="${s.color}" stroke-width="2"/>`
        : `<circle cx="${X(p.games_trained)}" cy="${Y(p.score)}" r="5" fill="${s.color}" stroke="#f3ede3" stroke-width="2"/>`;
      const end = pts.at(-1);
      const right = X(end.games_trained) > x1 - 200; // near the right edge: label above, ending at the point
      const dy = right ? -16 : s.k === 'az100' ? 6 : s.k === 'az0' ? 24 : -10;
      if (pts.length > 1) g += `<text x="${X(end.games_trained) + (right ? 0 : 12)}" y="${Y(end.score) + dy}" text-anchor="${right ? 'end' : 'start'}" font-size="17" font-weight="600" fill="#24190f">${s.bare} ${pct(end.score)}</text>`;
    }
    return `<svg width="${W}" height="${H}">${g}</svg>`;
  }
  const page = (svg, cap) => `<div style="width:1280px;height:720px;box-sizing:border-box;padding:36px 56px;background:var(--page);color:var(--paper)">
    <div style="font-size:30px;font-weight:650;margin-bottom:6px">Score contre le glouton, au fil de l’entraînement</div>${svg}
    <div style="font-size:21px;line-height:1.4;margin-top:6px">${cap}</div></div>`;
  add(`<div class="card"><h1>La course</h1><p>Trois programmes apprennent le même jeu en jouant contre eux-mêmes. À intervalles fixés, on mesure leur score contre le glouton sur 2 000 parties.</p><p>L’axe compte les parties d’entraînement, pas le calcul : une partie d’AlphaZero fait 100 simulations par coup.</p></div>`, 6);
  const cap = 'Trait plein : AlphaZero avec recherche (100 simulations), les deux autres à un coup d’avance. Pointillé : AlphaZero sans recherche.';
  for (let u = lo - 0.2; u <= hi + 1e-9; u += 0.05) add(page(chart(u), cap), 0.1);
  // First stage whose whole 95 % interval lies above greedy's score, derived, never typed.
  const passes = s => s.st.find(p => p.ci95[0] > REF.greedy.score);
  const said = series.map(s => { const p = passes(s); return p ? `${s.bare}, dès ${int(p.games_trained)} parties` : `${s.bare}, jamais (${pct(s.st.at(-1).score)} à la fin)`; });
  add(page(chart(hi), `Au-dessus du glouton, intervalle compris : ${said.join(' ; ')}.`), 7);
} else {
  console.error('program: qtab | td | az100 | race'); process.exit(2);
}

fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
let list = '';
for (const [i, f] of frames.entries()) {
  const path = `${out}/f${String(i).padStart(4, '0')}.png`;
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${f.html}</body></html>`);
  await pg.screenshot({ path, clip: { x: 0, y: 0, width: 1280, height: 720 } });
  list += `file '${path.split('/').pop()}'\nduration ${f.dur}\n`;
}
list += `file 'f${String(frames.length - 1).padStart(4, '0')}.png'\n`; // concat demuxer: the last duration needs a trailing entry
fs.writeFileSync(`${out}/list.txt`, list);
await b.close();
console.log(frames.length, 'frames,', frames.reduce((a, f) => a + f.dur, 0).toFixed(1), 's');
