// <pogo-moves>: the board as the rules introduce it. `view="start"` is the start
// position to read, and nothing else. `view="moves"` is every move the rules
// allow from one stack, grouped by how many pieces it lifts (moves-demo.ts):
// one board per count, the stack ringed in ink, each possible landing in a
// dashed ring, all of it there at rest. Then each board plays its example, one
// after the other: the pieces lifted, carried square by square, landed, each
// frame at the kit's one tempo, the other boards staying whole. It plays by
// itself on screen and loops after a rest on the last landing
// (kit/autoplay.ts); the reader steps or pauses it with the transport. Under
// reduced motion it rests with every move shown. No move is written in the
// page's notation here: the essay defines it after this figure.
import { WASM_FILE, assetUrl } from '../assets';
import { initial, ready, type Triple } from '../engine';
import { autoplay } from '../kit/autoplay';
import { labelledBoard } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveWords } from '../kit/move-tip';
import { Stepper } from '../kit/stepper';
import { MOVE_TEMPO_MS } from '../kit/tempo';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { fan, fanFrames, type Count, type Fan, type FanFrame } from './moves-demo';
import movesCss from './pogo-moves.css?raw';

/** How long the last landing is held before the demonstration starts again, in ms. */
export const DEMO_REST = 2400;

const CAPTION: Record<Count, StringKey> = { 1: 'movesFan1', 2: 'movesFan2', 3: 'movesFan3' };

const cellName = (i: number): string => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;

/** « Depuis la pile de a1 : une, deux ou trois pièces. Chaque cercle pointillé… » */
export function lead(lang: Lang, from: number): string {
  return `${t(lang, 'movesFanFrom')} ${cellName(from)}${colon(lang)} ${t(lang, 'movesFanLead')}`;
}

/** A group's board in words: its caption, then its landings (« … : c1, b2 ou a3. »). */
export function groupTitle(lang: Lang, count: Count, moves: readonly Triple[]): string {
  const list = new Intl.ListFormat(lang, { type: 'disjunction' }).format(moves.map((m) => cellName(m[2])));
  return `${t(lang, CAPTION[count])}${colon(lang)} ${list}.`;
}

/** Group `k`'s board on frame `f`: at rest unless its example is the one playing. */
function groupBoard(lang: Lang, fanned: Fan, k: number, f: FanFrame): SVGSVGElement {
  const g = fanned.groups[k]!;
  const title = groupTitle(lang, g.count, g.moves);
  const targets = g.moves.map((m) => ({ cell: m[2], kind: 'target' as const }));
  if (f.group !== k) {
    return drawBoard(fanned.state, { labelRoom: true, title, marks: [{ cell: fanned.from, kind: 'picked' }, ...targets] });
  }
  if (f.phase === 'land') {
    const [from, moving, to] = g.example;
    return drawBoard(f.state, { labelRoom: true, title, from, to, moving });
  }
  // carry adds the stack's ink ring itself.
  return drawBoard(f.state, { labelRoom: true, title, marks: targets, ...(f.carry ? { carry: f.carry } : {}) });
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
      root.append(board);
      this.stage.append(root);
      return;
    }

    const fanned = fan();
    const frames = fanFrames(fanned);

    const said = document.createElement('p');
    said.className = 'lead say';
    said.textContent = lead(lang, fanned.from);

    const fanBox = document.createElement('div');
    fanBox.className = 'fan';
    const slots = fanned.groups.map((g) => {
      const figure = document.createElement('figure');
      figure.className = 'fan-group';
      figure.dataset.count = String(g.count);
      const caption = document.createElement('figcaption');
      caption.className = 'say';
      caption.textContent = t(lang, CAPTION[g.count]);
      const slot = document.createElement('div');
      slot.className = 'fan-board';
      figure.append(caption, slot);
      fanBox.append(figure);
      return slot;
    });

    const live = document.createElement('p');
    live.className = 'sr';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    const show = (i: number): void => {
      const f = frames[i]!;
      slots.forEach((slot, k) => slot.replaceChildren(labelledBoard(groupBoard(lang, fanned, k, f))));
      // Said once per example, when its pieces are lifted.
      if (f.phase === 'lift') live.textContent = moveWords(lang, fanned.groups[f.group]!.example);
    };

    const stepper = new Stepper(frames.length, show, { signal, interval: MOVE_TEMPO_MS, wrapTo: 0, rest: DEMO_REST });
    const row = transport(stepper, { lang });
    show(0);
    root.append(said, fanBox, row, live);
    this.stage.append(root);
    // Under reduced motion the figure rests on its first frame: every move of every count shown.
    autoplay(this, stepper, { signal });
  }
}
