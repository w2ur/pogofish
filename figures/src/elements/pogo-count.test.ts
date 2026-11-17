import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { initial, key, replay, type Colour, type State } from '../engine';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia } from '../test-dom';
import { STRINGS } from '../kit/strings';
import { describeCell } from '../board-state';
import { moveTop, rowItems, swapItems } from './count-edit';
import { BARS, PIECES, countFrames, fromRow, places, type Row } from './count-row';
import { PogoCount, SHOWN_PLIES, STEP_MS, sayFrame } from './pogo-count';

if (!customElements.get('pogo-count')) customElements.define('pogo-count', PogoCount);
PogoCount.deps = { ...PogoCount.deps, engine: () => Promise.resolve() };

const NNBSP = ' ';
const states = replay([...DEFAULT_GAME]);
const positions = SHOWN_PLIES.map((ply) => states[ply]!);
const frames = countFrames(positions);

async function mount(lang: string, reduced = false): Promise<PogoCount> {
  resetMedia();
  if (reduced) setMedia(REDUCED_MOTION, true);
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-count') as PogoCount;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const $ = (el: PogoCount, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoCount, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const next = (el: PogoCount) => $(el, '[data-role="next"]').click();
const said = (el: PogoCount) => $(el, '.line').textContent;
const counter = (el: PogoCount) => $(el, '[data-role="counter"]').textContent;
const remove = (el: PogoCount) => el.parentElement!.removeChild(el);
/** The colours of the twelve pieces in the order of the row: each piece carries its rank. */
const drawnOrder = (el: PogoCount): Colour[] =>
  $$(el, '.pieces .pc')
    .sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank))
    .map((p) => p.dataset.colour as Colour);
const rowHit = (el: PogoCount, place: number) => $(el, `.row-hit[data-place="${place}"]`);
const boardHit = (el: PogoCount, cell: number) => $(el, `.board-hit .cell-button[data-cell="${cell}"]`);
const rowLabels = (el: PogoCount) => $$(el, '.row-hit').map((b) => b.getAttribute('aria-label'));
const boardLabels = (el: PogoCount) =>
  $$(el, '.board-hit .cell-button')
    .sort((a, b) => Number(a.dataset.cell) - Number(b.dataset.cell))
    .map((b) => b.getAttribute('aria-label'));
const rowWords = (row: Row) =>
  rowItems(row).map((x, k) => `Place ${k + 1}${NNBSP}: ${x === 'bar' ? 'séparateur' : x === 'White' ? 'pièce blanche' : 'pièce rouge'}`);
const boardWords = (row: Row, turn: Colour) =>
  Array.from({ length: 9 }, (_, i) => describeCell('fr', { cells: fromRow(row), to_move: turn, move_count: 0, history: [] }, i, null));
const x = (node: Element): number => Number(/translate\(([-\d.]+)px/.exec((node as HTMLElement).style.transform)![1]);

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-count>', () => {
  it('starts by itself once half of it is on screen, pauses when it leaves, and resumes when it comes back', async () => {
    const el = await mount('fr');
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    leave(el);
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    remove(el);
  });

  it('a reader’s pause holds when it comes back on screen', async () => {
    const el = await mount('fr');
    intersect(el);
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-role="play"]')!.click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
    remove(el);
  });

  it('shows real positions: the start, then two of the page’s own game, the side to move changing each time', () => {
    expect(key(positions[0]!)).toBe(key(initial()));
    expect(positions.map((p) => p.to_move)).toEqual(['White', 'Red', 'White']);
    expect(new Set(positions.map((p: State) => JSON.stringify(p.cells))).size).toBe(3);
    // So each change ends with the turn passing, but the last, which comes back to the start.
    expect(frames.map((f) => f.kind).join(' ')).toBe(
      'board unfold reorder slide fold turn unfold reorder slide fold turn unfold reorder slide fold',
    );
  });

  it('opens on a position, twelve pieces on the board and the row as its trace', async () => {
    const el = await mount('fr');
    expect(said(el)).toBe('Une position du Pogo.');
    expect(counter(el)).toBe(`étape 1 sur ${frames.length}`);
    expect($$(el, '.pieces .pc')).toHaveLength(PIECES);
    expect($$(el, '.bars .bar')).toHaveLength(BARS);
    expect($$(el, '.bars .bar').every((b) => b.hasAttribute('data-off'))).toBe(true);
    expect($(el, '.count').dataset.solid).toBe('board');
    expect($(el, '.traces').dataset.of).toBe('row');
    expect($$(el, '.traces .pc')).toHaveLength(PIECES);
    expect($$(el, '.traces .bar')).toHaveLength(BARS);
    expect($(el, '.turn-text').textContent).toBe('Trait aux Blancs');
    expect($$(el, '.squares .cell')).toHaveLength(9);
  });

  it('then lays it as one row of 12 pieces and 8 separators, in the order of the pile, each thing in its place', async () => {
    const el = await mount('fr');
    next(el);
    expect(said(el)).toBe('Une position, c’est une pile de 12 pièces, coupée par 8 séparateurs.');
    expect($(el, '.count').dataset.solid).toBe('row');
    expect($(el, '.traces').dataset.of).toBe('board');
    expect($$(el, '.traces .bar')).toHaveLength(0);
    const f = frames[1]!;
    expect(drawnOrder(el)).toEqual(f.row.order);
    // Left to right: the 20 places, pieces and separators as places() says.
    const p = places(f.row);
    const things = [
      ...$$(el, '.pieces .pc').map((n) => ({ x: x(n), what: n.dataset.colour![0]! })),
      ...$$(el, '.bars .bar').map((n) => ({ x: x(n), what: '|' })),
    ].sort((a, b) => a.x - b.x);
    const want = Array<string>(PIECES + BARS).fill('');
    p.pieces.forEach((place, k) => (want[place] = f.row.order[k]![0]!));
    p.bars.forEach((place) => (want[place] = '|'));
    expect(things.map((t) => t.what).join('')).toBe(want.join(''));
    expect(want.join('')).toBe('WW|WW|WW||||RR|RR|RR');
    expect($$(el, '.bars .bar').every((b) => !b.hasAttribute('data-off'))).toBe(true);
  });

  it('every step draws its frame: the order of the row, the separators, where the pieces are, whose turn', async () => {
    const el = await mount('fr');
    frames.forEach((f, i) => {
      if (i > 0) next(el);
      expect(counter(el)).toBe(`étape ${i + 1} sur ${frames.length}`);
      expect(said(el), `frame ${i}`).toBe(sayFrame('fr', f));
      expect(drawnOrder(el), `frame ${i}`).toEqual(f.row.order);
      expect($(el, '.count').dataset.solid).toBe(f.solid);
      expect($(el, '.count').dataset.kind).toBe(f.kind);
      expect($(el, '.turn').dataset.turn).toBe(f.turn);
      // The trace is the same position in the other place: the row folded.
      expect($$(el, '.traces .pc').map((p) => p.dataset.colour)).toEqual(fromRow(f.row).flat());
    });
    // The twelve pieces are the same twelve all along.
    expect($$(el, '.pieces .pc')).toHaveLength(PIECES);
  });

  it('says one short line per phase, in the essay’s words, and the turn passing', async () => {
    const el = await mount('fr');
    const lines = frames.slice(0, 6).map((_, i) => {
      if (i > 0) next(el);
      return said(el);
    });
    expect(lines).toEqual([
      'Une position du Pogo.',
      'Une position, c’est une pile de 12 pièces, coupée par 8 séparateurs.',
      'Un autre ordre des 12 pièces…',
      '…d’autres places pour les 8 séparateurs…',
      '…et c’est une autre position.',
      `Le trait passe aux Rouges${NNBSP}: encore une autre position.`,
    ]);
    expect($(el, '.turn-text').textContent).toBe('Trait aux Rouges');
    expect($(el, '.turn').hasAttribute('data-passed')).toBe(true);
    expect($(el, '.line').getAttribute('aria-live')).toBe('polite');
  });

  it('repeats none of the essay’s numbers: no 924, no 125 970, no total, no formula', async () => {
    const el = await mount('fr');
    const seen: string[] = [];
    frames.forEach((_, i) => {
      if (i > 0) next(el);
      seen.push(el.shadowRoot!.textContent ?? '');
    });
    const all = seen.join(' ').replace(/[\s  ]/g, '');
    for (const n of ['924', '125970', '232792560', '116396280']) expect(all).not.toContain(n);
    expect(el.shadowRoot!.querySelector('sub, sup, .binomial')).toBeNull();
    // Nor does any string of the figure, in either language.
    for (const lang of ['fr', 'en'] as const) {
      const own = Object.entries(STRINGS[lang]).filter(([k]) => k.startsWith('count'));
      expect(own.length).toBeGreaterThan(0);
      for (const [, v] of own) expect(v.replace(/[\s  ,]/g, '')).not.toMatch(/924|125970|232792560|C\(/);
    }
  });

  it('holds each step long enough to be read, and loops: after the last frame, the row of the first position again', async () => {
    expect(STEP_MS).toBeGreaterThanOrEqual(3000);
    const el = await mount('fr');
    vi.useFakeTimers();
    $(el, '[data-role="play"]').click();
    vi.advanceTimersByTime(STEP_MS * (frames.length - 1));
    expect(counter(el)).toBe(`étape ${frames.length} sur ${frames.length}`);
    expect(playState(el)).toBe('pause');
    vi.advanceTimersByTime(STEP_MS);
    expect(counter(el)).toBe(`étape 2 sur ${frames.length}`);
    expect(drawnOrder(el)).toEqual(frames[1]!.row.order);
    expect(playState(el)).toBe('pause');
    remove(el);
  });

  it('under reduced motion nothing plays by itself: a position and its row, and the play control', async () => {
    const el = await mount('en', true);
    intersect(el);
    expect(playState(el)).toBe('play');
    expect(said(el)).toBe('A position is one pile of 12 pieces, cut by 8 separators.');
    expect($(el, '.count').dataset.solid).toBe('row');
    expect($(el, '.turn-text').textContent).toBe('White to move');
  });

  it('invites the reader, in one short line, to change either side', async () => {
    const fr = await mount('fr');
    expect($(fr, '.invite').textContent).toBe(
      `À vous${NNBSP}: échangez deux éléments de la rangée, ou déplacez une pièce d’une case à l’autre. L’autre côté suit.`,
    );
    const en = await mount('en');
    expect($(en, '.invite').textContent).toBe('Your turn: swap two things in the row, or move a piece from one square to another. The other side follows.');
  });

  it('a tap on two places of the row swaps them, the telling pauses, and the board follows', async () => {
    const el = await mount('fr');
    intersect(el);
    expect(playState(el)).toBe('pause');
    rowHit(el, 1).click();
    expect(rowHit(el, 1).getAttribute('aria-pressed')).toBe('true');
    rowHit(el, 2).click();
    // The reader's pause: the telling waits for ▶.
    expect(playState(el)).toBe('play');
    expect($(el, '.count').hasAttribute('data-edit')).toBe(true);
    const row = swapItems(frames[0]!.row, 1, 2);
    expect(rowLabels(el)).toEqual(rowWords(row));
    // The board follows: drawn in full, the pieces where the new row puts them.
    expect($(el, '.count').dataset.solid).toBe('board');
    expect(boardLabels(el)).toEqual(boardWords(row, 'White'));
    expect(boardLabels(el)[1]).toBe(`b1${NNBSP}: pile de 3, sommet blanc`);
    expect(drawnOrder(el)).toEqual(row.order);
    expect(rowHit(el, 1).getAttribute('aria-pressed')).toBe('false');
  });

  it('a piece moved from one square to another on the board, and the row follows', async () => {
    const el = await mount('fr');
    boardHit(el, 6).click();
    expect(boardHit(el, 6).getAttribute('aria-pressed')).toBe('true');
    boardHit(el, 4).click();
    const row = moveTop(frames[0]!.row, 6, 4);
    expect(boardLabels(el)).toEqual(boardWords(row, 'White'));
    // The row follows: drawn in full, the separators where the new board puts them.
    expect($(el, '.count').dataset.solid).toBe('row');
    expect(rowLabels(el)).toEqual(rowWords(row));
    expect(drawnOrder(el)).toEqual(row.order);
  });

  it('a second tap on what was picked puts it down; an empty square cannot be picked', async () => {
    const el = await mount('fr');
    boardHit(el, 4).click();
    expect(boardHit(el, 4).getAttribute('aria-pressed')).toBe('false');
    rowHit(el, 0).click();
    rowHit(el, 0).click();
    expect(rowHit(el, 0).getAttribute('aria-pressed')).toBe('false');
    expect(rowLabels(el)).toEqual(rowWords(frames[0]!.row));
  });

  it('the turn line passes the turn when tapped: the third thing a position is', async () => {
    const el = await mount('fr');
    $(el, '.turn').click();
    expect($(el, '.turn-text').textContent).toBe('Trait aux Rouges');
    expect($(el, '.turn').dataset.turn).toBe('Red');
    expect($(el, '.count').hasAttribute('data-edit')).toBe(true);
    $(el, '.turn').click();
    expect($(el, '.turn-text').textContent).toBe('Trait aux Blancs');
  });

  it('▶ after an edit takes the telling up again, where it was', async () => {
    const el = await mount('fr');
    next(el);
    rowHit(el, 0).click();
    rowHit(el, 19).click();
    $(el, '[data-role="play"]').click();
    expect($(el, '.count').hasAttribute('data-edit')).toBe(false);
    expect(drawnOrder(el)).toEqual(frames[1]!.row.order);
    expect(said(el)).toBe(sayFrame('fr', frames[1]!));
    $(el, '[data-role="play"]').click();
  });

  it('stops playing once disconnected', async () => {
    const el = await mount('en');
    vi.useFakeTimers();
    $(el, '[data-role="play"]').click();
    const line = $(el, '.line');
    remove(el);
    vi.advanceTimersByTime(20_000);
    expect(line.textContent).toBe('A position of Pogo.');
    expect(vi.getTimerCount()).toBe(0);
  });
});
