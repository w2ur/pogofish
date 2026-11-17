// The buttons of a board the reader acts on: nine of them laid over the drawn
// board, one tab stop that the arrow keys move, and, while a stack is lifted,
// 1/2/3 to choose the count and Escape to put it down. What a tap or a key
// means is the caller's: this module only wires the buttons and the keys, as
// board-state.ts decides without the DOM. A figure does not use it directly:
// kit/take-pieces.ts builds the page's one way to take pieces on it.
import { neighbour, SCREEN_ORDER } from './board-state';

export interface BoardInputOptions {
  /** The group's accessible name (« Plateau »). */
  label: string;
  /** A tap, or Enter/Space, on cell `i`. */
  onCell: (i: number) => void;
  /** Where 1/2/3 and Escape are heard: the figure's root, so they work from the count chooser too. Without it, no key but the arrows is heard. */
  keys?: HTMLElement;
  /** Whether a stack is lifted: the count and Escape keys act only then. */
  lifted: () => boolean;
  onCount: (n: number) => void;
  onDrop: () => void;
}

export interface BoardInput {
  /** The group of cell buttons, to lay over the board. */
  grid: HTMLElement;
  /** The nine buttons, indexed by cell (a1 = 0). */
  cells: HTMLButtonElement[];
  /** Puts the board's one tab stop on the cell last touched; call after each update. */
  syncFocus(): void;
  /** Focus on that tab stop. */
  focus(): void;
}

export function boardInput(o: BoardInputOptions): BoardInput {
  let focusCell = 0;
  const grid = document.createElement('div');
  grid.className = 'cells';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', o.label);
  const cells: HTMLButtonElement[] = [];
  for (const i of SCREEN_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell-button';
    b.dataset.cell = String(i);
    b.addEventListener('click', () => {
      focusCell = i;
      syncFocus();
      o.onCell(i);
    });
    cells[i] = b;
    grid.append(b);
  }

  const syncFocus = (): void => cells.forEach((b, i) => (b.tabIndex = i === focusCell ? 0 : -1));

  grid.addEventListener('keydown', (e) => {
    const from = Number((e.target as HTMLElement).dataset.cell ?? focusCell);
    const to = neighbour(from, e.key);
    if (to === from && !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    focusCell = to;
    syncFocus();
    cells[to]?.focus();
  });

  o.keys?.addEventListener('keydown', (e) => {
    if (!o.lifted()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      o.onDrop();
    } else if (['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      o.onCount(Number(e.key));
    }
  });

  syncFocus();
  return { grid, cells, syncFocus, focus: () => cells[focusCell]?.focus() };
}
