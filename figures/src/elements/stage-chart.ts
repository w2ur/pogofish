// What <pogo-stages> draws beside its board, apart from the DOM: the program's
// measured score against the greedy player at each stage of its training
// (public/data/v5.json), the stages evenly spaced in the order the data gives
// them, with the three references as horizontal lines; and the figure's play as
// one list of steps, every stage's game one after the other. Nothing is
// interpolated: a point is a stage, with its score and interval as the data
// gives them. Positions are fractions of the plot's box (x from its left, y
// from its bottom = the score itself), so the element places them by
// percentage and never reads layout.
import type { Score, V5Data } from '../data';
import type { ReferenceKey } from './race-chart';
import type { StageProgram } from './stage-view';

/** Top to bottom, as the scores stand. */
const REFERENCES: readonly ReferenceKey[] = ['table', 'greedy', 'random'];

export interface StagePoint extends Score {
  pct: number;
  gamesTrained: number;
  /** 0–1 across the box: the middle of the stage's slot. */
  x: number;
  /** 0–1 up the box: the score. */
  y: number;
}

export interface StageChart {
  points: StagePoint[];
  references: { key: ReferenceKey; score: number; y: number }[];
}

const inUnit = (x: number): boolean => Number.isFinite(x) && x >= 0 && x <= 1;

function check(name: string, s: Score): void {
  const [lo, hi] = s.ci95;
  if (!inUnit(s.score) || !inUnit(lo) || !inUnit(hi) || lo > s.score || s.score > hi) {
    throw new Error(`pogo-stages: ${name} has a score or interval outside 0–1 (${s.score} [${lo}, ${hi}])`);
  }
}

export function stageChart(d: Pick<V5Data, 'programs' | 'references' | 'stagesPct'>, program: StageProgram): StageChart {
  for (const key of REFERENCES) check(`reference ${key}`, d.references[key]);
  const n = d.stagesPct.length;
  const points = d.stagesPct.map((pct, k): StagePoint => {
    const stage = d.programs[program].stages.find((s) => s.pct === pct);
    if (!stage) throw new Error(`pogo-stages: ${program} has no stage ${pct}`);
    check(`${program} stage ${pct}`, stage);
    return { pct, gamesTrained: stage.gamesTrained, score: stage.score, ci95: stage.ci95, x: (k + 0.5) / n, y: stage.score };
  });
  return { points, references: REFERENCES.map((key) => ({ key, score: d.references[key].score, y: d.references[key].score })) };
}

export interface StageStep {
  /** Index of the stage, and of the position in its game (0: before its first move). */
  stage: number;
  ply: number;
  /** The last position of the stage's game. */
  end: boolean;
}

export interface StageScript {
  steps: StageStep[];
  /** The step each stage's game starts on. */
  starts: number[];
}

/** Every stage's game, one after the other: `lengths[k]` positions for stage k. */
export function stageScript(lengths: readonly number[]): StageScript {
  const steps: StageStep[] = [];
  const starts: number[] = [];
  lengths.forEach((n, stage) => {
    if (n < 2) throw new Error(`pogo-stages: the game of stage ${stage} has no move`);
    starts.push(steps.length);
    for (let ply = 0; ply < n; ply++) steps.push({ stage, ply, end: ply === n - 1 });
  });
  return { steps, starts };
}
