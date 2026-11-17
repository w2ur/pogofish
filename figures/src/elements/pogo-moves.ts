// <pogo-moves>: the board as the rules introduce it. `view="start"` is the start
// position to read, with a key to the two sides. `view="moves"` is the computer
// showing every kind of move the rules list (moves-demo.ts): each move is
// announced by one short line, then its pieces are lifted, carried square by
// square along their path, and land. It plays by itself on screen and loops
// after a rest on its last landing (kit/autoplay.ts); the reader steps or pauses
// it with the transport, and plays nothing: the article's own illustration did
// the same, and a playable board would repeat the one further down the page.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import { initial, ready, type Colour } from '../engine';
import { autoplay } from '../kit/autoplay';
import { boardLabels, labelledBoard } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveText } from '../kit/move-tip';
import { Stepper } from '../kit/stepper';
import { t, type Lang, type StringKey } from '../kit/strings';
import { DEMO, demoFrames, type MoveKind } from './moves-demo';
import movesCss from './pogo-moves.css?raw';

const NS = 'http://www.w3.org/2000/svg';

/** Milliseconds between two frames of the demonstration. */
export const DEMO_INTERVAL = 900;
/** How long the last landing is held before the demonstration starts again, in ms. */
export const DEMO_REST = 2400;

const KIND_KEY: Record<MoveKind, StringKey> = {
  one: 'movesOne',
  diagonal: 'movesDiagonal',
  three: 'movesThree',
  mixed: 'movesMixed',
  onto: 'movesOnto',
};

/** A piece of `colour` drawn as the board draws it, for the key. */
function keyDisc(colour: Colour): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'board key-disc');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const disc = document.createElementNS(NS, 'circle');
  disc.setAttribute('class', `disc ${colour === 'White' ? 'white' : 'red'}`);
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('class', 'ring');
  for (const [c, r] of [
    [disc, '9'],
    [ring, '8.5'],
  ] as const) {
    c.setAttribute('cx', '10');
    c.setAttribute('cy', '10');
    c.setAttribute('r', r);
    svg.append(c);
  }
  return svg;
}

function legend(lang: Lang): HTMLElement {
  const p = document.createElement('p');
  p.className = 'legend label';
  for (const c of ['White', 'Red'] as const) {
    const key = document.createElement('span');
    key.className = 'key';
    key.append(keyDisc(c), t(lang, c === 'White' ? 'white' : 'red'));
    p.append(key);
  }
  return p;
}

/** « Une pièce, un mouvement. Blanc joue a1-1-a2. »: what the move shows, then the move. */
export function announcement(lang: Lang, k: number, mover: Colour): string {
  const d = DEMO[k]!;
  return `${d.kinds.map((kind) => t(lang, KIND_KEY[kind])).join('. ')}. ${announceMove(lang, mover, d.move)}.`;
}

export class PogoMoves extends PogoFigure {
  static override styles = movesCss;

  /** The engine load; a test swaps it. */
  static deps: { engine: () => Promise<void> } = { engine: () => ready(assetUrl(WASM_FILE)) };

  private get view(): 'start' | 'moves' {
    return this.getAttribute('view') === 'start' ? 'start' : 'moves';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Room kept before the render, so the board does not push the text down when it arrives.
    this.stage.style.setProperty('--_stage-min', this.view === 'start' ? '300px' : '520px');
  }

  protected async render(signal: AbortSignal): Promise<void> {
    await (this.constructor as typeof PogoMoves).deps.engine();
    if (signal.aborted) return;
    const lang = this.lang;
    const root = document.createElement('div');
    root.className = 'moves';

    if (this.view === 'start') {
      const board = labelledBoard(drawBoard(initial(), { labelRoom: true, title: t(lang, 'startDescription') }));
      root.append(board, legend(lang));
      this.stage.append(root);
      return;
    }

    const frames = demoFrames();
    // Who plays each move: the side to move in the position it is played from.
    const lines = DEMO.map((_, k) => announcement(lang, k, frames.find((f) => f.move === k)!.state.to_move));

    // The line keeps the room of the longest, so the board under it never moves.
    const said = document.createElement('div');
    said.className = 'said';
    const sizers = lines.map((text) => {
      const p = document.createElement('p');
      p.className = 'line sizer';
      p.setAttribute('aria-hidden', 'true');
      p.textContent = text;
      return p;
    });
    const line = document.createElement('p');
    line.className = 'line';
    said.append(...sizers, line);

    const play = document.createElement('div');
    play.className = 'play';
    const live = document.createElement('p');
    live.className = 'sr';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    let shownMove = -1;
    const show = (i: number): void => {
      const f = frames[i]!;
      const last = DEMO[f.move]!.move;
      const svg = drawBoard(f.state, {
        labelRoom: true,
        ...(f.carry ? { carry: f.carry } : {}),
        ...(f.phase === 'land' ? { to: last[2], moving: last[1] } : {}),
      });
      play.replaceChildren(svg, boardLabels());
      if (f.move !== shownMove) {
        line.replaceChildren(...moveText(lang, lines[f.move]!));
        // Said once per move, when the reader or the figure reaches it; the first is there to read.
        if (shownMove >= 0) live.textContent = lines[f.move]!;
        shownMove = f.move;
      }
    };

    const stepper = new Stepper(frames.length, show, { signal, interval: DEMO_INTERVAL, wrapTo: 0, rest: DEMO_REST });
    const of = t(lang, 'outOf');
    const row = transport(stepper, { lang, unit: 'move', counter: (i) => `${t(lang, 'ply')} ${frames[i]!.move + 1} ${of} ${DEMO.length}` });
    show(0);
    root.append(said, play, row, live);
    this.stage.append(root);
    // Under reduced motion the figure shows its last landing: the stack of both colours carried to its neighbour.
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
  }
}
