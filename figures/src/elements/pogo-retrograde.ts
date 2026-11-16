// <pogo-retrograde>: retrograde analysis in three steps, from the solved table
// (retro-steps.ts): positions lost in 0, then won in 1, then lost in 2. Each
// step adds its band under the last, so the analysis is read climbing back
// from the end of the game; the bands still to come keep their room, so
// nothing moves on the page. A move is drawn on its board (the lifted stack
// ringed, its destinations dashed) and named under it, with the letter of the
// position it leads to.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import type { TableData } from '../data';
import { moveName, ready } from '../engine';
import { drawBoard } from '../kit/board-svg';
import { transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang, type StringKey } from '../kit/strings';
import { TABLE_SOURCE, sharedTable } from '../table';
import retroCss from './pogo-retrograde.css?raw';
import { retroSteps, type RetroStepView } from './retro-steps';

const RULE: StringKey[] = ['retroRule0', 'retroRule1', 'retroRule2'];

/** « Perdue en 0 » / "Won in 1". */
export function stepName(lang: Lang, s: Pick<RetroStepView, 'outcome' | 'plies'>): string {
  return `${t(lang, s.outcome === 'lost' ? 'lostIn' : 'wonIn')} ${s.plies}`;
}

export class PogoRetrograde extends PogoFigure {
  static override fidelity = 'measured' as const;
  static override source = TABLE_SOURCE;
  static override game = 'gameA' as const;
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
    const side = (c: 'White' | 'Red'): string => `${t(lang, c === 'White' ? 'white' : 'red')} ${t(lang, 'toMove')}`;

    const root = el('div', 'retro');
    const bands = steps.map((s, i) => {
      const band = el('section', 'step');
      const name = stepName(lang, s);
      const text = el('div', 'text');
      text.append(el('p', 'shout head', name), el('p', 'rule', t(lang, RULE[i]!)));
      const boards = el('div', 'boards');
      for (const b of s.boards) {
        const pos = el('figure', 'pos');
        const said = b.moves.map((m) => `${announceMove(lang, b.state.to_move, m.move)} → ${m.toLetter}`);
        const spoken = b.moves.map(
          (m) => `${announceMove(lang, b.state.to_move, m.move)}, ${t(lang, 'leadsTo')} ${t(lang, 'position').toLowerCase()} ${m.toLetter}`,
        );
        const svg = drawBoard(b.state, {
          title: `${t(lang, 'position')} ${b.letter}, ${name.toLowerCase()}${colon(lang)} ${side(b.state.to_move)}. ${spoken.join('. ')}`.trim(),
          marks: b.moves.length
            ? [
                { cell: b.moves[0]!.move[0], kind: 'picked' as const },
                ...b.moves.map((m) => ({ cell: m.move[2], kind: 'target' as const })),
              ]
            : [],
        });
        const caption = el('figcaption', 'caption');
        caption.setAttribute('aria-hidden', 'true');
        caption.append(el('span', 'label letter', `${b.letter} · ${side(b.state.to_move)}`));
        // A move's name keeps its line: « b2-3-b1 » must not break at a hyphen.
        b.moves.forEach((m, k) => {
          const line = el('span', 'move');
          const named = moveName(m.move);
          const [head, tail] = said[k]!.split(named);
          line.append(head!, el('span', 'nowrap', named), tail!);
          caption.append(line);
        });
        pos.append(svg, caption);
        boards.append(pos);
      }
      band.append(text, boards);
      root.append(band);
      return { band, said: `${name}. ${t(lang, RULE[i]!)}` };
    });

    const live = el('p', 'sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    const show = (i: number): void => {
      bands.forEach((b, k) => {
        b.band.toggleAttribute('data-off', k > i);
        b.band.toggleAttribute('data-current', k === i);
      });
      live.textContent = bands[i]!.said;
    };
    const stepper = new Stepper(steps.length, show, { signal, interval: 1800 });
    show(0);
    root.append(transport(stepper, { lang }), live);
    this.stage.append(root);
  }
}
