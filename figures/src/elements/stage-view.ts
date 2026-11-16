// What <pogo-stages> shows of one learning program, apart from the DOM: which
// program the attribute names, a stage's measured score written as the data
// gives it, and the stage's game replayed through the engine under lc1-2,
// refused if it does not end as the data says.
import type { Score, V5Stage } from '../data';
import { LC1_2 } from '../engine';
import type { Lang } from '../kit/strings';
import { lineFrames, type Frame } from './line-frames';

export type StageProgram = 'qtab' | 'td' | 'az100';

const PROGRAMS: readonly StageProgram[] = ['qtab', 'td', 'az100'];

export function parseProgram(attr: string | null): StageProgram {
  const found = PROGRAMS.find((p) => p === attr);
  if (!found) throw new Error(`pogo-stages: program must be qtab, td or az100, not ${JSON.stringify(attr)}`);
  return found;
}

/**
 * The shown game opens on the bench arena's first opening: four random moves
 * that do not end the game, then the program plays White against greedy
 * (docs/experiments/v5-video.md, « The game shown »). The data does not carry
 * the count, hence this constant.
 */
export const OPENING_PLIES = 4;

const decimal = (lang: Lang, s: string): string => (lang === 'fr' ? s.replace('.', ',') : s);

/** A score with the digits the data gives it, three at least: 0.0315 stays 0.0315, 0.5 is 0.500. */
function scoreDigits(x: number): string {
  const [whole, frac = ''] = String(x).split('.');
  return `${whole}.${frac.padEnd(3, '0')}`;
}

/**
 * « 0,855 [0,823 ; 0,887] » / "0.855 [0.823, 0.887]": the score as the data gives
 * it, its 95 % interval to three decimals, as the round-5 documents write them.
 */
export function formatScore(lang: Lang, s: Score): string {
  const [lo, hi] = s.ci95.map((x) => decimal(lang, x.toFixed(3)));
  const sep = lang === 'fr' ? ' ; ' : ', ';
  return `${decimal(lang, scoreDigits(s.score))} [${lo}${sep}${hi}]`;
}

/** « 25 % » with a narrow no-break space in French, "25%" in English. */
export function pctText(lang: Lang, pct: number): string {
  return lang === 'fr' ? `${pct} %` : `${pct}%`;
}

/**
 * The stage's game, one frame per move, under lc1-2. Throws unless the game ends
 * exactly at its last move, won by the program when the data says `win`.
 */
export function stageFrames(stage: V5Stage): Frame[] {
  const { frames } = lineFrames(stage.game, LC1_2);
  const end = frames.at(-1)!;
  const code = stage.playerColour === 'White' ? 'W' : 'R';
  const won = end.result?.winner === code;
  if (frames.length !== stage.game.length + 1 || end.result === null || won !== (stage.result === 'win')) {
    throw new Error(`pogo-stages: the game of stage ${stage.pct} does not end as the data says (${stage.result})`);
  }
  return frames;
}
