// <pogo-stages program="qtab|td|az100">: one learning program at the stages of
// its training (public/data/v5.json, seed 1), as the letter's videos showed it.
// A board replays the game the bench kept at each stage, against the greedy
// player under lc1-2; beside it (under it when narrow) the curve: the measured
// score against greedy at each stage, with the exact-table player, greedy and
// the random player as dashed references named on the chart. The stages advance
// by themselves: each plays its game, the curve is drawn up to it, its point is
// the large one and the headline score is its own. The points are the controls:
// a radio group, so the reader picks a stage on the curve itself. The curve is
// drawn, the number never counts. The game's first moves are the bench's random
// opening (`openingPlies`, from the game file) and say so.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import type { V5Data, V5Stage } from '../data';
import { moveName, ready, type Colour } from '../engine';
import { autoplay } from '../kit/autoplay';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { keepCase } from '../kit/keep-case';
import { formatInterval, formatShare } from '../kit/score';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { sharedV5 } from '../v5';
import { seenText, type Frame } from './line-frames';
import { tween } from './motion';
import stagesCss from './pogo-stages.css?raw';
import type { ReferenceKey } from './race-chart';
import replayCss from './replay.css?raw';
import { colourKey, replayView, resultWords, type Spoken } from './replay-view';
import { stageChart, stageScript } from './stage-chart';
import { parseProgram, pctText, stageFrames, whenText, type StageProgram } from './stage-view';

const NS = 'http://www.w3.org/2000/svg';
/** The SVG's user space, stretched to the box. */
const U = 1000;

/** How long a move is held, and the end of a stage's game before the next stage starts. */
export const MOVE_MS = 800;
export const REST_MS = 2600;
/** How long the curve takes to reach a new stage. */
const DRAW_MS = 600;

const PROGRAM_KEY: Record<StageProgram, StringKey> = { qtab: 'progQtab', td: 'progTd', az100: 'progAz100' };
const REF_NAME: Record<ReferenceKey, StringKey> = { table: 'refTable', greedy: 'refGreedy', random: 'refRandom' };

const other = (c: Colour): Colour => (c === 'White' ? 'Red' : 'White');
const pc = (f: number): string => `${(f * 100).toFixed(3)}%`;
const Y = (score: number): number => (1 - score) * U;

export interface StageWords {
  /** « Q-learning · après 50 000 parties, 1 % de l’entraînement » */
  where: string;
  /** « 3,2 % » */
  score: string;
  /** « intervalle à 95 % : 2,4 à 4,0 % » */
  interval: string;
  /** « Partie montrée : le programme est Blanc, le glouton Rouge. » */
  shown: string;
  /** The stage as its point names it: « 1 % de l’entraînement : 3,2 % de parties gagnées contre le glouton ». */
  point: string;
}

/** The stage's readout: where in training, the score and its interval, who is who in the game shown. */
export function stageWords(lang: Lang, program: StageProgram, stage: V5Stage): StageWords {
  const c = colon(lang);
  const share = `${pctText(lang, stage.pct)} ${t(lang, 'stagesOfTraining')}`;
  // Stage 0 has trained on nothing: « avant tout entraînement », as <pogo-mosaic> says it (whenText).
  const when = stage.gamesTrained === 0 ? whenText(lang, 0) : `${whenText(lang, stage.gamesTrained)}, ${share}`;
  const score = formatShare(lang, stage.score);
  return {
    where: `${t(lang, PROGRAM_KEY[program])} · ${when}`,
    score,
    interval: `${t(lang, 'stagesCi')}${c} ${formatInterval(lang, stage.ci95)}`,
    shown: `${t(lang, 'stagesShownIs')} ${t(lang, colourKey(stage.playerColour))}, ${t(lang, 'stagesGreedyIs')} ${t(lang, colourKey(other(stage.playerColour)))}.`,
    point: `${stage.gamesTrained === 0 ? whenText(lang, 0) : share}${c} ${score} ${t(lang, 'stagesScoreWhat')}`,
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
  const sentences = [move, note, who, how].filter(Boolean).map((p) => (p.endsWith('.') ? p : `${p}.`));
  return { lines, title: sentences.slice(0, 3).join(' '), live: sentences.join(' ') };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function svgEl(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

export class PogoStages extends PogoFigure {
  static override styles = replayCss + stagesCss;

  /** The engine and the data; a test swaps them. */
  static deps: { engine: () => Promise<void>; v5: () => Promise<V5Data> } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    v5: sharedV5,
  };

  protected async render(signal: AbortSignal): Promise<void> {
    const program = parseProgram(this.getAttribute('program'));
    const deps = (this.constructor as typeof PogoStages).deps;
    const [data] = await Promise.all([deps.v5(), deps.engine()]);
    if (signal.aborted) return;
    const lang = this.lang;
    const chart = stageChart(data, program);
    const stages = chart.points.map((p) => data.programs[program].stages.find((s) => s.pct === p.pct)!);
    // Every game is replayed before anything is drawn: one that ends otherwise than the data says fails the figure.
    const games = stages.map(stageFrames);
    const script = stageScript(games.map((g) => g.length));
    const words = stages.map((s) => stageWords(lang, program, s));
    const n = stages.length;
    const of = t(lang, 'outOf');

    const root = el('div', 'stages');
    const where = el('p', 'say where num');
    const announce = el('p', 'sr');
    announce.setAttribute('role', 'status');
    announce.setAttribute('aria-live', 'polite');

    // The game: who is who, the move's words, the board.
    const shown = el('p', 'shown');
    const view = replayView({
      lang,
      steps: script.steps.map((s) => games[s.stage]![s.ply]!),
      spoken: script.steps.map((s) => say(lang, games[s.stage]![s.ply]!, stages[s.stage]!.playerColour, stages[s.stage]!.openingPlies)),
      // A move travels within a game; a new stage sets its own start position down.
      forward: (from, to) => to === from + 1 && script.steps[to]!.ply > 0,
      reducedMotion: () => this.reducedMotion(),
    });
    const game = el('div', 'game');

    // The curve: the headline score, then the plot.
    const headline = el('div', 'headline');
    headline.setAttribute('aria-hidden', 'true');
    const score = el('p', 'score shout num');
    const interval = el('p', 'interval num');
    headline.append(el('p', 'say', t(lang, 'stagesScore')), score, interval);

    const plot = el('div', 'plot');
    const yAxis = el('div', 'y-axis');
    yAxis.setAttribute('aria-hidden', 'true');
    for (const v of [0, 25, 50, 75, 100]) {
      const tick = el('span', 'tick num', String(v));
      tick.style.top = pc(1 - v / 100);
      yAxis.append(tick);
    }
    const box = el('div', 'box');
    const svg = svgEl('svg', { viewBox: `0 0 ${U} ${U}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false', class: 'lines' });
    for (const v of [0, 0.25, 0.5, 0.75, 1]) svgEl('line', { class: v === 0 ? 'base' : 'grid', x1: 0, x2: U, y1: Y(v), y2: Y(v) }, svg);
    for (const r of chart.references) svgEl('line', { class: `ref ref-${r.key}`, x1: 0, x2: U, y1: Y(r.y), y2: Y(r.y) }, svg);
    const whisker = svgEl('line', { class: 'ci' }, svg);
    // One segment per pair of stages: the curve is drawn up to the stage shown.
    const segments = chart.points.slice(1).map((p, k) => {
      const from = chart.points[k]!;
      return svgEl('line', { class: 'run', x1: from.x * U, y1: Y(from.y), x2: p.x * U, y2: Y(p.y), 'data-to': k + 1 }, svg);
    });

    // The points are the controls: one exclusive choice, one tab stop, the arrow keys move and choose.
    const group = el('div', 'points');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', t(lang, 'stagesPick'));
    const points = chart.points.map((p, k) => {
      const b = el('button', 'point');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', words[k]!.point);
      b.dataset.stage = String(k);
      b.style.left = pc(p.x);
      b.style.top = pc(1 - p.y);
      b.style.width = pc(1 / n);
      b.append(el('span', 'dot'));
      b.addEventListener('click', () => choose(k));
      group.append(b);
      return b;
    });
    group.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      const from = points.indexOf(e.target as HTMLButtonElement);
      if (step === undefined || from < 0) return;
      e.preventDefault();
      const to = (from + step + n) % n;
      points[to]!.focus();
      choose(to);
    });
    box.append(svg, group);

    const refs = el('div', 'refs');
    refs.setAttribute('aria-hidden', 'true');
    for (const r of chart.references) {
      const name = el('span', `ref-name ref-name-${r.key} num`);
      name.append(el('span', 'ref-who', t(lang, REF_NAME[r.key])), ' ', el('span', 'value', formatShare(lang, r.score)));
      name.style.top = pc(1 - r.y);
      refs.append(name);
    }
    const xAxis = el('div', 'x-axis');
    xAxis.setAttribute('aria-hidden', 'true');
    chart.points.forEach((p) => {
      const tick = el('span', 'tick num', String(p.pct));
      tick.style.left = pc(p.x);
      xAxis.append(tick);
    });
    const unitY = el('p', 'unit unit-y', t(lang, 'stagesAxisY'));
    unitY.setAttribute('aria-hidden', 'true');
    const unitX = el('p', 'unit unit-x', t(lang, 'stagesAxis'));
    unitX.setAttribute('aria-hidden', 'true');
    plot.append(unitY, yAxis, box, refs, xAxis, unitX);
    const curve = el('div', 'curve');
    curve.append(headline, plot);

    let at = -1;
    let drawing: (() => void) | undefined;
    const showStage = (k: number): void => {
      if (k === at) return;
      drawing?.();
      drawing = undefined;
      const stage = stages[k]!;
      const w = words[k]!;
      where.replaceChildren(...keepCase(w.where));
      shown.textContent = w.shown;
      score.textContent = w.score;
      interval.textContent = w.interval;
      announce.textContent = [w.where, `${t(lang, 'stagesScore')}${colon(lang)} ${w.score}`, w.interval, w.shown].join('. ');
      points.forEach((b, j) => {
        b.setAttribute('aria-checked', String(j === k));
        b.tabIndex = j === k ? 0 : -1;
        b.dataset.when = j < k ? 'past' : j === k ? 'now' : 'later';
      });
      const p = chart.points[k]!;
      const lo = stage.ci95[0];
      const hi = stage.ci95[1];
      for (const [name, value] of [['x1', p.x * U], ['x2', p.x * U], ['y1', Y(lo)], ['y2', Y(hi)]] as const) whisker.setAttribute(name, String(value));
      segments.forEach((s, j) => s.toggleAttribute('data-off', j + 1 > k));
      // The curve reaches a new stage by growing its last segment; a number is set, never counted.
      const grown = segments[k - 1];
      if (grown && k === at + 1 && !this.reducedMotion()) {
        const from = chart.points[k - 1]!;
        whisker.setAttribute('data-off', '');
        points[k]!.dataset.when = 'later';
        drawing = tween(DRAW_MS, (q) => {
          grown.setAttribute('x2', String((from.x + (p.x - from.x) * q) * U));
          grown.setAttribute('y2', String(Y(from.y + (p.y - from.y) * q)));
          if (q >= 1) {
            whisker.removeAttribute('data-off');
            points[k]!.dataset.when = 'now';
          }
        });
      } else {
        whisker.removeAttribute('data-off');
      }
      at = k;
    };

    const show = (i: number): void => {
      showStage(script.steps[i]!.stage);
      view.show(i);
    };

    const stepper = new Stepper(script.steps.length, show, {
      signal,
      interval: (i) => (script.steps[i]!.end ? REST_MS : MOVE_MS),
    });
    signal.addEventListener('abort', () => drawing?.(), { once: true });
    const counter = (i: number): string => {
      const s = script.steps[i]!;
      return `${t(lang, 'progressStep')} ${s.stage + 1} ${of} ${n} · ${t(lang, 'ply')} ${s.ply} ${of} ${games[s.stage]!.length - 1}`;
    };
    const row = transport(stepper, { lang, counter });

    /** The reader picks a stage on the curve: its game starts, and plays unless motion is reduced. */
    const choose = (k: number): void => {
      stepper.pause();
      stepper.go(script.starts[k]!);
      if (stepper.auto) stepper.playByReader();
    };

    show(0);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
    game.append(shown, view.status, view.slot, row, view.live);
    const layout = el('div', 'layout');
    layout.append(game, curve);
    root.append(where, announce, layout);
    this.stage.append(root);
  }
}

