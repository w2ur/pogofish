// <pogo-line line="shortestWin|loop|centreLoss|openingWin" rules="A|lc1-2">:
// replays a line of the solved-table extract, one ply per step, under the rules
// the page names (line-frames.ts). Each step says the move and, under lc1-2,
// how often the position has stood; the last says who wins and how. Under
// game A the loop plays on without end. « Jouer d’ici » hands any open position
// to the playable board.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import type { TableData } from '../data';
import { LC1_2, ready, terminal } from '../engine';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { t, type Lang, type StringKey } from '../kit/strings';
import { sharedTable } from '../table';
import { lineFrames, parseLine, parseRules, seenText, type Frame, type LineName } from './line-frames';
import lineCss from './pogo-line.css?raw';
import replayCss from './replay.css?raw';
import { replayView, resultWords, type Spoken } from './replay-view';

const LINE_KEY: Record<LineName, StringKey> = {
  shortestWin: 'lineShortestWin',
  loop: 'lineLoop',
  centreLoss: 'lineCentreLoss',
  openingWin: 'lineOpeningWin',
};

/** The words of one frame, in `lang`. `endless` marks the last frame of a loop under game A. */
function say(lang: Lang, f: Frame, endless: boolean): Spoken {
  const move = f.move && f.mover ? announceMove(lang, f.mover, f.move) : t(lang, 'startPosition');
  let note = '';
  if (endless) note = t(lang, 'loopAgain');
  else if (f.seen !== null && f.seen > 1) note = seenText(lang, f.seen);
  const { who, how } = f.result ? resultWords(lang, f.result) : { who: '', how: '' };
  // Two lines over the board: the move and its note, or at the end the stamp and how it ended.
  const lines = (
    f.result
      ? [
          { className: 'shout who', text: who },
          { className: 'how', text: how },
        ]
      : [
          { className: 'move', text: move },
          { className: 'note', text: note },
        ]
  ).filter((l) => l.text !== '');
  return {
    lines,
    title: [move, note, who].filter(Boolean).join('. '),
    live: [move, note, who, how].filter(Boolean).join('. '),
  };
}

export class PogoLine extends PogoFigure {
  static override styles = replayCss + lineCss;
  static override stageMinHeight = '480px';

  /** The engine and the table; a test swaps them. */
  static deps: { engine: () => Promise<void>; table: () => Promise<TableData> } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    table: sharedTable,
  };

  protected async render(signal: AbortSignal): Promise<void> {
    const name = parseLine(this.getAttribute('line'));
    const rules = parseRules(this.getAttribute('rules'));
    const deps = (this.constructor as typeof PogoLine).deps;
    const [table] = await Promise.all([deps.table(), deps.engine()]);
    if (signal.aborted) return;
    const lang = this.lang;
    const { frames, cyclic } = lineFrames(table.lines[name], rules);
    const last = frames.length - 1;
    const spoken = frames.map((f, i) => say(lang, f, cyclic && i === last));
    const root = document.createElement('div');
    root.className = 'line-figure';
    const view = replayView({
      lang,
      steps: frames,
      spoken,
      // A step forward, or the loop wrapping from its last frame to its first move, which is one too.
      forward: (from, to) => to === from + 1 || (cyclic && from === last && to === 1),
      reducedMotion: () => this.reducedMotion(),
    });

    const show = (i: number): void => {
      view.show(i);
      // A finished position cannot be played on: under either rule set the board would have nothing to do.
      if (playHere) {
        const f = frames[i]!;
        const focused = this.shadowRoot?.activeElement === playHere;
        playHere.disabled = f.result !== null || terminal(f.state, LC1_2);
        if (focused && playHere.disabled) row.querySelector<HTMLButtonElement>('[data-role="previous"]')?.focus();
      }
    };

    const stepper = new Stepper(frames.length, show, { signal, interval: 1100, ...(cyclic ? { wrapTo: 1 } : {}) });
    const row = transport(stepper, {
      lang,
      counter: (i, n) => `${i} / ${n - 1}`,
      actions: [
        {
          label: t(lang, 'playFromHere'),
          onClick: () => {
            const f = frames[stepper.index]!;
            this.playFrom(f.state, `${t(lang, LINE_KEY[name])}, ${t(lang, 'ply')} ${f.ply}`);
          },
        },
      ],
    });
    const playHere = row.querySelector<HTMLButtonElement>('[data-role="action"]');
    show(0);
    root.append(view.status, view.slot, row, view.live);
    this.stage.append(root);
  }
}
