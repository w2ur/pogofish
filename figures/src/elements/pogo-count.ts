// <pogo-count>: the one thing the essay's computation cannot show. A position
// IS a pile of 12 pieces cut by 8 separators (count-row.ts). The figure is a
// toy (kit/toy.ts): once, when it first comes on screen, the pieces of a real
// position leave the board square after square and lie end to end in one row,
// a separator at every change of square. Then it is the reader's, for good:
//
//   - on the board, pieces are taken as on every board of the page
//     (kit/take-pieces.ts): the stack, how many, where they land. Any square
//     may receive them: every arrangement of the twelve pieces is a position;
//   - in the row, a piece or a separator is dragged to another place
//     (kit/drag.ts: pointer, tap then tap, or keyboard), the things between
//     closing up as it passes;
//   - the line under the board passes the turn, the third thing a position is
//     (the count chooser takes its place while a stack is lifted).
//
// Whichever side the reader touches, the other follows at once. The figure
// computes nothing and repeats none of the essay's numbers.
//
// How it reads is drawn (count-view.ts): at the board's left, an arrow along
// each rank and one from the bottom rank to the top; over the row, an arrow
// from its first place, with the one thing an arrow cannot say (a stack is laid
// bottom first); under the row, each run of pieces carries the name of its
// square, so a separator is seen to fall at every change of square. A stack
// lifted on the board has its square's name stamped under the row.
//
// One drawing holds the board and the row, so the twelve pieces of the
// introduction are the same twelve all along. Each has a twin on the other
// side: dimmed while the introduction plays, whole once the toy is ready.
import { WASM_FILE, assetUrl } from '../assets';
import { DEFAULT_GAME } from '../default-game';
import { ready, replay, type Colour, type State, type Triple } from '../engine';
import { boardLabels } from '../kit/board-labels';
import { MOVE_MS } from '../kit/board-svg';
import { dragAndDrop, type DragMove } from '../kit/drag';
import { PogoFigure } from '../kit/figure';
import { labelTip } from '../kit/move-tip';
import { colon, t } from '../kit/strings';
import { takePieces } from '../kit/take-pieces';
import { readingMark, toy, type Toy } from '../kit/toy';
import { boardMoves, moveItem, movePieces, rowItems, type Edit } from './count-edit';
import { BARS, PIECES, fromRow, places, toRow, type Row } from './count-row';
import { BAR_REACH, CELL, LAYOUTS, RADIUS, hitReach, layoutFor, orderArrows, pickedRing, rowSpot, runs, scene, targetCorners, type Layout, type Spot } from './count-view';
import countCss from './pogo-count.css?raw';

const NS = 'http://www.w3.org/2000/svg';

/** The position shown: the page's default game (default-game.ts) after this many moves, the one the essay's own drawings use. */
export const SHOWN_PLY = 3;

/** The introduction: the position is held this long, then its row, in ms. */
export const INTRO_HOLD = [1600, 3800] as const;
/** Under a finger, what is held is drawn this many CSS pixels above it, so the finger does not hide it. */
const FINGER_LIFT = 30;
/** How the pieces travel when the position unfolds: each one this long, a square's pieces this long after the square before. */
const TRAVEL_MS = 650;
const SQUARE_MS = 170;

type Travel = 'unfold' | 'edit' | null;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

const transformOf = (s: Spot): string => `translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px) scale(${s.scale.toFixed(4)})`;
const cellName = (i: number): string => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;

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

  /** The engine, and the game the position is taken from; a test swaps them. */
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
    const shown = states[SHOWN_PLY] ?? states.at(-1)!;

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    /** The position, as its row and the side to move: the reader's once the toy is ready. */
    const view: { row: Row; turn: Colour } = { row: toRow(shown.cells), turn: shown.to_move };
    /** Where the twelve pieces of the introduction are; their twins are on the other side. */
    let solid: 'board' | 'row' = 'board';
    let isReady = false;
    let play: Toy | undefined;
    /** The reader acts before the introduction is over (a key, a script): the toy is theirs first. */
    const own = (): void => {
      if (!isReady) play?.skip();
    };

    const root = el('div', 'count');
    // What the introduction says, in the place the invitation takes once it is over.
    const say = el('p', 'say');
    say.setAttribute('aria-live', 'polite');
    const sceneBox = el('div', 'scene');
    // The kit's board class: the squares, the pieces and the marks are painted by the theme, as on every board.
    const svg = svgEl('svg', { class: 'board drawing', 'aria-hidden': 'true' });
    const squares = svgEl('g', { class: 'squares' }, svg);
    const order = svgEl('g', { class: 'order' }, svg);
    const rail = svgEl('line', { class: 'rail' }, svg);
    const twinLayer = svgEl('g', { class: 'twins' }, svg);
    const barLayer = svgEl('g', { class: 'bars' }, svg);
    const pieceLayer = svgEl('g', { class: 'pieces' }, svg);
    const markLayer = svgEl('g', { class: 'marks' }, svg);

    // The turn line is the third thing a position is: a tap passes it.
    const turn = el('button', 'turn');
    turn.type = 'button';
    const turnText = el('span', 'turn-text');
    turn.append(el('span', 'turn-piece'), turnText);
    labelTip(turn, t(lang, 'countPassTurn'));

    // The board: the page's one way to take pieces, over the drawing.
    const state = (): State => ({ cells: fromRow(view.row), to_move: view.turn, move_count: 0, history: [] });
    const take = takePieces({
      lang,
      id: 'count-counts-label',
      keys: root,
      state,
      moves: () => boardMoves(fromRow(view.row)),
      onPlay: ([from, n, to]) => {
        own();
        commit(movePieces(view.row, from, n, to));
        paint('edit');
      },
      onChange: () => {
        own();
        paint(null);
      },
    });
    const boardBox = el('div', 'board-hit');
    boardBox.append(boardLabels(), take.grid);
    const underBox = el('div', 'under');
    underBox.append(turn, take.counts.element);

    // The row: twenty places, each a button laid over what the drawing holds there.
    const rowHits = el('div', 'row-hits');
    rowHits.setAttribute('role', 'group');
    rowHits.setAttribute('aria-label', t(lang, 'countRow'));
    const placeButtons = Array.from({ length: PIECES + BARS }, (_, p) => {
      const b = el('button', 'row-hit');
      b.type = 'button';
      b.dataset.place = String(p);
      return b;
    });
    rowHits.append(...placeButtons);
    const what = { White: 'countPieceWhite', Red: 'countPieceRed', bar: 'countBar' } as const;
    /** A pointer drag under way, and how many units of the drawing one CSS pixel is. */
    let dragging: DragMove | null = null;
    let unitsPerPixel = 1;
    let lift = 0;
    /** The drop that ends a pointer drag lands where the drag already showed it: nothing travels. */
    let dropped = false;
    const drag = dragAndDrop({
      lang,
      places: placeButtons,
      canTake: () => true,
      onDrop: (from, to) => {
        own();
        commit(moveItem(view.row, from, to));
        paint(dropped ? null : 'edit');
      },
      name: (p) => `${t(lang, 'countPlace')} ${p + 1}${colon(lang)} ${t(lang, what[rowItems(view.row)[p]!])}`,
      onDrag: (d) => {
        if (d && !dragging) {
          own();
          const width = svg.getBoundingClientRect().width;
          unitsPerPixel = width > 0 ? layout.width / width : 1;
          lift = matchMedia('(pointer: coarse)').matches ? FINGER_LIFT : 0;
        }
        dragging = d;
        if (!d) {
          dropped = true;
          setTimeout(() => (dropped = false), 0);
        }
        paint(d ? 'edit' : null);
      },
      signal,
    });

    // How the row reads: an arrow from its first place, and the name of each run's square under it.
    const rowHead = el('div', 'row-head');
    rowHead.append(readingMark('right', t(lang, 'countReads')));
    const names = el('div', 'run-names');
    names.setAttribute('aria-hidden', 'true');
    const runNames = Array.from({ length: 9 }, (_, i) => {
      const n = el('span', 'run-name num', cellName(i));
      n.dataset.cell = String(i);
      return n;
    });
    names.append(...runNames);
    sceneBox.append(svg, boardBox, rowHits, underBox, rowHead, names);

    // The twelve pieces, and their twins: piece d has rank at[d] in the row.
    const colours = [...view.row.order];
    const pieces = colours.map((c) => piece(c, pieceLayer));
    const twins = colours.map((c) => piece(c, twinLayer));
    let at = colours.map((_, d) => d);
    const bars = Array.from({ length: BARS }, () => svgEl('rect', { class: 'bar' }, barLayer));
    let barAt = bars.map((_, j) => j);
    /** The reader's edit becomes the position: each piece and each separator keeps its own drawing. */
    const commit = (edit: Edit): void => {
      view.row = edit.row;
      at = at.map((rank) => edit.pieces[rank]!);
      barAt = barAt.map((j) => edit.bars[j]!);
    };

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
      order.replaceChildren();
      for (const d of orderArrows(l)) svgEl('path', { d }, order);
      const { slot, x, y } = l.row;
      const foot = y + slot * BAR_REACH;
      for (const [k, v] of Object.entries({ x1: x, x2: x + (PIECES + BARS) * slot, y1: foot, y2: foot })) rail.setAttribute(k, v.toFixed(1));
      for (const bar of bars) {
        for (const [k, v] of Object.entries({ x: -slot * 0.06, y: -slot * BAR_REACH, width: slot * 0.12, height: slot * 2 * BAR_REACH })) bar.setAttribute(k, v.toFixed(2));
      }
      const pct = (units: number, of: number): string => `${((units / of) * 100).toFixed(3)}%`;
      const box = (node: HTMLElement, left: number, top: number, w: number, h: number): void => {
        node.style.left = pct(left, l.width);
        node.style.top = pct(top, l.height);
        node.style.width = pct(w, l.width);
        node.style.height = pct(h, l.height);
      };
      box(boardBox, l.board.x, l.board.y, 3 * CELL, 3 * CELL);
      // Under the board, one box: the line that says whose turn it is, or the count chooser while a stack is lifted.
      box(underBox, l.under.x, l.under.y, l.under.width, l.under.height);
      // A place's button is its slot, as tall as a separator at least.
      placeButtons.forEach((b, p) => box(b, x + p * slot, y - hitReach(l), slot, 2 * hitReach(l)));
      rowHead.style.left = pct(x, l.width);
      rowHead.style.top = pct(y - slot * BAR_REACH, l.height);
      names.style.top = pct(foot, l.height);
    };

    const canAnimate = typeof pieces[0]!.animate === 'function';
    /** Puts `node` at `to`, travelling from where it was when `travel` is set. */
    const move = (node: SVGElement, to: Record<string, string>, travel: { delay: number; duration: number } | null): void => {
      const from: Record<string, string> = {};
      for (const k of Object.keys(to)) from[k] = node.style.getPropertyValue(k);
      const same = Object.keys(to).every((k) => from[k] === to[k]);
      // Already there, or on its way there: a travel under way is left to end.
      if (same && travel) return;
      // A travel still under way ends where it was going: the next one starts from there.
      if (canAnimate) for (const a of node.getAnimations()) a.finish();
      for (const [k, v] of Object.entries(to)) node.style.setProperty(k, v);
      if (!travel || !canAnimate || same || Object.keys(to).some((k) => from[k] === '')) return;
      node.animate([from, to], { ...travel, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'backwards' });
    };

    const paint = (travel: Travel): void => {
      // While a pointer drags, the row is shown as a drop would leave it, and the board follows.
      const preview = dragging && dragging.over !== null ? moveItem(view.row, dragging.from, dragging.over) : null;
      const row = preview?.row ?? view.row;
      const rank = (d: number): number => (preview ? preview.pieces[at[d]!]! : at[d]!);
      const barRank = (j: number): number => (preview ? preview.bars[barAt[j]!]! : barAt[j]!);
      const s = scene(layout, row);
      const [onBoard, inRow] = solid === 'board' ? [pieces, twins] : [twins, pieces];
      const staged = travel === 'unfold';
      const timing = (cell: number): { delay: number; duration: number } | null =>
        travel === null ? null : staged ? { delay: cell * SQUARE_MS, duration: TRAVEL_MS } : { delay: 0, duration: MOVE_MS };

      // What the pointer holds, in the row as it was when taken: it follows the pointer, and nothing else moves it.
      const taken = dragging ? places(view.row) : null;
      const heldPiece = taken && dragging ? taken.pieces.indexOf(dragging.from) : -1;
      const heldBar = taken && dragging ? taken.bars.indexOf(dragging.from) : -1;
      const underPointer = (scale?: number): string => {
        const spot = rowSpot(layout, dragging!.from);
        return transformOf({ scale: scale ?? spot.scale, x: spot.x + dragging!.dx * unitsPerPixel, y: spot.y + (dragging!.dy - lift) * unitsPerPixel });
      };

      // On the board a stack is painted bottom first: its pieces are put back in the row's order.
      const boardLayer = solid === 'board' ? pieceLayer : twinLayer;
      boardLayer.replaceChildren(...onBoard.map((p, d) => ({ p, r: rank(d) })).sort((a, b) => a.r - b.r).map((x) => x.p));
      onBoard.forEach((p, d) => {
        const spot = s.board[rank(d)]!;
        p.dataset.rank = String(rank(d));
        // The twins never travel in the introduction: they are the trace the pieces leave.
        move(p, { transform: transformOf(spot) }, staged && solid === 'row' ? null : timing(spot.cell));
      });
      inRow.forEach((p, d) => {
        const spot = s.row[rank(d)]!;
        const held = at[d] === heldPiece;
        p.dataset.rank = String(rank(d));
        p.toggleAttribute('data-held', held);
        move(p, { transform: held ? underPointer() : transformOf(spot) }, held || (staged && solid === 'board') ? null : timing(spot.cell));
        // What is held is drawn last, over its neighbours.
        if (held) p.parentNode!.append(p);
      });
      // The separators belong to the row: dimmed with it while the pieces are on the board, one standing after each square laid down.
      const dim = !isReady && solid === 'board';
      bars.forEach((bar, j) => {
        const held = barAt[j] === heldBar;
        const when = held ? null : staged ? { delay: (barRank(j) + 1) * SQUARE_MS, duration: 300 } : timing(0);
        bar.toggleAttribute('data-held', held);
        move(bar, { transform: held ? underPointer(1) : transformOf({ ...s.bars[barRank(j)]!, scale: 1 }), opacity: dim ? '0.3' : '1' }, when);
      });
      twinLayer.toggleAttribute('data-fresh', staged);

      // The marks of the board: the stack lifted and where it may land, or the stacks that may be lifted.
      markLayer.replaceChildren();
      const lifted = take.selection()?.from ?? null;
      if (isReady) {
        for (const m of take.marks()) {
          if (m.kind === 'picked') svgEl('circle', { class: 'mark picked', 'data-cell': m.cell, ...pickedRing(layout, m.cell) }, markLayer);
          else svgEl('path', { class: 'mark target', 'data-cell': m.cell, d: targetCorners(layout, m.cell) }, markLayer);
        }
      }

      // Under the row, each run of pieces carries its square's name; the lifted stack's is stamped.
      const found = runs(layout, row);
      runNames.forEach((n, i) => {
        const run = found.find((r) => r.cell === i);
        n.hidden = !run;
        if (run) n.style.left = `${((run.x / layout.width) * 100).toFixed(3)}%`;
        n.toggleAttribute('data-on', lifted === i);
      });

      root.dataset.solid = solid;
      root.toggleAttribute('data-lifted', lifted !== null);
      root.toggleAttribute('data-dragging', dragging !== null);
      turnText.textContent = t(lang, view.turn === 'White' ? 'countTurnWhite' : 'countTurnRed');
      turn.dataset.turn = view.turn;
      root.dataset.row = rowItems(view.row)
        .map((x) => (x === 'bar' ? '|' : x[0]))
        .join('');
      take.sync();
      drag.sync();
    };

    turn.addEventListener(
      'click',
      () => {
        own();
        view.turn = view.turn === 'White' ? 'Red' : 'White';
        paint(null);
      },
      { signal },
    );

    lay(layoutFor(this.getBoundingClientRect().width || LAYOUTS.mid.width));
    paint(null);
    const top = el('div', 'top');
    this.stage.append(root);
    play = toy(this, {
      root,
      invite: t(lang, 'countInvite'),
      intro: {
        steps: INTRO_HOLD.length,
        interval: (i) => INTRO_HOLD[i]!,
        show: (i) => {
          solid = i === 0 ? 'board' : 'row';
          say.textContent = t(lang, i === 0 ? 'countSayBoard' : 'countSayUnfold');
          paint(i === 0 || this.reducedMotion() ? null : 'unfold');
        },
      },
      onReady: () => {
        isReady = true;
        say.textContent = '';
        paint(null);
      },
      signal,
    });
    top.append(say, play.invite);
    root.append(top, sceneBox, drag.live);

    if (typeof ResizeObserver === 'function') {
      const sizes = new ResizeObserver((entries) => {
        const width = entries.at(-1)?.contentRect.width ?? 0;
        if (width === 0 || layoutFor(width) === layout) return;
        lay(layoutFor(width));
        paint(null);
      });
      sizes.observe(this);
      signal.addEventListener('abort', () => sizes.disconnect(), { once: true });
    }
  }
}
