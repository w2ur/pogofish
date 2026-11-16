// What <pogo-mosaic> shows, apart from the DOM: for one program, each stage's
// first 100 games of its bench against greedy (public/data/v5.json, seed 1),
// one square per game in the data's order, 20 to a row, and the stage's
// totals summed from those games. A game's mark says what was judged of the
// program's moves: at least one mistake; none (every judged move kept the
// exact value); or nothing judged (every move was played from a position
// already lost). The mistake share is mistakes over judged moves, the rule of
// scripts/pack-v5.mjs and tools/article-visuals/v5sheets.mjs.
import type { Score, V5Data, V5Mosaic } from '../data';
import { SOURCES } from '../kit/figure';

export const MOSAIC_PROGRAMS = ['az100', 'td', 'qtab'] as const;
export type MosaicProgram = (typeof MOSAIC_PROGRAMS)[number];

export const MOSAIC_COLUMNS = 20;
const GAMES = 100;

export type GameMark = 'mistake' | 'clean' | 'none-judged';

export function gameMark(g: V5Mosaic['games'][number]): GameMark {
  if (g.mistakes > 0) return 'mistake';
  return g.judged > 0 ? 'clean' : 'none-judged';
}

export interface MosaicSquare {
  result: 'win' | 'loss';
  mark: GameMark;
  col: number;
  row: number;
}

export interface MosaicStage extends Score {
  pct: number;
  gamesTrained: number;
  squares: MosaicSquare[];
  games: number;
  wins: number;
  mistakes: number;
  judged: number;
  /** mistakes / judged. */
  share: number;
}

export function mosaicStages(d: Pick<V5Data, 'stagesPct' | 'mosaics' | 'programs'>, program: MosaicProgram): MosaicStage[] {
  const mosaics = d.mosaics[program];
  const stages = d.programs[program].stages;
  if (mosaics.length !== d.stagesPct.length || stages.length !== d.stagesPct.length) {
    throw new Error(`pogo-mosaic: ${program} has ${mosaics.length} mosaics for ${d.stagesPct.length} stages`);
  }
  return mosaics.map((m, i) => {
    const stage = stages[i]!;
    if (m.pct !== d.stagesPct[i] || stage.pct !== m.pct) {
      throw new Error(`pogo-mosaic: ${program} mosaic ${i} is stage ${m.pct}, not ${d.stagesPct[i]}`);
    }
    if (m.games.length !== GAMES) throw new Error(`pogo-mosaic: ${program} stage ${m.pct} has ${m.games.length} games, not ${GAMES}`);
    let wins = 0;
    let mistakes = 0;
    let judged = 0;
    const squares = m.games.map((g, k): MosaicSquare => {
      if (!Number.isInteger(g.mistakes) || !Number.isInteger(g.judged) || g.mistakes < 0 || g.mistakes > g.judged) {
        throw new Error(`pogo-mosaic: ${program} stage ${m.pct} game ${k}: ${g.mistakes} mistakes of ${g.judged} judged`);
      }
      if (g.result === 'win') wins++;
      mistakes += g.mistakes;
      judged += g.judged;
      return { result: g.result, mark: gameMark(g), col: k % MOSAIC_COLUMNS, row: Math.floor(k / MOSAIC_COLUMNS) };
    });
    if (judged === 0) throw new Error(`pogo-mosaic: ${program} stage ${m.pct} judged no move`);
    return {
      pct: m.pct,
      gamesTrained: stage.gamesTrained,
      score: stage.score,
      ci95: stage.ci95,
      squares,
      games: GAMES,
      wins,
      mistakes,
      judged,
      share: mistakes / judged,
    };
  });
}

/**
 * What the label cites once the data is loaded: the data's own source and the
 * directory of the mosaic files, derived from every mosaic's `source` path.
 * Throws when they do not share one directory.
 */
export function mosaicSource(d: Pick<V5Data, 'source' | 'mosaics'>): string {
  const paths = MOSAIC_PROGRAMS.flatMap((p) => d.mosaics[p].map((m) => m.source));
  const dirs = new Set(paths.map((s) => s.slice(0, s.lastIndexOf('/') + 1)));
  const [dir] = [...dirs];
  if (dirs.size !== 1 || !dir) throw new Error(`pogo-mosaic: the mosaics are not in one directory (${[...dirs].join(', ')})`);
  return `${d.source}${SOURCES}${dir}`;
}
