// <pogo-retrograde>: retrograde analysis as a small tree, from the solved table
// (retro-steps.ts). The game runs left to right (top to bottom when narrow):
// a position lost in 2, the positions its moves lead to, won in 1, and the
// final positions theirs lead to, lost in 0. An arrow joins a position to the
// one a move leads to and carries the move's name, which explains itself
// (kit/move-tip.ts). The telling runs the other way, as the analysis does:
// the final positions first, then one move before, then two, each step with
// the rule that marks it, then « et ainsi de suite ». Every position keeps its
// room from the start, so nothing on the page moves at any step. The arrows
// are drawn over the laid-out tree, from one board to the other, and drawn
// again whenever the figure's size changes.
import { WASM_FILE, assetUrl } from '../assets';
import type { TableData } from '../data';
import { ready, type Colour, type Triple } from '../engine';
import { autoplay } from '../kit/autoplay';
import { drawBoard } from '../kit/board-svg';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveTip } from '../kit/move-tip';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { sharedTable } from '../table';
import retroCss from './pogo-retrograde.css?raw';
import { nextMarks, retroSteps, type RetroStepView } from './retro-steps';

const NS = 'http://www.w3.org/2000/svg';
const WHY: StringKey[] = ['retroWhy0', 'retroWhy1', 'retroWhy2'];
/** How long a step is held before the next, in ms: long enough to read its rule. */
export const STEP_MS = 4500;
/** From this width the tree is laid in columns (the sheet's container query). */
const WIDE = 720;
/** Room left between an arrow's ends and the boards, and the size of its head, in px. */
const PAD = 8;
const HEAD = 10;

/** « Perdue en 0 » / "Won in 1". */
export function stepName(lang: Lang, s: Pick<RetroStepView, 'outcome' | 'plies'>): string {
  return `${t(lang, s.outcome === 'lost' ? 'lostIn' : 'wonIn')} ${s.plies}`;
}

/** « Un coup mène à une position perdue pour l’adversaire : gagnée en 1. » */
export function ruleText(lang: Lang, s: RetroStepView, i: number): string {
  return `${t(lang, WHY[i]!)}${colon(lang)} ${stepName(lang, s).toLowerCase()}.`;
}

type Point = [number, number];

/** The line from `a` to `b` and its head: the line stops where the head begins. */
export function arrowGeometry(a: Point, b: Point): { line: [Point, Point]; head: Point[] } {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / length, dy / length];
  const base: Point = [b[0] - ux * HEAD, b[1] - uy * HEAD];
  const half = HEAD * 0.5;
  return {
    line: [a, base],
    head: [b, [base[0] - uy * half, base[1] + ux * half], [base[0] + uy * half, base[1] - ux * half]],
  };
}

interface Edge {
  from: HTMLElement;
  to: HTMLElement;
  /** The step that shows it. */
  step: number;
  group: SVGGElement;
  line: SVGLineElement;
  head: SVGPolygonElement;
  label: HTMLElement | null;
}

export class PogoRetrograde extends PogoFigure {
  static override styles = retroCss;
  static override stageMinHeight = '760px';

  /** The engine and the table; a test swaps them. */
  static deps: { engine: () => Promise<void>; table: () => Promise<TableData> } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    table: sharedTable,
  };

  protected async render(signal: AbortSignal): Promise<void> {
    const deps = (this.constructor as typeof PogoRetrograde).deps;
    const [table] = await Promise.all([deps.table(), deps.engine()]);
    if (signal.aborted) return;
    const steps = retroSteps(table);
    const lang = this.lang;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const side = (c: Colour): string => `${t(lang, c === 'White' ? 'white' : 'red')} ${t(lang, 'toMove')}`;
    const tag = (s: Pick<RetroStepView, 'outcome' | 'plies'>): HTMLElement => {
      const node = el('span', 'tag label', stepName(lang, s));
      node.dataset.outcome = s.outcome;
      return node;
    };

    const root = el('div', 'retro');
    const tree = el('div', 'tree');
    const arrows = document.createElementNS(NS, 'svg');
    arrows.setAttribute('class', 'arrows');
    arrows.setAttribute('aria-hidden', 'true');

    // One column per step, the last step of the analysis first: the game runs that way.
    const nodes: HTMLElement[][] = steps.map(() => []);
    /** Draws a position's board, with the move that leads to it once its arrow is shown. */
    const draws: ((i: number) => void)[] = [];
    const incoming = new Map<string, Triple>();
    steps.forEach((s, k) => s.boards.forEach((b) => b.moves.forEach((m) => incoming.set(`${k - 1}.${m.to}`, m.move))));
    const cols = steps.map((s, k) => {
      const col = el('section', 'col');
      col.dataset.label = s.label;
      const boards = el('div', 'nodes');
      s.boards.forEach((b, n) => {
        const node = el('figure', 'node');
        const slot = el('div', 'shot');
        const title = `${t(lang, 'position')} ${stepName(lang, s).toLowerCase()}${colon(lang)} ${side(b.state.to_move)}.`;
        const move = incoming.get(`${k}.${n}`);
        draws.push((i) => {
          const marked = move && i > k ? { from: move[0], to: move[2], moving: move[1] } : {};
          slot.replaceChildren(drawBoard(b.state, { title, ...marked }));
        });
        node.append(el('span', 'turn', side(b.state.to_move)), slot, tag(s));
        boards.append(node);
        nodes[k]!.push(node);
      });
      col.append(el('p', 'rule', ruleText(lang, s, k)), boards);
      return col;
    });

    const etc = el('section', 'col etc');
    const marks = el('p', 'marks');
    marks.append(...nextMarks(steps).map(tag), el('span', 'more', '…'));
    etc.append(el('p', 'rule', `${t(lang, 'retroEtc')}${colon(lang)}`), marks);

    const edges: Edge[] = [];
    const edge = (from: HTMLElement, to: HTMLElement, step: number, label: HTMLElement | null): void => {
      const group = document.createElementNS(NS, 'g');
      group.setAttribute('class', label ? 'arrow' : 'arrow more');
      const line = document.createElementNS(NS, 'line');
      const head = document.createElementNS(NS, 'polygon');
      group.append(line, head);
      arrows.append(group);
      edges.push({ from, to, step, group, line, head, label });
    };
    const labels: HTMLElement[] = [];
    steps.forEach((s, k) =>
      s.boards.forEach((b, n) =>
        b.moves.forEach((m) => {
          const label = el('span', 'arrow-label');
          // Read: « Blanc joue c1-1-b1 », the name explained. Drawn: the name alone, on its arrow.
          label.append(el('span', 'sr', `${t(lang, m.mover === 'White' ? 'white' : 'red')} ${t(lang, 'plays')} `), moveTip(lang, m.move));
          labels.push(label);
          edge(nodes[k]!.at(n)!, nodes[k - 1]!.at(m.to)!, k, label);
        }),
      ),
    );
    const last = steps.length - 1;
    for (const node of nodes[last]!) edge(marks, node, steps.length, null);

    // Left to right, top to bottom: « et ainsi de suite », lost in 2, won in 1, lost in 0.
    tree.append(etc, ...[...cols].reverse(), arrows, ...labels);

    /** Lays every arrow from its position to the one its move leads to; read once per size. */
    const lay = (): void => {
      const box = tree.getBoundingClientRect();
      const wide = box.width >= WIDE;
      const rect = (node: Element): DOMRect => node.getBoundingClientRect();
      const board = (node: HTMLElement): Element => node.querySelector('.shot') ?? node;
      for (const e of edges) {
        const [f, g] = [rect(wide ? board(e.from) : (e.from.closest('.col') ?? e.from)), rect(wide ? board(e.to) : e.to)];
        const own = rect(e.from);
        const a: Point = wide ? [f.right - box.left + PAD, f.top + f.height / 2 - box.top] : [own.left + own.width / 2 - box.left, f.bottom - box.top + PAD];
        const b: Point = wide ? [g.left - box.left - PAD, g.top + g.height / 2 - box.top] : [g.left + g.width / 2 - box.left, g.top - box.top - PAD];
        // « Et ainsi de suite » comes in level, whatever the height of its marks.
        if (wide && !e.label) a[1] = b[1];
        const { line, head } = arrowGeometry(a, b);
        e.line.setAttribute('x1', line[0][0].toFixed(1));
        e.line.setAttribute('y1', line[0][1].toFixed(1));
        e.line.setAttribute('x2', line[1][0].toFixed(1));
        e.line.setAttribute('y2', line[1][1].toFixed(1));
        e.head.setAttribute('points', head.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
        if (e.label) {
          e.label.style.left = `${((a[0] + b[0]) / 2).toFixed(1)}px`;
          e.label.style.top = `${((a[1] + b[1]) / 2).toFixed(1)}px`;
        }
      }
    };

    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    const coming = nextMarks(steps).map((m) => stepName(lang, m).toLowerCase());
    const said = [...steps.map((s, k) => ruleText(lang, s, k)), `${t(lang, 'retroEtc')}${colon(lang)} ${coming.join(', ')}…`];
    const all = [...cols, etc];
    const show = (i: number): void => {
      all.forEach((c, k) => {
        c.toggleAttribute('data-off', k > i);
        c.toggleAttribute('data-current', k === i);
      });
      for (const e of edges) {
        e.group.toggleAttribute('data-off', e.step > i);
        e.label?.toggleAttribute('data-off', e.step > i);
      }
      for (const draw of draws) draw(i);
      live.textContent = said[i]!;
    };
    const stepper = new Stepper(all.length, show, { signal, interval: STEP_MS });
    show(0);
    root.append(tree, transport(stepper, { lang }), live);
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
    this.stage.append(root);

    lay();
    if (typeof ResizeObserver === 'function') {
      const sizes = new ResizeObserver(lay);
      sizes.observe(tree);
      signal.addEventListener('abort', () => sizes.disconnect(), { once: true });
    }
  }
}
