// <pogo-stages program="qtab|td|az100">: one learning program at the stages of
// its training (public/data/v5.json, seed 1). The reader picks a stage; the
// figure shows its measured score against the greedy player under lc1-2, with
// its 95 % interval, as the data gives it, says which colour the program had
// in the game shown and how that game ended, and replays it move by move
// through the shared replay view. The game's first moves are the bench's
// random opening (`openingPlies`, from the game file) and say so. Choosing a stage plays its game; under reduced
// motion nothing plays by itself. The label names the file asked for, then the
// data's own source and the directory of its games.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import type { V5Data, V5Stage } from '../data';
import { moveName, ready, type Colour } from '../engine';
import { choiceGroup, transport } from '../kit/controls';
import { keepCase } from '../kit/keep-case';
import { formatScore } from '../kit/score';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { V5_FILE, sharedV5 } from '../v5';
import { countNodes, formatCount } from './count-steps';
import { seenText, type Frame } from './line-frames';
import stagesCss from './pogo-stages.css?raw';
import replayCss from './replay.css?raw';
import { colourKey, replayView, resultWords, type Line, type Spoken } from './replay-view';
import { parseProgram, pctText, stageFrames, stagesSource, type StageProgram } from './stage-view';

const PROGRAM_KEY: Record<StageProgram, StringKey> = { qtab: 'progQtab', td: 'progTd', az100: 'progAz100' };

const other = (c: Colour): Colour => (c === 'White' ? 'Red' : 'White');
const semi = (lang: Lang): string => (lang === 'fr' ? ' ;' : ';');

/** The stage's readout: where in training, the score, what the score is, the game shown. */
export function stageWords(
  lang: Lang,
  program: StageProgram,
  stage: V5Stage,
): { where: string; whereHead: string; whereTail: string; score: string; note: string; shown: string } {
  const c = colon(lang);
  const shown =
    `${t(lang, 'stagesShownIs')} ${t(lang, colourKey(stage.playerColour))}, ` +
    `${t(lang, 'stagesGreedyIs')} ${t(lang, colourKey(other(stage.playerColour)))}${semi(lang)} ` +
    t(lang, stage.result === 'win' ? 'stagesProgramWins' : 'stagesProgramLoses');
  const whereHead = `${t(lang, PROGRAM_KEY[program])} · ${pctText(lang, stage.pct)} ${t(lang, 'stagesOfTraining')}${c} `;
  const whereTail = ` ${t(lang, 'stagesGames')}`;
  return {
    where: `${whereHead}${formatCount(lang, stage.gamesTrained)}${whereTail}`,
    whereHead,
    whereTail,
    score: `${t(lang, 'stagesScore')}${c} ${formatScore(lang, stage)}`,
    note: t(lang, 'stagesScoreNote'),
    shown,
  };
}

/** One move of the stage's game: who plays, the program or greedy, and whether it is the random opening. */
function say(lang: Lang, f: Frame, programColour: Colour, openingPlies: number): Spoken {
  let move = t(lang, 'startPosition');
  let note = '';
  if (f.move && f.mover) {
    const opening = f.ply <= openingPlies;
    const who = f.mover === programColour ? t(lang, 'stagesProgram') : t(lang, 'stagesGreedy');
    move = opening ? announceMove(lang, f.mover, f.move) : `${t(lang, colourKey(f.mover))} (${who}) ${t(lang, 'plays')} ${moveName(f.move)}`;
    if (opening) note = t(lang, 'stagesOpening');
    else if (f.seen !== null && f.seen > 1) note = seenText(lang, f.seen);
  }
  const { who, how } = f.result ? resultWords(lang, f.result) : { who: '', how: '' };
  const lines = [
    { className: 'move', text: move },
    { className: 'note', text: note },
    { className: 'result', text: [who, how].filter(Boolean).map((p) => (p.endsWith('.') ? p : `${p}.`)).join(' ') },
  ].filter((l) => l.text !== '');
  const sentences = [move, note, who, how].filter(Boolean).map((p) => (p.endsWith('.') ? p : `${p}.`));
  return { lines, title: sentences.slice(0, 3).join(' '), live: sentences.join(' ') };
}

/** The longest words any stage's game may say, so a new stage never moves the board. */
function sizers(lang: Lang): Line[][] {
  const move = { className: 'move', text: `${t(lang, 'red')} (${t(lang, 'stagesProgram')}) ${t(lang, 'plays')} a1-3-c3` };
  const notes = [t(lang, 'stagesOpening'), seenText(lang, 2)].map((text) => ({ className: 'note', text }));
  return notes.flatMap((note) =>
    (['W', 'R'] as const).flatMap((winner) =>
      [false, true].map((byRepetition) => {
        const { who, how } = resultWords(lang, { winner, byRepetition });
        return [move, note, { className: 'result', text: `${who}. ${how}` }];
      }),
    ),
  );
}

export class PogoStages extends PogoFigure {
  static override fidelity = 'measured' as const;
  static override game = 'gameLc12' as const;
  static override styles = replayCss + stagesCss;
  static override stageMinHeight = '760px';

  /** The engine and the data; a test swaps them. */
  static deps: { engine: () => Promise<void>; v5: () => Promise<V5Data> } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    v5: sharedV5,
  };

  private source: string | undefined;

  /** The file the figure asks for until its data is loaded (and for good if that fails), then the data's own sources. */
  protected override sourceFile(): string {
    return this.source ?? V5_FILE;
  }

  protected async render(signal: AbortSignal): Promise<void> {
    const program = parseProgram(this.getAttribute('program'));
    const deps = (this.constructor as typeof PogoStages).deps;
    const [data] = await Promise.all([deps.v5(), deps.engine()]);
    if (signal.aborted) return;
    const lang = this.lang;
    const stages = data.stagesPct.map((pct) => {
      const stage = data.programs[program].stages.find((s) => s.pct === pct);
      if (!stage) throw new Error(`pogo-stages: ${program} has no stage ${pct}`);
      return stage;
    });
    // Every game is replayed before anything is drawn: one that ends otherwise than the data says fails the figure.
    const games = stages.map(stageFrames);
    this.source = stagesSource(data, stages);
    this.refreshLabel();

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const root = el('div', 'stages');
    // Every stage's readout in one grid cell, only the chosen one seen: the area keeps the height of the longest.
    const readout = el('div', 'readout');
    const readouts = stages.map((s) => {
      const w = stageWords(lang, program, s);
      const block = el('div', 'stage-words');
      const where = el('p', 'label where num');
      // The label cut all but closes a narrow space: the count's digit groups get room (countNodes).
      where.append(...keepCase(w.whereHead), ...countNodes(lang, s.gamesTrained), w.whereTail);
      block.append(where, el('p', 'score num', w.score), el('p', 'note', w.note), el('p', 'shown', w.shown));
      readout.append(block);
      return block;
    });
    readout.setAttribute('aria-hidden', 'true');
    const announce = el('p', 'sr');
    announce.setAttribute('role', 'status');
    announce.setAttribute('aria-live', 'polite');

    const body = el('div', 'game');
    const held = sizers(lang);
    let game: AbortController | undefined;
    signal.addEventListener('abort', () => game?.abort(), { once: true });

    const choose = (k: number, autoplay: boolean): void => {
      game?.abort();
      const current = new AbortController();
      game = current;
      const stage = stages[k]!;
      const frames = games[k]!;
      readouts.forEach((b, i) => b.toggleAttribute('data-off', i !== k));
      const w = stageWords(lang, program, stage);
      announce.textContent = [w.where, w.score, w.shown].join('. ');
      picker.set(String(stage.pct));
      const view = replayView({
        steps: frames,
        spoken: frames.map((f) => say(lang, f, stage.playerColour, stage.openingPlies)),
        sizers: held,
        reducedMotion: () => this.reducedMotion(),
      });
      const stepper = new Stepper(frames.length, view.show, { signal: current.signal, interval: 1100 });
      const row = transport(stepper, { lang, counter: (i, n) => `${i} / ${n - 1}` });
      view.show(0);
      body.replaceChildren(view.status, view.slot, row, view.live);
      if (autoplay) stepper.play();
    };

    const picker = choiceGroup<string>({
      label: t(lang, 'stagesPick'),
      id: 'stage-pick',
      choices: stages.map((s) => ({ value: String(s.pct), label: pctText(lang, s.pct) })),
      onChoose: (value) => choose(stages.findIndex((s) => String(s.pct) === value), true),
    });

    root.append(picker.element, readout, announce, body);
    choose(0, false);
    this.stage.append(root);
  }
}
