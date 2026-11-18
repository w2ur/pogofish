// Packs the committed round-5 and solve results into the files the page
// fetches, from committed sources only (no table, no model needed):
//
//   node scripts/pack-v5.mjs
//
// writes public/data/v5.json (docs/experiments/v5/curves.json, seed 1, plus
// the stage games and the per-game mosaics it points at) and
// public/data/reach.json (docs/experiments/v3-solve/reach.json). Exit 0
// written · 1 a finding: a source contradicts itself, nothing is written ·
// 2 could not run: a source is missing, nothing is written.
//
// Seed 1 is the seed v5video.mjs and v5sheets.mjs draw; the mosaic keeps one
// record per game, its result and the player's judged moves, which is all the
// figure reads of the arena file.
//
// `asOf` is the commit date of curves.json (scripts/v5-date.mjs): the bench
// files carry no timestamp. The script refuses a shallow clone (exit 2) and a
// curves.json with uncommitted changes (exit 1), where that date would be false.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DateFinding, curvesDate } from './v5-date.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const V5 = 'docs/experiments/v5/';
const SOLVE = 'docs/experiments/v3-solve/reach.json';
const OUT_DIR = fileURLToPath(new URL('../public/data/', import.meta.url));

class Finding extends Error {}
class CannotRun extends Error {}

const check = (condition, message) => {
  if (!condition) throw new Finding(message);
};

function readJson(repoPath) {
  const path = `${ROOT}${repoPath}`;
  if (!existsSync(path)) throw new CannotRun(`missing source ${repoPath}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const PROGRAMS = ['qtab', 'td', 'az100', 'az0'];
const MOSAICS = ['qtab', 'td', 'az100'];
const SEED = '1';

function packStage(key, stage) {
  const name = `${key} stage ${stage?.pct}`;
  check(typeof stage?.game?.file === 'string', `${name}: no game file in curves.json`);
  const game = readJson(`${V5}${stage.game.file}`);
  check(Array.isArray(game.moves), `${name}: game file has no moves`);
  check(stage.unfinished === 0, `${name}: unfinished games in the bench`);
  check(game.rules === 'lc1-2' && game.opponent === 'greedy', `${name}: game file is not lc1-2 against greedy`);
  check(game.player_result === stage.game.result, `${name}: game file says ${game.player_result}, curves.json ${stage.game.result}`);
  check(game.moves.length === stage.game.plies, `${name}: game file has ${game.moves.length} plies, curves.json ${stage.game.plies}`);
  check(game.player_result === 'win' || game.player_result === 'loss', `${name}: result ${game.player_result}`);
  check(
    Number.isInteger(game.opening_plies) && game.opening_plies >= 0 && game.opening_plies < game.moves.length,
    `${name}: opening_plies ${game.opening_plies}`,
  );
  return {
    pct: stage.pct,
    gamesTrained: stage.games_trained,
    score: stage.score,
    ci95: stage.ci95,
    source: { bench: `${V5}${stage.file}`, game: `${V5}${stage.game.file}` },
    game: game.moves,
    openingPlies: game.opening_plies,
    playerColour: game.player_colour,
    result: game.player_result,
  };
}

function packMosaic(key, entry) {
  const arena = readJson(`${V5}${entry.file}`);
  const name = `${key} mosaic ${entry.pct}`;
  check(Array.isArray(arena.game_list), `${name}: no game_list`);
  check(arena.game_list.length === entry.games, `${name}: ${arena.game_list.length} games, curves.json ${entry.games}`);
  const games = arena.game_list.map((g) => {
    check(g.result === 'win' || g.result === 'loss', `${name}: a game ended ${g.result}`);
    check(Array.isArray(g.player_moves), `${name}: a game has no player_moves`);
    const mistakes = g.player_moves.filter((m) => m.verdict === 'mistake').length;
    const keeps = g.player_moves.filter((m) => m.verdict === 'keep').length;
    return { result: g.result, mistakes, judged: mistakes + keeps };
  });
  check(sameList(games.map((g) => g.result), entry.results), `${name}: results differ from curves.json`);
  check(games.reduce((a, g) => a + g.mistakes, 0) === entry.mistakes, `${name}: mistake total differs from curves.json`);
  check(games.reduce((a, g) => a + g.judged, 0) === entry.judged, `${name}: judged total differs from curves.json`);
  return { pct: entry.pct, source: `${V5}${entry.file}`, games };
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function packV5() {
  const curves = readJson(`${V5}curves.json`);
  check(curves.rules === 'lc1-2' && curves.opponent === 'greedy', 'curves.json is not lc1-2 against greedy');
  // A field missing from the source is a finding like a field that disagrees, never a TypeError (exit 2).
  check(Array.isArray(curves.stages_pct), 'curves.json has no stages_pct');
  const programs = {};
  for (const key of PROGRAMS) {
    const program = curves.programs?.[key];
    const stages = program?.seeds?.[SEED];
    check(Array.isArray(stages) && stages.length === curves.stages_pct.length, `${key}: no seed-${SEED} stages`);
    check(sameList(stages.map((s) => s?.pct), curves.stages_pct), `${key}: stages are not stages_pct`);
    programs[key] = { label: program.label, stages: stages.map((s) => packStage(key, s)) };
  }
  const mosaics = {};
  for (const key of MOSAICS) {
    const entries = curves.mosaics?.[key];
    check(Array.isArray(entries), `${key}: no mosaic in curves.json`);
    check(sameList(entries.map((m) => m?.pct), curves.stages_pct), `${key}: mosaic stages are not stages_pct`);
    mosaics[key] = entries.map((m) => packMosaic(key, m));
  }
  return {
    rules: curves.rules,
    opponent: curves.opponent,
    seed: Number(SEED),
    source: `${V5}curves.json, seed ${SEED}`,
    asOf: curvesDate(ROOT),
    stagesPct: curves.stages_pct,
    references: curves.references,
    programs,
    mosaics,
  };
}

function packReach() {
  const report = readJson(SOLVE);
  const counts = report.reachable_first_seen_at_ply;
  check(Array.isArray(counts) && counts.length === 16, `reach.json lists ${counts?.length} plies, not 16`);
  check(counts.reduce((a, b) => a + b, 0) === report.reachable, 'first-seen counts do not add up to the reachable total');
  return {
    positionsTotal: report.positions_total,
    reachable: report.reachable,
    firstSeenAtPly: counts,
    source: SOLVE,
  };
}

try {
  // Both are built before either is written, so a finding leaves no partial output.
  const files = { 'v5.json': packV5(), 'reach.json': packReach() };
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(`${OUT_DIR}${name}`, `${JSON.stringify(data)}\n`);
    console.log(`pack-v5: wrote public/data/${name}`);
  }
} catch (error) {
  if (error instanceof Finding || error instanceof DateFinding) {
    console.error(`pack-v5: finding, nothing written: ${error.message}`);
    process.exit(1);
  }
  console.error(`pack-v5: could not run, nothing written: ${error.message}`);
  process.exit(2);
}
