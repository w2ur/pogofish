// <pogo-line line="shortestWin|loop|centreLoss|openingWin" rules="A|lc1-2">:
// replays a line of the solved-table extract, one ply per step, under the rules
// the page names (line-frames.ts). Each step says the move and, under lc1-2,
// how often the position has stood; the last says who wins and how. Under
// game A the loop plays on without end. « Jouer d’ici » hands any open position
// to the playable board.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import type { TableData } from '../data';
import { LC1_2, ready, terminal, type Colour } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { animateMove, drawBoard } from '../kit/board-svg';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { t, type Fidelity, type Lang, type StringKey } from '../kit/strings';
import { sharedTable } from '../table';
import { lineFidelity, lineFrames, parseLine, parseRules, seenText, type Frame, type LineName } from './line-frames';
import lineCss from './pogo-line.css?raw';

const LINE_KEY: Record<LineName, StringKey> = {
  shortestWin: 'lineShortestWin',
  loop: 'lineLoop',
  centreLoss: 'lineCentreLoss',
  openingWin: 'lineOpeningWin',
};

const colourKey = (c: Colour): StringKey => (c === 'White' ? 'white' : 'red');

interface Said {
  move: string;
  note: string;
  who: string;
  how: string;
}

/** The words of one frame, in `lang`. `endless` marks the last frame of a loop under game A. */
function say(lang: Lang, f: Frame, endless: boolean): Said {
  const move = f.move && f.mover ? announceMove(lang, f.mover, f.move) : t(lang, 'startPosition');
  let note = '';
  if (endless) note = t(lang, 'loopAgain');
  else if (f.seen !== null && f.seen > 1) note = seenText(lang, f.seen);
  if (!f.result) return { move, note, who: '', how: '' };
  const winner: Colour = f.result.winner === 'W' ? 'White' : 'Red';
  const loser: Colour = winner === 'White' ? 'Red' : 'White';
  return {
    move,
    note,
    who: `${t(lang, colourKey(winner))} ${t(lang, 'wins')}`,
    how: f.result.byRepetition
      ? `${t(lang, colourKey(loser))} ${t(lang, 'byRepetition')}`
      : t(lang, winner === 'White' ? 'byStacksWhite' : 'byStacksRed'),
  };
}

export class PogoLine extends PogoFigure {
  static override fidelity = 'live' as const;
  static override styles = lineCss;
  static override stageMinHeight = '480px';

  /** The engine and the table; a test swaps them. */
  static deps: { engine: () => Promise<void>; table: () => Promise<TableData> } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    table: sharedTable,
  };

  /** Measured only for a table line under game A (lineFidelity); a bad attribute says live, and render fails. */
  private claim(): ReturnType<typeof lineFidelity> {
    try {
      return lineFidelity(parseLine(this.getAttribute('line')), parseRules(this.getAttribute('rules')));
    } catch {
      return { kind: 'live' };
    }
  }

  protected override fidelityKind(): Fidelity {
    return this.claim().kind;
  }

  protected override sourceFile(): string | undefined {
    return this.claim().source;
  }

  /** The label names the game of the `rules` attribute; a bad one names none, and render fails. */
  protected override game(): 'gameA' | 'gameLc12' | undefined {
    try {
      return parseRules(this.getAttribute('rules')) === null ? 'gameA' : 'gameLc12';
    } catch {
      return undefined;
    }
  }

  protected async render(signal: AbortSignal): Promise<void> {
    const name = parseLine(this.getAttribute('line'));
    const rules = parseRules(this.getAttribute('rules'));
    const deps = (this.constructor as typeof PogoLine).deps;
    const [table] = await Promise.all([deps.table(), deps.engine()]);
    if (signal.aborted) return;
    const lang = this.lang;
    const { frames, cyclic } = lineFrames(table.lines[name], rules);
    const last = frames.length - 1;
    const words = frames.map((f, i) => say(lang, f, cyclic && i === last));

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const root = el('div', 'line-figure');
    // Every frame's words share one grid cell, only the current one seen: the area
    // keeps the height of the longest, so the board below never moves.
    const status = el('div', 'status');
    status.setAttribute('aria-hidden', 'true');
    const blocks = words.map((w) => {
      const block = el('div', 'said');
      block.append(el('p', 'move', w.move));
      if (w.note) block.append(el('p', 'note', w.note));
      if (w.who) block.append(el('p', 'shout who', w.who), el('p', 'how', w.how));
      status.append(block);
      return block;
    });
    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    const slot = el('div', 'board-slot');

    let svg: SVGSVGElement | undefined;
    let shown = -1;
    const show = (i: number): void => {
      const f = frames[i]!;
      const w = words[i]!;
      blocks.forEach((b, k) => b.toggleAttribute('data-off', k !== i));
      live.textContent = [w.move, w.note, w.who, w.how].filter(Boolean).join('. ');
      const next = drawBoard(f.state, {
        labelRoom: true,
        title: [w.move, w.note, w.who].filter(Boolean).join('. '),
        ...(f.move ? { from: f.move[0], to: f.move[2], moving: f.move[1] } : {}),
      });
      const before = svg;
      slot.replaceChildren(labelledBoard(next));
      svg = next;
      // A step forward, or the loop wrapping from its last frame to its first move, which is one too.
      const forward = i === shown + 1 || (cyclic && shown === last && i === 1);
      if (before && f.move && forward && !this.reducedMotion()) animateMove(before, next, f.move);
      shown = i;
      // A finished position cannot be played on: under either rule set the board would have nothing to do.
      if (playHere) {
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
          primary: true,
          onClick: () => {
            const f = frames[stepper.index]!;
            this.playFrom(f.state, `${t(lang, LINE_KEY[name])}, ${t(lang, 'ply')} ${f.ply}`);
          },
        },
      ],
    });
    const playHere = row.querySelector<HTMLButtonElement>('[data-role="action"]');
    show(0);
    root.append(status, slot, row, live);
    this.stage.append(root);
  }
}
