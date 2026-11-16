// <pogo-net kind="td|az">: a net at work, nodes and links (figs. 16 and 20).
// At the left a position; then every unit of every layer as a node, the layers
// read from the loaded file's header (net-graph.ts) and laid out in columns
// (net-layout.ts); between them, on one canvas (net-canvas.ts), each neuron's
// strongest links for this position, by |weight × activation|, and the figure
// says how many of all the links that is. The signal crosses the net: the
// inputs light up from the position, their links reach the first layer, which
// lights, and so on to the output, where the value appears on its −1…+1 scale
// (and, for AlphaZero, the preferred moves with their shares). Red is a
// positive number, ink a negative one, the stronger the plainer. Everything
// drawn is computed in the page from the real weights.
//
// Then another position, and the flow again: the figure walks through the
// essay's game, starting on the position <pogo-encoding> opens on
// (net-position.ts), and loops. When the reader has a game on the page's
// board, the figure takes that game instead, rests on its latest position and
// runs the flow each time the reader or the computer moves. The reader may
// pause, step, hand the position to the board, and point at any node (or walk
// the nodes with the arrow keys) to read its value and see its own links.
// Under reduced motion nothing moves: each position is drawn lit.
import { DEFAULT_GAME } from '../default-game';
import { LC1_2, key, moveName, replay, terminal, type Colour, type Move, type State, type Triple } from '../engine';
import { autoplay, type Playable } from '../kit/autoplay';
import { labelledBoard } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { progress, transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveTip } from '../kit/move-tip';
import { formatShare } from '../kit/score';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang } from '../kit/strings';
import type { Anatomy, AzNet, TdNet } from '../nets';
import { sharedAz, sharedTd } from '../nets-shared';
import { store, type Store } from '../store';
import { formatCount } from './count-steps';
import { CELLS, PER_CELL, SLOTS } from './encoding-rows';
import { inputText } from './input-text';
import { drawNet, flowEnd, type Palette, type Probe } from './net-canvas';
import { netGraph, signal, type GraphColumn, type NetGraph, type Signal } from './net-graph';
import { layoutNet, nodeAt, type NetLayout } from './net-layout';
import { DEFAULT_PLY } from './net-position';
import { azReadout, type PolicyRow } from './net-readout';
import netCss from './pogo-net.css?raw';

export type NetKind = 'td' | 'az';

/** Links drawn into each neuron: its strongest for the position shown. */
export const PER_NODE = 6;
/** Milliseconds the signal takes from one layer to the next. */
export const STEP_MS = 850;
/** Milliseconds a position stays lit, its value shown, before the next. */
export const HOLD_MS = 2800;
/** Preferred moves listed for AlphaZero. */
export const TOP_MOVES = 5;

export function parseKind(attr: string | null): NetKind {
  if (attr === 'td' || attr === 'az') return attr;
  throw new Error(`pogo-net: kind must be td or az, not ${JSON.stringify(attr)}`);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const colourName = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'white' : 'red');

/** A number of the net, two decimals: « 0,82 », « −1,00 »; signed when asked (« +0,43 »). */
export function netNumber(lang: Lang, x: number, signed = false): string {
  const rounded = Math.abs(x) < 0.005 ? 0 : x;
  const text = Math.abs(rounded).toFixed(2);
  const sign = rounded < 0 ? '−' : signed && rounded > 0 ? '+' : '';
  return sign + (lang === 'fr' ? text.replace('.', ',') : text);
}

/** How long a position is shown: the signal's crossing, then the hold. */
export const positionMs = (graph: NetGraph): number => Math.round(flowEnd(graph.ranks) * STEP_MS) + HOLD_MS;

/** « 1 152 liaisons dessinées sur 24 512 : les 6 plus fortes de chaque neurone, pour cette position. » */
export function drawnWords(lang: Lang, drawn: number, all: number): string {
  return `${formatCount(lang, drawn)} ${t(lang, 'netDrawnOf')} ${formatCount(lang, all)}${colon(lang)} ${t(lang, 'netDrawnBefore')} ${PER_NODE} ${t(lang, 'netDrawnAfter')}.`;
}

/** The move a policy output stands for: from × 27 + (count − 1) × 9 + to (nets.ts, policyIndex). */
export function outputMove(index: number): Triple {
  return [Math.floor(index / 27), Math.floor((index % 27) / 9) + 1, index % 9];
}

const cellName = (i: number): string => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;

/** What input `i` stands for: « b1, étage 2 », « b1, sommet », « b1, hauteur ÷ 12 », « répétitions ÷ 2 ». */
export function inputWords(lang: Lang, i: number): string {
  if (i >= CELLS * PER_CELL) return t(lang, 'netInRepetitions');
  const cell = cellName(Math.floor(i / PER_CELL));
  const k = i % PER_CELL;
  if (k < SLOTS) return `${cell}, ${t(lang, 'netInLevel')} ${k + 1}`;
  return `${cell}, ${t(lang, k === SLOTS ? 'encTop' : 'encHeight')}`;
}

/** The words for the node under the pointer: which it is, and its value for this position. */
export function probeWords(lang: Lang, graph: NetGraph, sig: Signal, p: Probe): string {
  const c = graph.columns[p.column]!;
  const value = sig.values[p.column]![p.node]!;
  const of = `${p.node + 1} ${t(lang, 'outOf')} ${formatCount(lang, c.units)}`;
  if (c.role === 'input') return `${t(lang, 'netInput')} ${of} (${inputWords(lang, p.node)})${colon(lang)} ${inputText(lang, value)}`;
  if (c.role === 'value') return `${t(lang, 'netNoteWord')}${colon(lang)} ${netNumber(lang, value, true)}`;
  if (c.role === 'policy') {
    const name = moveName(outputMove(p.node));
    return value > 0
      ? `${t(lang, 'netPreferenceFor')} ${name}${colon(lang)} ${formatShare(lang, value)}`
      : `${name}${colon(lang)} ${t(lang, 'netIllegalHere')}, 0`;
  }
  const layer = c.band === 'policy' ? t(lang, 'netLayerPolicy') : c.band === 'value' ? t(lang, 'netLayerValue') : `${t(lang, 'netLayer')} ${c.rank}`;
  return `${layer}, ${t(lang, 'netNeuron')} ${of}${colon(lang)} ${netNumber(lang, value)}`;
}

/** The two lines under a column: its count, and what it counts. */
function columnLabel(lang: Lang, c: GraphColumn): HTMLElement {
  const label = el('span', 'col-label');
  const word = c.role === 'input' ? 'netInputs' : c.role === 'hidden' ? 'netNeurons' : c.role === 'policy' ? 'netPrefs' : 'netNote';
  label.append(el('span', 'n num', formatCount(lang, c.units)), el('span', 'w', t(lang, word)));
  label.dataset.role = c.role;
  label.dataset.units = String(c.units);
  return label;
}

/** One position the figure shows, and the move that led to it. */
interface Shown {
  state: State;
  move?: Triple;
}

/** The positions of a game that still have a move to play. */
function open(states: readonly State[], moves: readonly Triple[]): Shown[] {
  const out: Shown[] = [];
  states.forEach((state, i) => {
    if (terminal(state, LC1_2)) return;
    out.push(i === 0 ? { state } : { state, move: moves[i - 1]! });
  });
  return out;
}

export class PogoNet extends PogoFigure {
  static override styles = netCss;
  /** A floor only: pogo-net.css keeps each kind's measured room, by width. */
  static override stageMinHeight = '626px';
  /** The game, the engine and the two nets; a test swaps them. */
  static deps: { store: Store; az: () => Promise<AzNet & Anatomy>; td: () => Promise<TdNet & Anatomy> } = { store, az: sharedAz, td: sharedTd };

  protected async render(signal_: AbortSignal): Promise<void> {
    const kind = parseKind(this.getAttribute('kind'));
    const deps = (this.constructor as typeof PogoNet).deps;
    // nets.ts is imported on demand: a static import would pull the parser into the eager bundle.
    const [net, { policyIndex }] = await Promise.all([kind === 'az' ? deps.az() : deps.td(), import('../nets'), deps.store.ready()]);
    if (signal_.aborted) return;
    const lang = this.lang;
    const graph = netGraph(net.header);
    const end = flowEnd(graph.ranks);

    const root = el('div', `net net-${kind}`);
    root.dataset.flow = 'arrived';

    // The position.
    const boardSlot = el('div', 'board-slot');

    // The net: labels above (the preference head's), the canvas, labels below.
    const draw = el('div', 'net-draw');
    const top = el('div', 'col-labels top');
    const bottom = el('div', 'col-labels bottom');
    const labels = graph.columns.map((c) => {
      const label = columnLabel(lang, c);
      (c.band === 'policy' ? top : bottom).append(label);
      return label;
    });
    const wrap = el('div', 'canvas-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', t(lang, 'netCanvas'));
    const canvas = el('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    // Five swatches the canvas reads its colours from: the tokens resolve here, in both themes.
    const swatches = el('span', 'swatches');
    swatches.setAttribute('aria-hidden', 'true');
    const swatch = Object.fromEntries((['red', 'ink', 'ground', 'rule', 'edge'] as const).map((name) => [name, el('i', `sw-${name}`)])) as Record<keyof Palette, HTMLElement>;
    swatches.append(...Object.values(swatch));
    wrap.append(canvas, swatches);
    const legend = el('p', 'legend');
    const dot = (cls: string, text: string): HTMLElement => {
      const item = el('span', 'legend-item');
      item.append(el('i', `dot ${cls}`), text);
      return item;
    };
    const drawnLine = el('span', 'drawn num');
    legend.append(dot('positive', t(lang, 'netPositive')), dot('negative', t(lang, 'netNegative')), el('span', 'legend-item', t(lang, 'netStrong')), drawnLine);
    const probeLine = el('p', 'probe num', t(lang, 'netProbeHint'));
    probeLine.setAttribute('aria-live', 'polite');
    draw.append(...(top.childElementCount ? [top] : []), wrap, bottom, legend, probeLine);

    // The output: the value on its scale; for AlphaZero, the preferred moves.
    const out = el('div', 'net-out');
    const note = el('div', 'note');
    const noteNumber = el('p', 'shout num note-number late');
    const scale = el('div', 'scale late');
    scale.setAttribute('aria-hidden', 'true');
    const marker = el('span', 'marker');
    scale.append(el('span', 'axis'), el('span', 'zero'), marker);
    const ends = el('div', 'scale-ends num');
    ends.setAttribute('aria-hidden', 'true');
    ends.append(el('span', '', `−1 ${t(lang, 'netLoss')}`), el('span', '', `+1 ${t(lang, 'netWin')}`));
    const noteFor = el('p', 'note-for');
    note.append(el('p', 'label out-title', t(lang, 'netNoteTitle')), noteNumber, scale, ends, noteFor);
    out.append(note);
    const moves = kind === 'az' ? el('div', 'moves') : null;
    const moveList = el('ol', 'move-list late');
    const others = el('p', 'others num late');
    if (moves) {
      moves.append(el('p', 'label out-title', t(lang, 'netTopMoves')), moveList, others);
      out.append(moves);
    }

    const body = el('div', 'net-body');
    body.append(boardSlot, draw, out);
    const controls = el('div', 'controls-slot');
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    root.append(body, controls, live);

    // What is shown now.
    let positions: Shown[] = [];
    let shown = 0;
    let sig: Signal | null = null;
    let layout: NetLayout | null = null;
    let palette: Palette | null = null;
    let probe: Probe | null = null;
    let tau = end;
    let frame = 0;
    let marked: Move | null = null;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;

    const readPalette = (): void => {
      if (typeof getComputedStyle !== 'function') return;
      palette = Object.fromEntries(Object.entries(swatch).map(([name, node]) => [name, getComputedStyle(node).color])) as unknown as Palette;
    };
    const paint = (): void => {
      if (!ctx || !layout || !sig || !palette) return;
      drawNet(ctx, { layout, graph, signal: sig, tau, palette, probe });
    };
    /** The canvas takes its box's size, at the screen's own density, and the nodes their places. */
    const resize = (width: number, height: number): void => {
      if (width < 1 || height < 1) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = layoutNet(graph, width, height, { padX: Math.min(44, Math.max(37, width * 0.09)) });
      labels.forEach((label, i) => (label.style.left = `${((layout!.columns[i]!.cx / width) * 100).toFixed(3)}%`));
      readPalette();
      paint();
    };

    const drawBoardPart = (): void => {
      const p = positions[shown]!;
      const marks = marked ? [{ cell: marked.from_cell, kind: 'picked' as const }, { cell: marked.to_cell, kind: 'target' as const }] : [];
      const title = `${t(lang, 'position')}${colon(lang)} ${t(lang, 'ply')} ${shown}, ${colourName(lang, p.state.to_move)} ${t(lang, 'toMove')}`;
      boardSlot.replaceChildren(
        labelledBoard(drawBoard(p.state, { labelRoom: true, title, marks, ...(p.move && !marked ? { to: p.move[2], moving: p.move[1] } : {}) })),
      );
    };

    const arrive = (): void => {
      root.dataset.flow = 'arrived';
    };
    const stopFlow = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    /** Sends the signal across the net for the position shown; under reduced motion it is there at once. */
    const flow = (): void => {
      stopFlow();
      if (this.reducedMotion() || typeof requestAnimationFrame !== 'function' || !ctx) {
        tau = end;
        paint();
        arrive();
        return;
      }
      readPalette();
      root.dataset.flow = 'running';
      const start = performance.now();
      const step = (now: number): void => {
        tau = Math.min(end, (now - start) / STEP_MS);
        paint();
        if (tau < end) frame = requestAnimationFrame(step);
        else {
          frame = 0;
          arrive();
        }
      };
      tau = 0;
      paint();
      frame = requestAnimationFrame(step);
    };

    const setProbe = (next: Probe | null): void => {
      if (next?.column === probe?.column && next?.node === probe?.node) return;
      probe = next;
      probeLine.textContent = probe && sig ? probeWords(lang, graph, sig, probe) : t(lang, 'netProbeHint');
      probeLine.toggleAttribute('data-on', probe !== null);
      if (!frame) paint();
    };

    /** Computes and shows position `i`: the board, the signal, the outputs; `run` sends the flow. */
    const show = (i: number, run: boolean): void => {
      shown = i;
      marked = null;
      const p = positions[i]!;
      const acts = net.forward(p.state);
      let rows: PolicyRow[] = [];
      let priors: Map<number, number> | undefined;
      if (kind === 'az') {
        const az = net as AzNet & Anatomy;
        rows = azReadout(az, p.state, policyIndex).rows;
        priors = new Map(rows.map((r) => [policyIndex(r.move), r.prior]));
      }
      sig = signal(net, graph, acts, PER_NODE, priors);
      const valueColumn = graph.columns.findIndex((c) => c.role === 'value');
      const value = sig.values[valueColumn]![0]!;
      root.dataset.position = key(p.state);
      root.dataset.value = String(value);
      drawBoardPart();
      noteNumber.textContent = netNumber(lang, value, true);
      note.dataset.sign = value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
      marker.style.left = `${(((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100).toFixed(3)}%`;
      noteFor.textContent = `${t(lang, 'netForBefore')} ${colourName(lang, p.state.to_move)}${t(lang, 'netForAfter')}`;
      drawnLine.textContent = drawnWords(lang, sig.drawn, graph.links);
      if (moves) {
        const best = rows.slice(0, TOP_MOVES);
        moveList.replaceChildren(
          ...best.map((r) => {
            const li = el('li', 'move-row');
            li.dataset.move = r.name;
            const name = el('span', 'move num');
            name.append(
              moveTip(lang, r.move, {
                show: () => {
                  marked = r.move;
                  drawBoardPart();
                },
                hide: () => {
                  marked = null;
                  drawBoardPart();
                },
              }),
            );
            const bar = el('span', 'bar');
            bar.style.setProperty('--share', r.prior.toFixed(4));
            li.append(name, el('span', 'share num', formatShare(lang, r.prior)), bar);
            return li;
          }),
        );
        const rest = rows.slice(TOP_MOVES);
        const share = rest.reduce((a, r) => a + r.prior, 0);
        others.textContent = rest.length ? `${rest.length} ${t(lang, rest.length === 1 ? 'netOtherMove' : 'netOtherMoves')}${colon(lang)} ${formatShare(lang, share)}` : '';
      }
      const said = `${t(lang, 'netNoteTitle')}${colon(lang)} ${netNumber(lang, value, true)} ${noteFor.textContent}.`;
      live.textContent = rows[0] ? `${said} ${t(lang, 'netTopMoves')}${colon(lang)} ${rows[0].name}, ${formatShare(lang, rows[0].prior)}.` : said;
      if (probe) probeLine.textContent = probeWords(lang, graph, sig, probe);
      if (run) flow();
      else {
        stopFlow();
        tau = end;
        paint();
        arrive();
      }
    };

    // The line of positions, its stepper and its transport: rebuilt when the reader's game changes.
    let stepper: Stepper | null = null;
    let own: AbortController | null = null;
    /** The figure has come on screen once: from then on a new position sends its flow. */
    let seen = false;
    const count = progress(lang, 'move', true);
    const mount = (): void => {
      const before = stepper;
      const wasPlaying = before?.playing ?? false;
      const held = before?.readerPaused ?? false;
      own?.abort();
      own = new AbortController();
      const g = deps.store.current();
      const reader = !!g && g.states.length > 0;
      let start: number;
      if (reader) {
        positions = open(g.states, g.moves);
        if (positions.length === 0) positions = [{ state: g.states[0]! }];
        start = positions.length - 1;
      } else {
        const line = DEFAULT_GAME as Triple[];
        positions = open(replay(line), line);
        start = Math.min(DEFAULT_PLY, positions.length - 1);
      }
      root.dataset.game = reader ? 'reader' : 'default';
      const s = new Stepper(positions.length, (i) => show(i, seen), { signal: own.signal, interval: positionMs(graph), wrapTo: 0 });
      stepper = s;
      // The counter counts the moves played in the line shown; a line of one position says so.
      const row = transport(s, {
        lang,
        counter: (i, n) => (n === 1 ? `${t(lang, 'position').toLowerCase()} 1 ${t(lang, 'outOf')} 1` : count(i, n)),
        actions: [{ label: t(lang, 'playFromHere'), onClick: () => this.playFrom(positions[s.index]!.state, t(lang, 'netName')) }],
      });
      controls.replaceChildren(row);
      if (start !== 0) s.go(start);
      else show(0, seen);
      if (held) s.pauseByReader();
      // The essay's game loops by itself; the reader's own rests on its latest position.
      else if (wasPlaying && !reader) s.play();
    };

    const playable: Playable = {
      get playing() {
        return stepper?.playing ?? false;
      },
      get readerPaused() {
        return stepper?.readerPaused ?? false;
      },
      play: () => {
        // On screen for the first time: the signal crosses for the position already there.
        if (!seen) {
          seen = true;
          flow();
        }
        if (root.dataset.game === 'default') stepper?.play();
      },
      pause: () => stepper?.pause(),
    };

    // Pointing at a node, with the pointer or the arrow keys.
    const point = (e: PointerEvent): void => {
      if (!layout) return;
      setProbe(nodeAt(layout, e.offsetX, e.offsetY));
    };
    wrap.addEventListener('pointermove', point, { signal: signal_ });
    wrap.addEventListener('pointerdown', point, { signal: signal_ });
    wrap.addEventListener('pointerleave', () => setProbe(null), { signal: signal_ });
    wrap.addEventListener('blur', () => setProbe(null), { signal: signal_ });
    wrap.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          setProbe(null);
          return;
        }
        const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
        if (!d) return;
        e.preventDefault();
        const from = probe ?? { column: 0, node: 0 };
        const column = probe ? Math.max(0, Math.min(graph.columns.length - 1, from.column + d[0]!)) : 0;
        const units = graph.columns[column]!.units;
        const node = column === from.column ? Math.max(0, Math.min(units - 1, from.node + (probe ? d[1]! : 0))) : Math.min(units - 1, Math.round((from.node / graph.columns[from.column]!.units) * units));
        setProbe({ column, node });
      },
      { signal: signal_ },
    );

    // The canvas follows its box; the colours follow the theme.
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver((entries) => {
        const box = entries.at(-1)?.contentRect;
        if (box) resize(box.width, box.height);
      });
      ro.observe(wrap);
      signal_.addEventListener('abort', () => ro.disconnect(), { once: true });
    }
    const retheme = (): void => {
      readPalette();
      if (!frame) paint();
    };
    if (typeof MutationObserver === 'function') {
      const mo = new MutationObserver(retheme);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
      signal_.addEventListener('abort', () => mo.disconnect(), { once: true });
    }
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme, { signal: signal_ });

    mount();
    const off = deps.store.on('game', mount);
    signal_.addEventListener(
      'abort',
      () => {
        off();
        own?.abort();
        stopFlow();
      },
      { once: true },
    );
    this.stage.append(root);
    autoplay(this, playable, { signal: signal_ });
  }
}
