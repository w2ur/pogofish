// The round-5 conventions on one figure, for the harness only: the board's
// marks, the one way to take pieces, drag and drop, and a toy. Each block is
// the smallest use of its kit primitive, as a figure would write it.
import { legal, play, ready, type Colour, type State, type Triple } from '../src/engine';
import { labelledBoard } from '../src/kit/board-labels';
import { drawBoard, landing } from '../src/kit/board-svg';
import { dragAndDrop } from '../src/kit/drag';
import { PogoFigure } from '../src/kit/figure';
import { takePieces } from '../src/kit/take-pieces';
import { readingMark, toy } from '../src/kit/toy';

const CSS = `
.conv { display: grid; gap: 28px; }
.conv h3 { margin: 0 0 8px; font-size: 12.8px; font-weight: 800; color: var(--_muted); }
.marks { display: flex; flex-wrap: wrap; gap: 16px; }
.marks figure { margin: 0; width: min(100%, 240px); }
.marks figcaption { font-size: 12.8px; margin-top: 4px; color: var(--_ink-2); }
.marks .board-frame, .marks .board { width: 100%; height: auto; }
.play > .board-frame { position: absolute; inset: 0; display: block; }
.take { display: grid; gap: 8px; justify-items: center; width: min(100%, 320px); }
.row { position: relative; display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); width: min(100%, 440px); border-bottom: 2px solid var(--_ink); }
.row button { appearance: none; margin: 0; padding: 4px; border: 0; background: transparent; aspect-ratio: 1; display: grid; place-items: center; }
.row button:focus-visible { outline: 2px solid var(--_ink); outline-offset: -2px; }
.row .token { width: 78%; aspect-ratio: 1; border-radius: 50%; border: 1.5px solid var(--_ink); pointer-events: none; }
.row .token[data-colour='White'] { background: var(--_white); }
.row .token[data-colour='Red'] { background: var(--_red); }
.row [data-droppable] { background: color-mix(in srgb, var(--_ink) 10%, transparent); }
.toybox { display: grid; gap: 8px; justify-items: center; width: min(100%, 440px); }
.toybox .said { margin: 0; min-height: 1.4em; font-size: 15px; grid-area: 1 / 1; text-align: center; }
.toybox .toy-invite { grid-area: 1 / 1; }
.toybox .tie { display: flex; align-items: center; gap: 12px; }
.toybox .cell { width: 44px; height: 44px; border: 1px solid var(--_rule); display: grid; place-items: center; font-weight: 800; }
.toybox .cell[data-on] { background: var(--_ink); color: var(--_ground); }
`;

const START: State = {
  cells: [['White', 'Red', 'Red'], [], ['White', 'White'], ['White'], [], ['Red', 'White'], [], ['Red', 'White'], ['Red', 'Red']],
  to_move: 'Red',
  move_count: 3,
  history: [],
};

export function conventions(): CustomElementConstructor {
  return class extends PogoFigure {
    static override styles = CSS;
    static override stageMinHeight = '900px';

    protected async render(signal: AbortSignal): Promise<void> {
      await ready('/pogo/pogofish_wasm_bg.wasm');
      const lang = this.lang;
      const fr = lang === 'fr';
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
      };
      const root = el('div', 'conv');
      const block = (title: string, ...children: Node[]): void => {
        const section = el('section');
        section.append(el('h3', '', title), ...children);
        root.append(section);
      };

      // 1. The marks.
      const move: Triple = [0, 2, 4];
      const marks = el('div', 'marks');
      const shown = (svg: SVGSVGElement, caption: string): void => {
        const figure = el('figure');
        figure.append(labelledBoard(svg), el('figcaption', '', caption));
        marks.append(figure);
      };
      shown(
        drawBoard(play(START, move), { labelRoom: true, from: move[0], to: move[2], moving: move[1] }),
        fr ? 'Coup joué : anneau pointillé au départ, cadre à l’arrivée.' : 'A move played: dashed ring where it left, frame where it landed.',
      );
      shown(
        drawBoard(START, { labelRoom: true, marks: [{ cell: move[0], kind: 'picked' }, { cell: move[2], kind: 'target' }], landings: [landing(START, move)] }),
        fr ? 'Coup possible : pile cerclée d’encre, case aux quatre coins, pièces estompées.' : 'A possible move: stack ringed in ink, square cornered, pieces faded.',
      );
      const from0 = legal(START).filter((m) => m.from_cell === 0 && m.num_pieces === 2);
      shown(
        drawBoard(START, {
          labelRoom: true,
          marks: [{ cell: 0, kind: 'picked' }, ...from0.map((m) => ({ cell: m.to_cell, kind: 'target' as const }))],
          landings: from0.map((m) => landing(START, [m.from_cell, m.num_pieces, m.to_cell])),
        }),
        fr ? 'Tous les coups de deux pièces depuis a1, montrés.' : 'Every two-piece move from a1, shown.',
      );
      block(fr ? '1 · Les marques' : '1 · The marks', marks);

      // 2. One way to take pieces.
      let state = START;
      let last: Triple | undefined;
      const takeBox = el('div', 'take');
      const box = el('div', 'play');
      const take = takePieces({
        lang,
        id: 'conv-counts',
        keys: takeBox,
        state: () => state,
        moves: () => legal(state),
        onPlay: (m) => {
          state = play(state, m);
          last = m;
          draw();
          take.sync();
        },
        onChange: () => draw(),
      });
      function draw(): void {
        const svg = drawBoard(state, {
          labelRoom: true,
          marks: take.marks(),
          ...(last && !take.selection() ? { from: last[0], to: last[2], moving: last[1] } : {}),
        });
        box.querySelector(':scope > .board-frame')?.remove();
        box.prepend(labelledBoard(svg));
      }
      box.append(take.grid);
      takeBox.append(box, take.counts.element);
      draw();
      take.sync();
      block(fr ? '2 · Prendre des pièces : la pile, combien, où' : '2 · Taking pieces: the stack, how many, where', takeBox);

      // 3. Drag and drop.
      const holds: (Colour | null)[] = ['White', 'Red', null, 'Red', 'White', null, 'White', 'Red'];
      const row = el('div', 'row');
      const places = holds.map(() => {
        const b = el('button');
        b.type = 'button';
        b.append(el('span', 'token'));
        row.append(b);
        return b;
      });
      const paint = (): void =>
        places.forEach((b, i) => {
          const token = b.firstElementChild as HTMLElement;
          token.hidden = holds[i] === null;
          if (holds[i]) token.dataset.colour = holds[i]!;
          token.style.transform = '';
        });
      const what = (c: Colour | null): string => (c === null ? (fr ? 'vide' : 'empty') : c === 'White' ? (fr ? 'pièce blanche' : 'white piece') : fr ? 'pièce rouge' : 'red piece');
      const drag = dragAndDrop({
        lang,
        places,
        canTake: (i) => holds[i] !== null,
        onDrop: (from, to) => {
          [holds[from], holds[to]] = [holds[to]!, holds[from]!];
          paint();
        },
        name: (i) => `${fr ? 'Place' : 'Place'} ${i + 1}${fr ? ' :' : ':'} ${what(holds[i]!)}`,
        // The figure moves what it drew: here the token follows the pointer.
        onDrag: (d) => {
          paint();
          if (d) (places[d.from]!.firstElementChild as HTMLElement).style.transform = `translate(${d.dx}px, ${d.dy}px)`;
        },
        signal,
      });
      paint();
      drag.sync();
      block(fr ? '3 · Glisser-déposer (pointeur, appui puis appui, clavier)' : '3 · Drag and drop (pointer, tap then tap, keyboard)', row, drag.live);

      // 4. A toy.
      const toyBox = el('div', 'toybox');
      const said = el('p', 'said');
      const tie = el('div', 'tie');
      const cells = ['1', '2', '3'].map((n) => el('div', 'cell', n));
      const result = el('div', 'cell', '?');
      tie.append(...cells, readingMark('right'), result);
      const light = (k: number): void => cells.forEach((c, i) => c.toggleAttribute('data-on', i === k));
      const top = el('div');
      top.style.display = 'grid';
      const play1 = toy(this, {
        root: toyBox,
        invite: fr ? 'Appuyez sur une case : le résultat suit.' : 'Press a square: the result follows.',
        intro: {
          steps: 3,
          show: (i) => {
            light(i);
            result.textContent = String(i + 1);
            said.textContent = fr ? 'Chaque case donne son nombre.' : 'Each square gives its number.';
          },
        },
        onReady: () => {
          said.textContent = '';
          light(-1);
          result.textContent = '?';
        },
        signal,
      });
      cells.forEach((c, i) =>
        c.addEventListener('pointerdown', () => {
          light(i);
          result.textContent = String(i + 1);
        }),
      );
      top.append(said, play1.invite);
      toyBox.append(top, tie, readingMark('down', fr ? 'du bas vers le haut' : 'bottom to top'));
      block(fr ? '4 · Un jouet : une introduction une fois, puis au lecteur' : '4 · A toy: an introduction once, then the reader’s', toyBox);

      this.stage.append(root);
    }
  };
}
