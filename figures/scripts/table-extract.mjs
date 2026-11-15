// Extracts the facts the figures show from the solved table of game A
// (docs/experiments/v3-solve.md) into public/data/table.json.
//
//   node scripts/table-extract.mjs
//
// Needs models/v3-solve/table.bin (local, git-ignored; override the directory
// with POGOFISH_TABLE) and a release build of pogoq
// (cargo build --release -p pogoq). Exit 0 written · 1 a finding: an extracted
// fact contradicts a control, nothing is written · 2 could not run: no table,
// no binary or pogoq failed, nothing is written.
//
// pogoq prints the value of the position AFTER each move, for the player who
// moves next. `Win(d)` there means that player wins in d plies, so whoever
// chose the move loses in d + 1 plies, counting the move itself; `Loss(d)`
// means the chooser wins in d + 1; `Draw` keeps the draw. The controls below
// (the article's figures and docs/experiments/v3-solve/answers.json) check
// that mapping before anything is written.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as wasm from 'pogofish-wasm';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const POGOQ = here('../../target/release/pogoq');
const TABLE_DIR = process.env.POGOFISH_TABLE ?? here('../../models/v3-solve');
const OUT = here('../public/data/table.json');

class Finding extends Error {}
class CannotRun extends Error {}

const check = (condition, message) => {
  if (!condition) throw new Finding(message);
};

const cellName = (i) => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;
const moveName = ([from, n, to]) => `${cellName(from)}-${n}-${cellName(to)}`;
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function parseValue(text) {
  if (text === 'Draw' || text === 'Over') return { kind: text };
  const m = /^(Win|Loss)\((\d+)\)$/.exec(text);
  if (!m) throw new CannotRun(`unreadable pogoq value "${text}"`);
  return { kind: m[1], d: Number(m[2]) };
}

function pogoq(mode, prefix, max) {
  const args = [TABLE_DIR, mode, JSON.stringify(prefix), ...(max === undefined ? [] : [String(max)])];
  try {
    return execFileSync(POGOQ, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new CannotRun(`pogoq ${mode} ${JSON.stringify(prefix)} failed: ${error.message}`);
  }
}

/** The mover's value after `prefix`, and the value of each resulting position. */
function values(prefix) {
  const lines = pogoq('values', prefix).trim().split('\n');
  const head = /^position value for mover: (.+)$/.exec(lines[0]);
  if (!head) throw new CannotRun(`unexpected pogoq output: ${lines[0]}`);
  const moves = lines.slice(1).map((line) => {
    const m = /^(\d+) (\d) (\d+) -> opponent (.+)$/.exec(line);
    if (!m) throw new CannotRun(`unexpected pogoq output: ${line}`);
    return { move: [Number(m[1]), Number(m[2]), Number(m[3])], child: parseValue(m[4]) };
  });
  return { mover: parseValue(head[1]), moves };
}

function line(prefix) {
  const out = pogoq('line', prefix).split('\n');
  const found = out.find((l) => l.startsWith('LINE '));
  const status = out.find((l) => l.startsWith('final status '));
  if (!found || !status) throw new CannotRun('pogoq line printed no LINE or no final status');
  return { moves: JSON.parse(found.slice(5)), status: status.slice('final status '.length).trim() };
}

/** The verdict of a move for the player who chose it, from the value after it. */
function verdict(child, move) {
  if (child.kind === 'Draw') return { kind: 'keeps-draw' };
  if (child.kind === 'Win') return { kind: 'loses-in', plies: child.d + 1 };
  if (child.kind === 'Loss') return { kind: 'wins-in', plies: child.d + 1 };
  throw new Finding(`${moveName(move)} leads to a position the table calls ${child.kind}`);
}

const verdicts = (prefix) =>
  values(prefix).moves.map(({ move, child }) => ({ move, verdict: verdict(child, move) }));

function play(state, [from, n, to]) {
  return wasm.apply_move(state, { from_cell: from, num_pieces: n, to_cell: to });
}
const replay = (moves) => moves.reduce((s, m) => play(s, m), wasm.initial_state());

function extract() {
  if (!existsSync(POGOQ)) throw new CannotRun(`no pogoq binary at ${POGOQ}; run cargo build --release -p pogoq`);
  if (!existsSync(`${TABLE_DIR}/table.bin`)) throw new CannotRun(`no solved table at ${TABLE_DIR}/table.bin`);
  wasm.initSync({ module: readFileSync(here('../../wasm-pkg/pogofish_wasm_bg.wasm')) });

  const openings = verdicts([]);
  const replies = {};
  for (const { move } of openings) replies[moveName(move)] = verdicts([move]);

  // Controls against the article and the committed answers of the solve.
  const answers = JSON.parse(readFileSync(here('../../docs/experiments/v3-solve/answers.json'), 'utf8'));
  check(answers.first_moves.length === openings.length, 'answers.json lists another number of openings');
  for (const a of answers.first_moves) {
    const mine = openings.find((o) => moveName(o.move) === a.move);
    check(mine !== undefined, `answers.json move ${a.move} is not an opening`);
    const expected =
      a.for_white.value === 'draw'
        ? { kind: 'keeps-draw' }
        : { kind: a.for_white.value === 'loss' ? 'loses-in' : 'wins-in', plies: a.for_white.plies };
    check(sameJson(mine.verdict, expected), `${a.move}: table says ${JSON.stringify(mine.verdict)}, answers.json says ${JSON.stringify(expected)}`);
  }
  const verdictOf = (list, name) => list.find((o) => moveName(o.move) === name)?.verdict;
  check(sameJson(verdictOf(openings, 'a1-2-b2'), { kind: 'loses-in', plies: 12 }), 'a1-2-b2 does not lose in 12');
  check(sameJson(verdictOf(openings, 'c1-2-b2'), { kind: 'loses-in', plies: 12 }), 'c1-2-b2 does not lose in 12');
  check(sameJson(verdictOf(openings, 'b1-1-b2'), { kind: 'loses-in', plies: 16 }), 'b1-1-b2 does not lose in 16');
  const keeps = openings.filter((o) => o.verdict.kind === 'keeps-draw');
  check(keeps.length === 6 && keeps.every((o) => o.move[2] < 3), 'six openings should keep the draw, all on the back row');
  const afterC1B1 = replies['c1-1-b1'].filter((r) => r.verdict.kind === 'keeps-draw').map((r) => moveName(r.move));
  check(sameJson(afterC1B1.sort(), ['a3-1-b3', 'c3-1-b3']), `after c1-1-b1 the draw-keeping replies are ${afterC1B1}`);

  // The retrograde-analysis scene of tools/article-visuals/scene2.mjs.
  const toC = [[0, 2, 4], [6, 2, 4], [1, 1, 0], [7, 1, 4], [0, 1, 3], [4, 1, 3], [1, 1, 4], [7, 1, 4], [2, 1, 1], [3, 2, 1]];
  const toB = [...toC, [2, 1, 1]];
  const toB2 = [...toC, [2, 1, 5]];
  const toA = [...toB, [4, 3, 1]];
  const toA2 = [...toB2, [8, 1, 5]];
  const isValue = (v, kind, d) => v.kind === kind && v.d === d;
  for (const [name, prefix] of [['A', toA], ['A2', toA2]]) {
    check(isValue(values(prefix).mover, 'Loss', 0), `${name} is not lost in 0`);
  }
  for (const [name, prefix, win] of [['B', toB, [4, 3, 1]], ['B2', toB2, [8, 1, 5]]]) {
    const v = values(prefix);
    check(isValue(v.mover, 'Win', 1), `${name} is not won in 1`);
    const found = v.moves.find((m) => sameJson(m.move, win));
    check(found !== undefined && isValue(found.child, 'Loss', 0), `${name}: ${moveName(win)} does not reach a lost-in-0 position`);
  }
  const c = values(toC);
  check(isValue(c.mover, 'Loss', 2), 'C is not lost in 2');
  check(c.moves.length === 2 && c.moves.every((m) => isValue(m.child, 'Win', 1)), 'C should have two moves, each to a won-in-1 position');
  check(sameJson(c.moves.map((m) => m.move), [[2, 1, 1], [2, 1, 5]]), 'C moves are not c1-1-b1 and c1-1-b3 in order');
  const retro = [
    { label: 'lost-0', positions: [{ state: replay(toA) }, { state: replay(toA2) }] },
    {
      label: 'won-1',
      positions: [
        { state: replay(toB), moves: [{ move: [4, 3, 1], to: 0 }] },
        { state: replay(toB2), moves: [{ move: [8, 1, 5], to: 1 }] },
      ],
    },
    {
      label: 'lost-2',
      positions: [{ state: replay(toC), moves: [{ move: [2, 1, 1], to: 0 }, { move: [2, 1, 5], to: 1 }] }],
    },
  ];

  // Lines. The shortest win is the first of the four three-ply White wins that
  // tools/article-visuals/shortest.mjs lists.
  const shortestWin = [[1, 2, 7], [6, 2, 8], [2, 2, 8]];
  check(isValue(values(shortestWin).mover, 'Loss', 0), 'after shortestWin the mover is not lost in 0');
  check(wasm.winner_with_rules(replay(shortestWin), 'Uncapped') === 'W', 'shortestWin is not a White win');
  const loop = [[0, 1, 1], [6, 1, 3], [1, 1, 0], [3, 1, 6]];
  check(sameJson(replay(loop).cells, wasm.initial_state().cells), 'loop does not return to the initial position');
  const centre = line([[0, 2, 4]]);
  check(centre.status === 'Lost' && centre.moves.length === 12, `centreLoss ends ${centre.status} after ${centre.moves.length} plies`);
  const fixtureWin = JSON.parse(readFileSync(here('../fixtures/lines.json'), 'utf8')).openingWin;
  const openingWin = line([[2, 1, 1], [7, 2, 1]]);
  check(sameJson(openingWin.moves, fixtureWin), 'openingWin differs from figures/fixtures/lines.json');

  return {
    game: 'A',
    source: 'models/v3-solve/table.bin read with pogoq (tools/article-visuals/pogoq); every verdict is for the player who chose the move',
    openings,
    replies,
    retro,
    lines: { shortestWin, loop, centreLoss: centre.moves, openingWin: openingWin.moves },
  };
}

try {
  const data = extract();
  writeFileSync(OUT, `${JSON.stringify(data)}\n`);
  console.log(`table-extract: wrote ${OUT}`);
} catch (error) {
  if (error instanceof Finding) {
    console.error(`table-extract: finding, nothing written: ${error.message}`);
    process.exit(1);
  }
  console.error(`table-extract: could not run, nothing written: ${error.message}`);
  process.exit(2);
}
