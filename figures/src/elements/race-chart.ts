// What <pogo-race> draws, apart from the DOM: every program's measured score
// against greedy at each stage of its training, placed by games trained on a
// log10 axis, with the three references as horizontal lines. Stage 0 has zero
// games, which a log axis cannot place: it goes in a separate column, detached
// from the axis. Nothing is interpolated: a point is a stage of V5Data, with
// its score and interval as the data gives them. Positions are fractions of
// the plot's box (x from its left, y from its bottom = the score itself), so
// the element places them by percentage and never reads layout.
import type { Program, Score, V5Data } from '../data';

/** Drawing order, and the order the figure names them in. */
export const RACE_PROGRAMS = ['az100', 'az0', 'td', 'qtab'] as const satisfies readonly Program[];
export type RaceProgram = (typeof RACE_PROGRAMS)[number];

export type ReferenceKey = 'table' | 'greedy' | 'random';
const REFERENCES: readonly ReferenceKey[] = ['table', 'greedy', 'random'];

/** Room left at each end of the log axis so a marker on the first or last stage is not cut. */
const PAD = 0.04;

export interface RacePoint extends Score {
  pct: number;
  gamesTrained: number;
  /** `zero`: stage 0, in the detached column; `log`: on the log axis. */
  column: 'zero' | 'log';
  /** 0–1 across its column's box; in the zero column, each program's own slot. */
  x: number;
  /** 0–1 up the plot: the score. */
  y: number;
  lo: number;
  hi: number;
}

export interface RaceSeries {
  program: RaceProgram;
  points: RacePoint[];
  /** The first measured stage whose whole 95 % interval lies above greedy's score; null if none. */
  firstAbove: RacePoint | null;
}

export interface RaceReference extends Score {
  key: ReferenceKey;
  y: number;
}

export interface RaceChart {
  series: RaceSeries[];
  references: RaceReference[];
  axis: {
    /** log10 of the smallest and largest positive games trained. */
    from: number;
    to: number;
    /** The box fraction one decade takes. */
    perDecade: number;
    /** Every power of ten within the data's range, and its place. */
    ticks: { games: number; x: number }[];
  };
}

/**
 * The first stage whose whole interval lies above `greedy` (greedy's own score): the
 * rule v5video.mjs used for the race's closing caption. The score alone above greedy's
 * would name the same stage for every program of round 5 (race-chart.test.ts).
 */
export function firstAboveGreedy<T extends { ci95: readonly [number, number] }>(stages: readonly T[], greedy: number): T | null {
  return stages.find((s) => s.ci95[0] > greedy) ?? null;
}

const inUnit = (x: number): boolean => Number.isFinite(x) && x >= 0 && x <= 1;

function checkScore(name: string, s: Score): void {
  const [lo, hi] = s.ci95;
  if (!inUnit(s.score) || !inUnit(lo) || !inUnit(hi) || lo > s.score || s.score > hi) {
    throw new Error(`pogo-race: ${name} has a score or interval outside 0–1 (${s.score} [${lo}, ${hi}])`);
  }
}

export function raceChart(d: Pick<V5Data, 'programs' | 'references'>): RaceChart {
  for (const key of REFERENCES) checkScore(`reference ${key}`, d.references[key]);
  for (const program of RACE_PROGRAMS) {
    const stages = d.programs[program].stages;
    if (stages.length === 0) throw new Error(`pogo-race: ${program} has no stages`);
    stages.forEach((s, i) => {
      checkScore(`${program} stage ${s.pct}`, s);
      const zero = i === 0;
      if ((s.gamesTrained === 0) !== zero || !Number.isInteger(s.gamesTrained) || s.gamesTrained < 0) {
        throw new Error(`pogo-race: ${program}: only its first stage may have 0 games trained (stage ${s.pct}: ${s.gamesTrained})`);
      }
      if (i > 0 && s.gamesTrained <= stages[i - 1]!.gamesTrained) {
        throw new Error(`pogo-race: ${program}: games trained do not increase at stage ${s.pct}`);
      }
    });
  }

  const positive = RACE_PROGRAMS.flatMap((p) => d.programs[p].stages.map((s) => s.gamesTrained)).filter((g) => g > 0);
  if (positive.length === 0) throw new Error('pogo-race: no stage has been trained');
  const from = Math.log10(Math.min(...positive));
  const to = Math.log10(Math.max(...positive));
  const span = Math.max(to - from, 1);
  const perDecade = (1 - 2 * PAD) / span;
  const xOf = (games: number): number => PAD + (Math.log10(games) - from) * perDecade;

  const series = RACE_PROGRAMS.map((program, slot): RaceSeries => {
    const points = d.programs[program].stages.map(
      (s): RacePoint => ({
        pct: s.pct,
        gamesTrained: s.gamesTrained,
        score: s.score,
        ci95: s.ci95,
        column: s.gamesTrained === 0 ? 'zero' : 'log',
        x: s.gamesTrained === 0 ? (slot + 1) / (RACE_PROGRAMS.length + 1) : xOf(s.gamesTrained),
        y: s.score,
        lo: s.ci95[0],
        hi: s.ci95[1],
      }),
    );
    return { program, points, firstAbove: firstAboveGreedy(points, d.references.greedy.score) };
  });

  const ticks: { games: number; x: number }[] = [];
  for (let e = Math.ceil(from - 1e-9); e <= Math.floor(to + 1e-9); e++) ticks.push({ games: 10 ** e, x: xOf(10 ** e) });

  return {
    series,
    references: REFERENCES.map((key) => ({ key, score: d.references[key].score, ci95: d.references[key].ci95, y: d.references[key].score })),
    axis: { from, to, perDecade, ticks },
  };
}

// ---------------------------------------------------------------- the race
//
// <pogo-race> runs the chart as a race: one clock sweeps the log axis from its
// left edge, stopping at every measured number of games (an event); each line
// is drawn up to the clock and its name rides its head. Nothing here invents a
// value: an event is a measured stage's games, the value shown for a program is
// its last stage reached, and a head between two stages is only where its
// straight segment is drawn.

export interface RaceEvent {
  /** Games trained at this stop; 0 for the start, before any training. */
  games: number;
  /** Its place across the log box, 0–1; the start is the box's left edge. */
  x: number;
}

/** The start, then every games-trained count measured for any program, in order. */
export function raceEvents(chart: RaceChart): RaceEvent[] {
  const seen = new Map<number, number>();
  for (const s of chart.series) for (const p of s.points) if (p.column === 'log') seen.set(p.gamesTrained, p.x);
  const events = [...seen].sort((a, b) => a[0] - b[0]).map(([games, x]) => ({ games, x }));
  return [{ games: 0, x: 0 }, ...events];
}

/** The program's last stage reached by `games` trained: stage 0 until its first measured stage. */
export function lastReached(s: RaceSeries, games: number): RacePoint {
  let last = s.points[0]!;
  for (const p of s.points) if (p.gamesTrained <= games) last = p;
  return last;
}

/**
 * Where the program's line ends when drawn up to `x` (0–1 across the log box): on its
 * straight segment there, at its last stage past it; null before its first stage on the axis.
 */
export function headAt(s: RaceSeries, x: number): { x: number; y: number } | null {
  const on = s.points.filter((p) => p.column === 'log');
  if (on.length === 0 || x < on[0]!.x - 1e-12) return null;
  for (let k = 1; k < on.length; k++) {
    const a = on[k - 1]!;
    const b = on[k]!;
    if (x <= b.x) return { x, y: a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y) };
  }
  const end = on.at(-1)!;
  return { x: end.x, y: end.y };
}

/** The programs in the order their whole interval first clears greedy's line, the ones that never do last. */
export function crossingOrder(chart: RaceChart): RaceSeries[] {
  const crossed = chart.series.filter((s) => s.firstAbove).sort((a, b) => a.firstAbove!.gamesTrained - b.firstAbove!.gamesTrained);
  return [...crossed, ...chart.series.filter((s) => !s.firstAbove)];
}

/** The event at which a program's crossing lands: its first stage above greedy, or the race's end for one that never crosses. */
export function crossingEvent(events: readonly RaceEvent[], s: RaceSeries): number {
  if (!s.firstAbove) return events.length - 1;
  return events.findIndex((e) => e.games === s.firstAbove!.gamesTrained);
}
