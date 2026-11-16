// <pogo-count>: the one thing the essay's computation cannot show. A position
// IS a pile of 12 pieces cut by 8 separators (count-row.ts): the pieces of a
// real position leave the board square after square and lie end to end in one
// row, a separator at every change of square; then the row takes another
// order, its separators other places, and folds back onto the board as another
// position; then the turn passes. And again, in a loop. The figure computes
// nothing and repeats none of the essay's numbers.
//
// One drawing holds the board and the row (count-view.ts), so the twelve
// pieces are the same twelve all along and travel from one to the other. What
// is not drawn in full is drawn as a trace: the row under a position, the
// position a row folds into. It plays by itself once on screen
// (kit/autoplay.ts); under reduced motion it shows a position and its row.
import { WASM_FILE, assetUrl } from '../assets';
import { DEFAULT_GAME } from '../default-game';
import { ready, replay, type Colour, type State, type Triple } from '../engine';
import { autoplay } from '../kit/autoplay';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { t, type Lang, type StringKey } from '../kit/strings';
import { BARS, PIECES, countFrames, reassign, type CountFrame } from './count-row';
import { CELL, LAYOUTS, RADIUS, layoutFor, scene, type Layout, type Spot } from './count-view';
import countCss from './pogo-count.css?raw';

const NS = 'http://www.w3.org/2000/svg';

/**
 * The positions shown, as plies of the page's default game (default-game.ts): the
 * start, then two positions of the game, the side to move changing each time.
 */
export const SHOWN_PLIES = [0, 5, 8] as const;

/** How long a step is held, in ms, and how its pieces travel. */
export const STEP_MS = 4200;
const TRAVEL_MS = 650;
const SHIFT_MS = 1000;
/** A square's pieces leave (or land) this long after the square before. */
const SQUARE_MS = 170;

const SAY: Record<Exclude<CountFrame['kind'], 'turn'>, StringKey> = {
  board: 'countSayBoard',
  unfold: 'countSayUnfold',
  reorder: 'countSayReorder',
  slide: 'countSaySlide',
  fold: 'countSayFold',
};

/** The line a frame says. */
export function sayFrame(lang: Lang, f: CountFrame): string {
  if (f.kind === 'turn') return t(lang, f.turn === 'White' ? 'countSayTurnWhite' : 'countSayTurnRed');
  return t(lang, SAY[f.kind]);
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

const transformOf = (s: Spot): string => `translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px) scale(${s.scale.toFixed(4)})`;

/** A piece as the kit draws it, centred on its own origin: the cut-out, the disc, the ink ring. */
function piece(colour: Colour, parent: Element): SVGGElement {
  const g = svgEl('g', { class: 'pc' }, parent);
  g.dataset.colour = colour;
  svgEl('circle', { class: 'gap', r: RADIUS + 3 }, g);
  svgEl('circle', { class: `disc ${colour === 'White' ? 'white' : 'red'}`, r: RADIUS }, g);
  svgEl('circle', { class: 'ring', r: RADIUS - 1 }, g);
  return g;
}

export class PogoCount extends PogoFigure {
  static override styles = countCss;
  static override stageMinHeight = '520px';

  /** The engine, and the game the positions are taken from; a test swaps them. */
  static deps: { engine: () => Promise<void>; game: readonly Triple[] } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    game: DEFAULT_GAME,
  };

  protected async render(signal: AbortSignal): Promise<void> {
    const deps = (this.constructor as typeof PogoCount).deps;
    await deps.engine();
    if (signal.aborted) return;
    const lang = this.lang;
    const states = replay([...deps.game]);
    const positions = SHOWN_PLIES.map((ply): State => states[ply] ?? states.at(-1)!);
    const frames = countFrames(positions);
    const last = frames.length - 1;

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const root = el('div', 'count');
    const say = el('p', 'say line');
    say.setAttribute('aria-live', 'polite');
    const sceneBox = el('div', 'scene');
    // The kit's board class: the squares and the pieces are painted by the theme, as on every board.
    const svg = svgEl('svg', { class: 'board drawing', 'aria-hidden': 'true' });
    const squares = svgEl('g', { class: 'squares' }, svg);
    const rail = svgEl('line', { class: 'rail' }, svg);
    const traces = svgEl('g', { class: 'traces' }, svg);
    const barLayer = svgEl('g', { class: 'bars' }, svg);
    const pieceLayer = svgEl('g', { class: 'pieces' }, svg);
    const turn = el('p', 'turn');
    const turnPiece = el('span', 'turn-piece');
    const turnText = el('span', 'turn-text');
    turn.append(turnPiece, turnText);
    sceneBox.append(svg, turn);

    // The twelve pieces, the same all along: piece d starts at rank d of the first row.
    const colours = [...frames[0]!.row.order];
    const pieces = colours.map((c) => piece(c, pieceLayer));
    let at = colours.map((_, d) => d);
    const bars = Array.from({ length: BARS }, () => svgEl('rect', { class: 'bar' }, barLayer));

    let layout: Layout = LAYOUTS.mid;
    const lay = (l: Layout): void => {
      layout = l;
      root.dataset.layout = l.name;
      svg.setAttribute('viewBox', `0 0 ${l.width} ${l.height}`);
      svg.setAttribute('width', String(l.width));
      svg.setAttribute('height', String(l.height));
      squares.replaceChildren();
      for (let i = 0; i < 9; i++) {
        svgEl('rect', { class: 'cell', 'data-cell': i, x: l.board.x + (i % 3) * CELL, y: l.board.y + (2 - Math.floor(i / 3)) * CELL, width: CELL, height: CELL }, squares);
      }
      const { slot, x, y } = l.row;
      const foot = y + slot * 0.72;
      for (const [k, v] of Object.entries({ x1: x, x2: x + (PIECES + BARS) * slot, y1: foot, y2: foot })) rail.setAttribute(k, v.toFixed(1));
      for (const bar of bars) {
        for (const [k, v] of Object.entries({ x: -slot * 0.06, y: -slot * 0.72, width: slot * 0.12, height: slot * 1.44 })) bar.setAttribute(k, v.toFixed(2));
      }
      // The line that says whose turn it is sits under the board, wherever the board is.
      turn.style.left = `${((l.board.x / l.width) * 100).toFixed(3)}%`;
      turn.style.width = `${(((3 * CELL) / l.width) * 100).toFixed(3)}%`;
      turn.style.top = `${(((l.board.y + 3 * CELL) / l.height) * 100).toFixed(3)}%`;
    };

    const canAnimate = typeof pieces[0]!.animate === 'function';
    /** Puts `node` at `to`, travelling from where it was when `travel` is set. */
    const move = (node: SVGElement, to: Record<string, string>, travel: { delay: number; duration: number } | null): void => {
      const from: Record<string, string> = {};
      for (const k of Object.keys(to)) from[k] = node.style.getPropertyValue(k);
      // A travel still under way ends where it was going: the next one starts from there.
      if (canAnimate) for (const a of node.getAnimations()) a.finish();
      for (const [k, v] of Object.entries(to)) node.style.setProperty(k, v);
      if (!travel || !canAnimate || Object.keys(to).every((k) => from[k] === to[k] || from[k] === '')) return;
      node.animate([from, to], { ...travel, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'backwards' });
    };

    let shown = -1;
    const draw = (i: number, animated: boolean): void => {
      const f = frames[i]!;
      const s = scene(layout, f);
      at = reassign(at, colours, f.row.order);
      const staged = f.kind === 'unfold' || f.kind === 'fold';
      const travel = (cell: number): { delay: number; duration: number } | null =>
        animated ? (staged ? { delay: cell * SQUARE_MS, duration: TRAVEL_MS } : { delay: 0, duration: SHIFT_MS }) : null;

      // On the board a stack is painted bottom first: the pieces are put back in the row's order.
      if (f.solid === 'board') {
        const byRank = pieces.map((p, d) => ({ p, rank: at[d]! })).sort((a, b) => a.rank - b.rank);
        pieceLayer.replaceChildren(...byRank.map((x) => x.p));
      }
      pieces.forEach((p, d) => {
        const spot = s.solid[at[d]!]!;
        p.dataset.rank = String(at[d]);
        move(p, { transform: transformOf(spot) }, travel(spot.cell));
      });
      // The separators stand in the row while the pieces do; one comes after each square laid down.
      bars.forEach((bar, j) => {
        const on = f.solid === 'row';
        const when = animated && staged ? { delay: (on ? j + 1 : j) * SQUARE_MS, duration: 300 } : travel(0);
        move(bar, { transform: transformOf({ ...s.bars[j]!, scale: 1 }), opacity: on ? '1' : '0' }, when);
        bar.toggleAttribute('data-off', !on);
      });

      // The trace: the row under a position, or the position a row folds into.
      traces.replaceChildren();
      traces.dataset.of = f.solid === 'board' ? 'row' : 'board';
      f.row.order.forEach((colour, k) => {
        const g = piece(colour, traces);
        g.style.transform = transformOf(s.trace[k]!);
      });
      if (f.solid === 'board') {
        for (const b of s.bars) {
          const bar = bars[0]!.cloneNode() as SVGRectElement;
          bar.removeAttribute('data-off');
          bar.removeAttribute('style');
          bar.style.transform = transformOf({ ...b, scale: 1 });
          traces.append(bar);
        }
      }
      traces.toggleAttribute('data-fresh', animated);

      root.dataset.kind = f.kind;
      root.dataset.solid = f.solid;
      say.textContent = sayFrame(lang, f);
      turnText.textContent = t(lang, f.turn === 'White' ? 'countTurnWhite' : 'countTurnRed');
      turn.dataset.turn = f.turn;
      turn.toggleAttribute('data-passed', f.kind === 'turn');
    };

    const show = (i: number): void => {
      // A step forward travels; the loop's return to its second frame is one too.
      const forward = i === shown + 1 || (shown === last && i === 1);
      shown = i;
      draw(i, forward && shown > 0 && !this.reducedMotion());
    };

    lay(layoutFor(this.getBoundingClientRect().width || LAYOUTS.mid.width));
    const stepper = new Stepper(frames.length, show, { signal, interval: STEP_MS, wrapTo: 1 });
    show(0);
    root.append(say, sceneBox, transport(stepper, { lang }));
    // Under reduced motion: a position and its row, the sentence of the figure.
    autoplay(this, stepper, { signal, still: () => stepper.go(1) });
    this.stage.append(root);

    if (typeof ResizeObserver === 'function') {
      const sizes = new ResizeObserver((entries) => {
        const width = entries.at(-1)?.contentRect.width ?? 0;
        if (width === 0 || layoutFor(width) === layout) return;
        lay(layoutFor(width));
        draw(shown, false);
      });
      sizes.observe(this);
      signal.addEventListener('abort', () => sizes.disconnect(), { once: true });
    }
  }
}
