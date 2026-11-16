// <pogo-greedy seed="1">: a game of the greedy player against itself under
// lc1-2, drawn from a seed (greedy-game.ts) and replayed one move per step.
// Each move says the score that chose it, how many moves greedy weighed and,
// when several tied, that the move was drawn among them. « Nouvelle partie »
// draws the next seed and plays the new game; under reduced motion nothing
// plays by itself and the reader steps. The `seed` attribute names the game
// (greedy.mjs game SEED draws the same one).
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import { ready } from '../engine';
import { transport } from '../kit/controls';
import { autoplay } from '../kit/autoplay';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang } from '../kit/strings';
import { MAX_PLIES, greedyGame, nextSeed, parseSeed, scoreText, type GreedyFrame } from './greedy-game';
import greedyCss from './pogo-greedy.css?raw';
import replayCss from './replay.css?raw';
import { replayView, resultWords, type Line, type Spoken } from './replay-view';

/** « Score du coup : +1, le meilleur des 16 coups ; tiré au sort parmi 4 à égalité. » */
function scoreLine(lang: Lang, score: number, weighed: number, tied: number): string {
  const head = `${t(lang, 'moveScore')}${colon(lang)} ${scoreText(lang, score)}`;
  const semi = lang === 'fr' ? ' ;' : ';';
  const among = weighed === 1 ? t(lang, 'onlyMove') : `${t(lang, 'bestOf')} ${weighed} ${t(lang, 'movesUnit')}`;
  const draw = tied > 1 ? `${semi} ${t(lang, 'drawnAmong')} ${tied} ${t(lang, 'tiedUnit')}` : '';
  return `${head}, ${among}${draw}.`;
}

const unfinishedLine = (lang: Lang): string => `${t(lang, 'unfinished')} ${MAX_PLIES} ${t(lang, 'movesUnit')}.`;

function say(lang: Lang, f: GreedyFrame, stopped: boolean): Spoken {
  const move = f.move && f.mover ? announceMove(lang, f.mover, f.move) : t(lang, 'startPosition');
  const note = f.score !== undefined ? scoreLine(lang, f.score, f.weighed!, f.tied!) : '';
  const { who, how } = f.result ? resultWords(lang, f.result) : { who: '', how: stopped ? unfinishedLine(lang) : '' };
  // Over the board, two lines: the move, or at the end the stamp and how it ended (or that it was stopped).
  // The score that chose the move goes under the board, after the transport.
  const lines = (
    f.result
      ? [
          { className: 'shout who', text: who },
          { className: 'how', text: how },
        ]
      : [
          { className: 'move', text: move },
          { className: 'how', text: how },
        ]
  ).filter((l) => l.text !== '');
  const after = note ? [{ className: 'note', text: note }] : [];
  return { lines, after, title: sentences([move, note, who]), live: sentences([move, note, who, how]) };
}

/** Parts read as sentences: « Blanc joue b1-2-b3. Score du coup : +1, … » */
const sentences = (parts: string[]): string =>
  parts
    .filter(Boolean)
    .map((p) => (p.endsWith('.') ? p : `${p}.`))
    .join(' ');

/** The longest words any game may say, over the board and under it, so a new game never moves the board. */
function sizers(lang: Lang): { over: Line[][]; under: Line[][] } {
  const move = { className: 'move', text: announceMove(lang, 'White', [0, 3, 8]) };
  const ends = (['W', 'R'] as const).flatMap((winner) =>
    [false, true].map((byRepetition) => {
      const { who, how } = resultWords(lang, { winner, byRepetition });
      return [
        { className: 'shout who', text: who },
        { className: 'how', text: how },
      ];
    }),
  );
  return {
    over: [...ends, [move, { className: 'how', text: unfinishedLine(lang) }]],
    under: [[{ className: 'note', text: scoreLine(lang, -88, 88, 88) }]],
  };
}

export class PogoGreedy extends PogoFigure {
  static override styles = replayCss + greedyCss;
  static override stageMinHeight = '640px';

  /** The engine; a test swaps it. */
  static deps: { engine: () => Promise<void> } = { engine: () => ready(assetUrl(WASM_FILE)) };


  protected async render(signal: AbortSignal): Promise<void> {
    const first = parseSeed(this.getAttribute('seed'));
    await (this.constructor as typeof PogoGreedy).deps.engine();
    if (signal.aborted) return;
    const lang = this.lang;

    const root = document.createElement('div');
    root.className = 'greedy-figure';
    const legend = document.createElement('p');
    legend.className = 'legend';
    legend.textContent = t(lang, 'greedyLegend');
    const body = document.createElement('div');
    body.className = 'game';
    root.append(legend, body);
    const held = sizers(lang);

    // One game at a time: its stepper and timer go with it when the next is drawn, or with the figure.
    let game: AbortController | undefined;
    const stop = (): void => game?.abort();
    signal.addEventListener('abort', stop, { once: true });

    const load = (seed: number, start: boolean): void => {
      game?.abort();
      const current = new AbortController();
      game = current;
      const { frames, finished } = greedyGame(seed);
      const last = frames.length - 1;
      const view = replayView({
        lang,
        steps: frames,
        spoken: frames.map((f, i) => say(lang, f, !finished && i === last)),
        sizers: held.over,
        afterSizers: held.under,
        reducedMotion: () => this.reducedMotion(),
      });
      const stepper = new Stepper(frames.length, view.show, { signal: current.signal, interval: 1100 });
      const hadFocus = this.shadowRoot?.activeElement?.closest('.game') === body;
      const row = transport(stepper, {
        lang,
        counter: (i, n) => `${i} / ${n - 1}`,
        actions: [{ label: t(lang, 'newGame'), onClick: () => load(nextSeed(seed), true) }],
      });
      view.show(0);
      body.replaceChildren(view.status, view.slot, row, view.after, view.live);
      if (hadFocus) row.querySelector<HTMLButtonElement>('[data-role="action"]')?.focus();
      // The first game starts by itself on screen (under reduced motion it shows its end); a new one plays at once.
      autoplay(this, stepper, { signal: current.signal, ...(start ? {} : { still: () => stepper.go(last) }) });
      if (start) stepper.play();
    };

    load(first, false);
    this.stage.append(root);
  }
}
