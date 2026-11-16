import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadReach,
  loadTable,
  loadV5,
  type ReachData,
  type RetroStep,
  type TableData,
  type V5Data,
  type Verdict,
} from './data';
import { LC1_2, initial, legal, moveName, parseMoveName, play, replay, terminal, winner, type State, type Triple } from './engine';

// Paths anchor on the working directory (figures/), as in nets.test.ts.
const read = (path: string): Buffer => readFileSync(resolve(process.cwd(), path));
const json = <T>(path: string): T => JSON.parse(read(path).toString()) as T;

const table = json<TableData>('public/data/table.json');
const v5 = json<V5Data>('public/data/v5.json');
const reach = json<ReachData>('public/data/reach.json');
const budget = Object.fromEntries(
  Object.entries(json<Record<string, unknown>>('budget.json')).filter(([k]) => !k.startsWith('_')),
) as Record<string, { gzip: number; raw?: number }>;

const triples = (moves: { move: Triple }[]): Triple[] => moves.map((m) => m.move);
const verdictOf = (moves: { move: Triple; verdict: Verdict }[], name: string): Verdict => {
  const found = moves.find((m) => moveName(m.move) === name);
  if (!found) throw new Error(`no move ${name}`);
  return found.verdict;
};

/** Plays every move of `line` from `from`, failing on the first illegal one. */
function playLine(line: Triple[], from: State = initial()): State {
  let s = from;
  line.forEach((m, i) => {
    const allowed = legal(s).map((l) => moveName([l.from_cell, l.num_pieces, l.to_cell]));
    expect(allowed, `ply ${i + 1}: ${moveName(m)}`).toContain(moveName(m));
    s = play(s, m);
  });
  return s;
}

describe('the solved-table extract', () => {
  it('is for game A and lists the 16 opening moves in engine order', () => {
    expect(table.game).toBe('A');
    expect(triples(table.openings)).toEqual(legal(initial()).map((m) => [m.from_cell, m.num_pieces, m.to_cell]));
  });

  it('exactly 6 of 16 openings keep the draw and all 6 stay on the mover\'s back row', () => {
    const keeps = table.openings.filter((o) => o.verdict.kind === 'keeps-draw');
    expect(keeps).toHaveLength(6);
    // White's back row is cells 0..2 (row 1).
    for (const o of keeps) expect(o.move[2], moveName(o.move)).toBeLessThan(3);
    // The ten others all lose, none wins.
    expect(table.openings.filter((o) => o.verdict.kind === 'loses-in')).toHaveLength(10);
  });

  it('after c1-1-b1, exactly 2 of 16 replies keep the draw (a3-1-b3, c3-1-b3)', () => {
    const replies = table.replies['c1-1-b1']!;
    expect(replies).toHaveLength(16);
    const keeps = replies.filter((r) => r.verdict.kind === 'keeps-draw').map((r) => moveName(r.move));
    expect(keeps.sort()).toEqual(['a3-1-b3', 'c3-1-b3']);
  });

  it('a1-2-b2 and c1-2-b2 lose in 12, b1-1-b2 in 16', () => {
    expect(verdictOf(table.openings, 'a1-2-b2')).toEqual({ kind: 'loses-in', plies: 12 });
    expect(verdictOf(table.openings, 'c1-2-b2')).toEqual({ kind: 'loses-in', plies: 12 });
    expect(verdictOf(table.openings, 'b1-1-b2')).toEqual({ kind: 'loses-in', plies: 16 });
  });

  it('all 16 opening verdicts equal the committed solve answers', () => {
    const answers = json<{
      first_moves: { move: string; for_white: { value: 'draw' | 'loss' | 'win'; plies?: number } }[];
    }>('../docs/experiments/v3-solve/answers.json').first_moves;
    expect(answers).toHaveLength(16);
    for (const a of answers) {
      const expected: Verdict =
        a.for_white.value === 'draw'
          ? { kind: 'keeps-draw' }
          : { kind: a.for_white.value === 'loss' ? 'loses-in' : 'wins-in', plies: a.for_white.plies! };
      expect(verdictOf(table.openings, a.move), a.move).toEqual(expected);
    }
  });

  it('keys its replies by every opening and each reply list is the engine\'s legal list', () => {
    expect(Object.keys(table.replies).sort()).toEqual(table.openings.map((o) => moveName(o.move)).sort());
    for (const o of table.openings) {
      const after = play(initial(), o.move);
      expect(triples(table.replies[moveName(o.move)]!), moveName(o.move)).toEqual(
        legal(after).map((m) => [m.from_cell, m.num_pieces, m.to_cell]),
      );
    }
  });
});

describe('the stored lines', () => {
  it('openingWin equals fixtures/lines.json', () => {
    expect(table.lines.openingWin).toEqual(json<{ openingWin: Triple[] }>('fixtures/lines.json').openingWin);
  });

  it('every stored line replays legally through the engine', () => {
    for (const [name, line] of Object.entries(table.lines)) {
      expect(line.length, name).toBeGreaterThan(0);
      playLine(line);
    }
  });

  it('centreLoss starts with a1-2-b2 and ends with every stack Red, in 12 plies', () => {
    const line = table.lines.centreLoss;
    expect(line[0]).toEqual(parseMoveName('a1-2-b2'));
    expect(line).toHaveLength(12);
    const end = playLine(line);
    expect(terminal(end, null)).toBe(true);
    expect(winner(end, null)).toBe('R');
    for (const stack of end.cells) if (stack.length > 0) expect(stack[stack.length - 1]).toBe('Red');
  });

  it('shortestWin is a three-ply White win and loop returns to the initial position', () => {
    const win = playLine(table.lines.shortestWin);
    expect(table.lines.shortestWin).toHaveLength(3);
    expect(winner(win, null)).toBe('W');
    expect(table.lines.loop).toEqual([[0, 1, 1], [6, 1, 3], [1, 1, 0], [3, 1, 6]]);
    const states = replay(table.lines.loop);
    expect(states[4]!.cells).toEqual(states[0]!.cells);
  });
});

describe('the retrograde-analysis steps', () => {
  const [lost0, won1, lost2] = table.retro as [RetroStep, RetroStep, RetroStep];
  const sameBoard = (a: State, b: State): boolean => JSON.stringify(a) === JSON.stringify(b);

  it('has the three steps in order', () => {
    expect(table.retro.map((r) => r.label)).toEqual(['lost-0', 'won-1', 'lost-2']);
    expect([lost0.positions.length, won1.positions.length, lost2.positions.length]).toEqual([2, 2, 1]);
  });

  it('lost-0: the player to move owns no stack top, so the game is over and the other side won', () => {
    for (const p of lost0.positions) {
      expect(terminal(p.state, null)).toBe(true);
      expect(winner(p.state, null)).toBe(p.state.to_move === 'White' ? 'R' : 'W');
      expect(p.moves).toBeUndefined();
    }
  });

  it('every stored move is legal and lands on the position its `to` names', () => {
    for (const [step, previous] of [[won1, lost0], [lost2, won1]] as const) {
      for (const p of step.positions) {
        expect(p.moves!.length).toBeGreaterThan(0);
        for (const { move, to } of p.moves!) {
          const next = playLine([move], p.state);
          expect(sameBoard(next, previous.positions[to]!.state), `${step.label} ${moveName(move)}`).toBe(true);
        }
      }
    }
  });

  it('lost-2 stores every legal move of its position', () => {
    const c = lost2.positions[0]!;
    expect(triples(c.moves!)).toEqual(legal(c.state).map((m) => [m.from_cell, m.num_pieces, m.to_cell]));
  });
});

describe('the reach counts', () => {
  it('first-seen counts per ply are the measured ones', () => {
    expect(reach.firstSeenAtPly).toEqual([
      1, 16, 240, 2579, 26706, 201608, 1372735, 6493763, 22725973, 50327416, 68847740, 53976921, 21775627, 4003051,
      258792, 2460,
    ]);
    expect(reach.positionsTotal).toBe(232792560);
    expect(reach.reachable).toBe(230015628);
  });

  it('equals the committed solve report and its plies add up to the reachable count', () => {
    const report = json<{ positions_total: number; reachable: number; reachable_first_seen_at_ply: number[] }>(
      '../docs/experiments/v3-solve/reach.json',
    );
    expect(reach.positionsTotal).toBe(report.positions_total);
    expect(reach.reachable).toBe(report.reachable);
    expect(reach.firstSeenAtPly).toEqual(report.reachable_first_seen_at_ply);
    expect(reach.firstSeenAtPly.reduce((a, b) => a + b, 0)).toBe(reach.reachable);
  });
});

describe('the round-5 data', () => {
  interface Curves {
    stages_pct: number[];
    rules: string;
    references: V5Data['references'];
    programs: Record<
      string,
      {
        label: string;
        seeds: Record<string, { pct: number; games_trained: number; score: number; ci95: [number, number] }[]>;
      }
    >;
    mosaics: Record<string, { pct: number; wins: number; mistakes: number; judged: number; results: string[] }[]>;
  }
  const curves = json<Curves>('../docs/experiments/v5/curves.json');

  it('v5 stage scores equal curves.json (seed 1)', () => {
    expect(v5.rules).toBe('lc1-2');
    expect(v5.stagesPct).toEqual(curves.stages_pct);
    expect(v5.references).toEqual(curves.references);
    expect(Object.keys(v5.programs).sort()).toEqual(['az0', 'az100', 'qtab', 'td']);
    for (const [key, program] of Object.entries(v5.programs)) {
      const source = curves.programs[key]!;
      expect(program.label).toBe(source.label);
      expect(program.stages).toHaveLength(curves.stages_pct.length);
      program.stages.forEach((stage, i) => {
        const s = source.seeds['1']![i]!;
        expect([stage.pct, stage.gamesTrained, stage.score, stage.ci95], `${key} stage ${i}`).toEqual([
          s.pct,
          s.games_trained,
          s.score,
          s.ci95,
        ]);
      });
    }
  });

  it('each stage game replays legally under lc1-2 to the result the file states', () => {
    for (const [key, program] of Object.entries(v5.programs)) {
      for (const stage of program.stages) {
        const end = playLine(stage.game);
        const w = winner(end, LC1_2);
        expect(terminal(end, LC1_2), `${key} ${stage.pct}`).toBe(true);
        expect(w === (stage.playerColour === 'White' ? 'W' : 'R') ? 'win' : 'loss', `${key} ${stage.pct}`).toBe(
          stage.result,
        );
        expect(stage.source.bench).toContain(`${key}-s1-`);
        expect(stage.source.game).toContain(`${key}-s1-`);
        const file = json<{ opening_plies: number }>(`../${stage.source.game}`);
        expect(stage.openingPlies, `${key} ${stage.pct}`).toBe(file.opening_plies);
      }
    }
  });

  it('each mosaic stage has 100 games whose wins and mistake counts equal curves.json', () => {
    expect(Object.keys(v5.mosaics).sort()).toEqual(['az100', 'qtab', 'td']);
    for (const [key, stages] of Object.entries(v5.mosaics)) {
      expect(stages.map((m) => m.pct)).toEqual(curves.stages_pct);
      stages.forEach((m, i) => {
        const c = curves.mosaics[key]![i]!;
        expect(m.games, `${key} ${m.pct}`).toHaveLength(100);
        expect(m.games.map((g) => g.result)).toEqual(c.results);
        expect(m.games.filter((g) => g.result === 'win').length).toBe(c.wins);
        expect(m.games.reduce((a, g) => a + g.mistakes, 0)).toBe(c.mistakes);
        expect(m.games.reduce((a, g) => a + g.judged, 0)).toBe(c.judged);
        for (const g of m.games) expect(g.mistakes).toBeLessThanOrEqual(g.judged);
      });
    }
  });

  it('the packed date is the one the pack script derives (curves.json’s commit date)', async () => {
    // The pack script's own helper, so the test cannot drift from it. It throws on a
    // shallow clone, whose last commit is not the file's: CI checks out full history.
    const helper = resolve(process.cwd(), 'scripts/v5-date.mjs');
    const { curvesDate } = (await import(/* @vite-ignore */ helper)) as { curvesDate: (root: string) => string };
    expect(v5.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(v5.asOf).toBe(curvesDate(resolve(process.cwd(), '..')));
  });
});

describe('the budgets', () => {
  const files = readdirSync(resolve(process.cwd(), 'public/data')).filter((f) => f.endsWith('.json'));

  it('every packed file has a budget and every budget a file', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.sort()).toEqual(Object.keys(budget).sort());
  });

  it('each data file is under its budget.json size (gzip bytes)', () => {
    for (const f of files) {
      const size = gzipSync(read(`public/data/${f}`)).length;
      expect(size, `${f}: ${size} gzip bytes`).toBeLessThanOrEqual(budget[f]!.gzip);
      const raw = budget[f]!.raw;
      if (raw !== undefined) expect(read(`public/data/${f}`).length, `${f} raw bytes`).toBeLessThanOrEqual(raw);
    }
  });
});

describe('the loaders', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('return the parsed file', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(reach)));
    expect(await loadReach('/data/reach.json')).toEqual(reach);
    expect(typeof loadTable).toBe('function');
    expect(typeof loadV5).toBe('function');
  });

  it('name the url and the status when the fetch fails', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(loadTable('/data/table.json')).rejects.toThrow('/data/table.json (404)');
  });
});
