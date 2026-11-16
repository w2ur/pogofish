// What <pogo-stages> shows of one learning program, apart from the DOM: which
// program the attribute names, a stage's measured score written as the data
// gives it (the kit's score format, kit/score.ts), and the stage's game replayed through the engine under lc1-2,
// refused if it does not end as the data says.
import type { V5Stage } from '../data';
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
