// What <pogo-stages> shows of one learning program, apart from the DOM: which
// program the attribute names, a stage's measured score written as the data
// gives it (the kit's score format, kit/score.ts), and the stage's game replayed through the engine under lc1-2,
// refused if it does not end as the data says.
import type { V5Stage } from '../data';
import { LC1_2 } from '../engine';
import { t, type Lang } from '../kit/strings';
import { countNodes, formatCount } from './count-steps';
import { lineFrames, type Frame } from './line-frames';

export type StageProgram = 'qtab' | 'td' | 'az100';

const PROGRAMS: readonly StageProgram[] = ['qtab', 'td', 'az100'];

export function parseProgram(attr: string | null): StageProgram {
  const found = PROGRAMS.find((p) => p === attr);
  if (!found) throw new Error(`pogo-stages: program must be qtab, td or az100, not ${JSON.stringify(attr)}`);
  return found;
}

/** « 25 % » with a narrow no-break space in French, "25%" in English. */
export function pctText(lang: Lang, pct: number): string {
  return lang === 'fr' ? `${pct} %` : `${pct}%`;
}

/** « après 500 parties », or « avant tout entrainement » for stage 0, as text. */
export function whenText(lang: Lang, gamesTrained: number): string {
  return gamesTrained === 0 ? t(lang, 'beforeTraining') : `${t(lang, 'mosaicAfter')} ${formatCount(lang, gamesTrained)} ${t(lang, 'stagesGames')}`;
}

/** « après 500 parties », or « avant tout entrainement » for stage 0, as nodes (the count's digit groups get room). */
export function whenNodes(lang: Lang, gamesTrained: number): (string | HTMLElement)[] {
  if (gamesTrained === 0) return [t(lang, 'beforeTraining')];
  return [`${t(lang, 'mosaicAfter')} `, ...countNodes(lang, gamesTrained), ` ${t(lang, 'stagesGames')}`];
}

/**
 * The stage's game, one frame per move, under lc1-2. Throws unless the game ends
 * exactly at its last move, won by the program when the data says `win`, and its
 * random opening (`openingPlies`, from the game file) is a whole number of moves
 * that leaves the program at least one of its own.
 */
export function stageFrames(stage: V5Stage): Frame[] {
  const opening = stage.openingPlies;
  if (!Number.isInteger(opening) || opening < 0 || opening >= stage.game.length) {
    throw new Error(`pogo-stages: stage ${stage.pct} has an opening of ${opening} moves in a game of ${stage.game.length}`);
  }
  const { frames } = lineFrames(stage.game, LC1_2);
  const end = frames.at(-1)!;
  const code = stage.playerColour === 'White' ? 'W' : 'R';
  const won = end.result?.winner === code;
  if (frames.length !== stage.game.length + 1 || end.result === null || won !== (stage.result === 'win')) {
    throw new Error(`pogo-stages: the game of stage ${stage.pct} does not end as the data says (${stage.result})`);
  }
  return frames;
}
