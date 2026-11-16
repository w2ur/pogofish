// <pogo-moves>: the board as the rules introduce it. `view="start"` is the start
// position to read, with a key to the two sides. `view="moves"` lets the reader
// lift a stack and see where one, two or three pieces can go (moves-reach.ts,
// from legal()); tapping a destination plays it, so the sides alternate and a
// stack of three soon appears. « Recommencer » goes back to the start.
import { announceMove, chooseCount, describeCell, neighbour, origins, SCREEN_ORDER, tap, type Selection } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import { initial, legal, play as playMove, ready, terminal, winner, type Colour, type Move, type State, type Triple } from '../engine';
import { boardLabels, labelledBoard } from '../kit/board-labels';
import { animateMove, drawBoard } from '../kit/board-svg';
import { choiceGroup, controlButton, type ChoiceGroup } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { colon, t, type Lang } from '../kit/strings';
import { reach, reachText } from './moves-reach';
import movesCss from './pogo-moves.css?raw';

type CountValue = '1' | '2' | '3';
const NS = 'http://www.w3.org/2000/svg';

interface Ui {
  play: HTMLElement;
  svg: SVGSVGElement;
  cells: HTMLButtonElement[];
  count: ChoiceGroup<CountValue>;
  line: HTMLElement;
}

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

export class PogoMoves extends PogoFigure {
  static override fidelity = 'live' as const;
  static override styles = movesCss;

  /** The engine load; a test swaps it. */
  static deps: { engine: () => Promise<void> } = { engine: () => ready(assetUrl(WASM_FILE)) };

  private ui: Ui | undefined;
  private s: State = { cells: [], to_move: 'White', move_count: 0, history: [] };
  private last: Triple | undefined;
  private selection: Selection = null;
  private focusCell = 0;
  private said = '';

  private get view(): 'start' | 'moves' {
    return this.getAttribute('view') === 'start' ? 'start' : 'moves';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Room kept before the render, so the board does not push the text down when it arrives.
    this.stage.style.setProperty('--_stage-min', this.view === 'start' ? '300px' : '480px');
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

    this.s = initial();
    this.last = undefined;
    this.selection = null;
    this.said = '';
    const play = document.createElement('div');
    play.className = 'play';
    const svg = drawBoard(this.s, { labelRoom: true });
    const grid = document.createElement('div');
    grid.className = 'cells';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', t(lang, 'board'));
    const cells: HTMLButtonElement[] = [];
    for (const i of SCREEN_ORDER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell-button';
      b.dataset.cell = String(i);
      b.addEventListener('click', () => this.onCell(i));
      cells[i] = b;
      grid.append(b);
    }
    grid.addEventListener('keydown', (e) => this.onArrow(e));
    play.append(svg, boardLabels(), grid);

    const count = choiceGroup<CountValue>({
      label: `${t(lang, 'pieces')}${colon(lang)}`,
      id: 'moves-counts-label',
      choices: (['1', '2', '3'] as const).map((n) => ({ value: n, label: n })),
      onChoose: (n) => {
        this.selection = chooseCount(this.selection, this.moves(), Number(n));
        this.update(false);
      },
    });
    count.element.classList.add('counts');

    const line = document.createElement('p');
    line.className = 'line';
    line.setAttribute('aria-live', 'polite');

    const row = document.createElement('div');
    row.className = 'controls';
    row.append(
      controlButton(
        t(lang, 'restart'),
        () => {
          this.s = initial();
          this.last = undefined;
          this.selection = null;
          this.said = '';
          this.update(false);
        },
        true,
      ),
    );

    root.append(play, count.element, line, row);
    root.addEventListener('keydown', this.onKey);
    this.ui = { play, svg, cells, count, line };
    signal.addEventListener('abort', () => (this.ui = undefined), { once: true });
    this.stage.append(root);
    this.update(false);
  }

  /** legal() while the game is open; nothing once every stack has one colour on top. */
  private moves(): Move[] {
    return terminal(this.s, null) ? [] : legal(this.s);
  }

  private onCell(i: number): void {
    this.focusCell = i;
    const r = tap(this.selection, this.moves(), i);
    if ('play' in r) {
      this.said = `${announceMove(this.lang, this.s.to_move, r.play)}. `;
      const before = this.ui?.svg;
      this.s = playMove(this.s, r.play);
      this.last = r.play;
      this.selection = null;
      this.update(true, before);
      return;
    }
    this.selection = r.selection;
    this.update(false);
  }

  private onArrow(e: KeyboardEvent): void {
    const from = Number((e.target as HTMLElement).dataset.cell ?? this.focusCell);
    const to = neighbour(from, e.key);
    if (to === from && !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    this.focusCell = to;
    this.syncFocus();
    this.ui?.cells[to]?.focus();
  }

  /** 1/2/3 choose the count, Escape puts the stack down. */
  private onKey = (e: KeyboardEvent): void => {
    if (this.selection === null) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.selection = null;
      this.update(false);
    } else if (['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      this.selection = chooseCount(this.selection, this.moves(), Number(e.key));
      this.update(false);
    }
  };

  private syncFocus(): void {
    this.ui?.cells.forEach((b, i) => (b.tabIndex = i === this.focusCell ? 0 : -1));
  }

  private update(moved: boolean, before?: SVGSVGElement): void {
    const ui = this.ui;
    if (!ui) return;
    const lang = this.lang;
    const moves = this.moves();
    const sel = this.selection;
    const lift = origins(moves);
    const options = sel ? reach(moves, sel.from) : [];
    const land = options.find((o) => o.count === sel?.count)?.cells ?? [];

    const marks: { cell: number; kind: 'target' | 'picked' }[] = sel
      ? [{ cell: sel.from, kind: 'picked' }, ...land.map((cell) => ({ cell, kind: 'target' as const }))]
      : lift.map((cell) => ({ cell, kind: 'target' as const }));
    const svg = drawBoard(this.s, {
      labelRoom: true,
      marks,
      // Only where the last move landed: a dashed ring on a board that takes input means "tap here".
      ...(this.last ? { to: this.last[2], moving: this.last[1] } : {}),
    });
    ui.svg.replaceWith(svg);
    if (moved && before && this.last && !this.reducedMotion()) animateMove(before, svg, this.last);
    ui.svg = svg;

    ui.cells.forEach((b, i) => {
      const mark = sel?.from === i ? 'selected' : land.includes(i) ? 'target' : !sel && lift.includes(i) ? 'can-lift' : null;
      const actionable = mark !== null || lift.includes(i);
      b.setAttribute('aria-label', describeCell(lang, this.s, i, mark));
      b.toggleAttribute('data-actionable', actionable);
      b.setAttribute('aria-disabled', String(!actionable));
    });
    this.syncFocus();

    const available = options.map((o) => o.count);
    ui.count.element.toggleAttribute('data-off', sel === null);
    ui.count.buttons.forEach((b, k) => (b.hidden = !available.includes(k + 1)));
    ui.count.set(sel ? (String(sel.count) as CountValue) : null);

    let text: string;
    if (sel) text = reachText(lang, sel.from, sel.count, land);
    else if (moves.length > 0) text = `${this.said}${t(lang, this.s.to_move === 'White' ? 'liftWhite' : 'liftRed')}`;
    else text = `${this.said}${t(lang, winner(this.s, null) === 'R' ? 'byStacksRed' : 'byStacksWhite')}`;
    ui.line.textContent = text;
  }
}

