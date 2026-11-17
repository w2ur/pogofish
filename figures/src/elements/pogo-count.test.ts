import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { replay, type Colour } from '../engine';
import { REDUCED_MOTION, intersect, leave, resetMedia, setMedia } from '../test-dom';
import { STRINGS } from '../kit/strings';
import { describeCell } from '../board-state';
import { DRAG_SLOP } from '../kit/drag';
import { moveItem, movePieces, rowItems } from './count-edit';
import { BARS, PIECES, fromRow, toRow, type Row } from './count-row';
import { LAYOUTS, runs } from './count-view';
import { defaultPosition } from './net-position';
import { INTRO_HOLD, PogoCount, SHOWN_PLY } from './pogo-count';

if (!customElements.get('pogo-count')) customElements.define('pogo-count', PogoCount);
PogoCount.deps = { ...PogoCount.deps, engine: () => Promise.resolve() };

const NNBSP = ' ';
const sheet = readFileSync(resolve(process.cwd(), 'src/elements/pogo-count.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const shown = replay([...DEFAULT_GAME])[SHOWN_PLY]!;
const first = toRow(shown.cells);

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
/** A figure whose introduction is over: the reader's. */
async function mountReady(lang = 'fr'): Promise<PogoCount> {
  const el = await mount(lang, true);
  expect(phase(el)).toBe('ready');
  return el;
}

const $ = (el: PogoCount, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoCount, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const phase = (el: PogoCount) => $(el, '.count').dataset.toy;
const said = (el: PogoCount) => $(el, '.say').textContent;
const remove = (el: PogoCount) => el.parentElement!.removeChild(el);
const drawnRow = (el: PogoCount) => $(el, '.count').dataset.row;
const drawn = (row: Row) => rowItems(row).map((x) => (x === 'bar' ? '|' : x[0])).join('');
/** The colours of twelve pieces of a layer in the order of the row: each piece carries its rank. */
const order = (el: PogoCount, layer: string): Colour[] =>
  $$(el, `${layer} .pc`)
    .sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank))
    .map((p) => p.dataset.colour as Colour);
const place = (el: PogoCount, p: number) => $(el, `.row-hit[data-place="${p}"]`);
const square = (el: PogoCount, cell: number) => $(el, `.board-hit .cell-button[data-cell="${cell}"]`);
const count = (el: PogoCount, n: number) => $(el, `.counts [data-value="${n}"]`);
const rowLabels = (el: PogoCount) => $$(el, '.row-hit').map((b) => b.getAttribute('aria-label'));
const boardLabels = (el: PogoCount) =>
  $$(el, '.board-hit .cell-button')
    .sort((a, b) => Number(a.dataset.cell) - Number(b.dataset.cell))
    .map((b) => b.getAttribute('aria-label')!.replace(/, à vous$/, ''));
const rowWords = (row: Row) =>
  rowItems(row).map((x, k) => `Place ${k + 1}${NNBSP}: ${x === 'bar' ? 'séparateur' : x === 'White' ? 'pièce blanche' : 'pièce rouge'}`);
const boardWords = (row: Row, turn: Colour) =>
  Array.from({ length: 9 }, (_, i) => describeCell('fr', { cells: fromRow(row), to_move: turn, move_count: 0, history: [] }, i, null));
const x = (node: Element): number => Number(/translate\(([-\d.]+)px/.exec((node as HTMLElement).style.transform)![1]);
const marks = (el: PogoCount, kind: string) => $$(el, `.marks .mark.${kind}`).map((m) => Number(m.dataset.cell));
/** The row's places as 30px-wide boxes side by side, for a pointer to find. */
function measurable(el: PogoCount): void {
  $$(el, '.row-hit').forEach((b, i) => {
    b.getBoundingClientRect = () => ({ left: 30 * i, right: 30 * i + 30, top: 0, bottom: 40, width: 30, height: 40, x: 30 * i, y: 0 }) as DOMRect;
    b.setPointerCapture = vi.fn();
  });
}
const pointer = (el: PogoCount, type: string, p: number, at: number, y = 20) =>
  place(el, p).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: at, clientY: y, pointerId: 1, isPrimary: true, button: 0 }));
const key = (node: Element, k: string) => node.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-count>, the introduction', () => {
  it('shows a real position, the one the essay’s own drawings use, with a stack of both colours', () => {
    expect(shown.cells).toEqual(defaultPosition().cells);
    expect(drawn(first)).toBe('W|WWWRRW|W||||RR||RR');
    expect(shown.to_move).toBe('Red');
  });

  it('waits on the position, the row dimmed under it, until half of it is on screen', async () => {
    const el = await mount('fr');
    expect(phase(el)).toBe('waiting');
    expect($(el, '.count').dataset.solid).toBe('board');
    expect($$(el, '.pieces .pc')).toHaveLength(PIECES);
    expect($$(el, '.twins .pc')).toHaveLength(PIECES);
    expect($$(el, '.bars .bar')).toHaveLength(BARS);
    expect($$(el, '.bars .bar').every((b) => b.style.opacity === '0.3')).toBe(true);
    expect($$(el, '.squares .cell')).toHaveLength(9);
    expect($(el, '.turn-text').textContent).toBe('Trait aux Rouges');
    // Nothing invites the reader yet, and no mark says a stack may be lifted.
    expect($$(el, '.marks .mark')).toHaveLength(0);
    expect(sheet).not.toMatch(/\.toy-invite\s*\{[^}]*visibility/);
    remove(el);
  });

  it('plays once: the position, then its row of 12 pieces and 8 separators laid in the order of the pile, then the toy is the reader’s', async () => {
    const el = await mount('fr');
    vi.useFakeTimers();
    intersect(el);
    expect(phase(el)).toBe('intro');
    expect(said(el)).toBe('Une position du Pogo.');
    expect($(el, '.count').dataset.solid).toBe('board');
    vi.advanceTimersByTime(INTRO_HOLD[0]);
    expect(said(el)).toBe('Une position, c’est une pile de 12 pièces, coupée par 8 séparateurs.');
    expect($(el, '.count').dataset.solid).toBe('row');
    expect(order(el, '.pieces')).toEqual(first.order);
    // Left to right: the 20 places, pieces and separators, as the row says.
    const things = [
      ...$$(el, '.pieces .pc').map((n) => ({ x: x(n), what: n.dataset.colour![0]! })),
      ...$$(el, '.bars .bar').map((n) => ({ x: x(n), what: '|' })),
    ].sort((a, b) => a.x - b.x);
    expect(things.map((t) => t.what).join('')).toBe(drawn(first));
    expect($$(el, '.bars .bar').every((b) => b.style.opacity === '1')).toBe(true);
    // The position the row folds into stays on the board: the same twelve, as twins.
    expect(order(el, '.twins')).toEqual(first.order);
    vi.advanceTimersByTime(INTRO_HOLD[1]);
    expect(phase(el)).toBe('ready');
    // No sentence of the introduction is left, and nothing replays it.
    expect(said(el)).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    expect(el.shadowRoot!.querySelector('[data-role="play"], [data-role="next"], [data-role="counter"], .controls:not(.counts)')).toBeNull();
    leave(el);
    intersect(el);
    expect(phase(el)).toBe('ready');
    expect(said(el)).toBe('');
    remove(el);
  });

  it('is short: a position, then its row', () => {
    expect(INTRO_HOLD).toHaveLength(2);
    expect(INTRO_HOLD[0] + INTRO_HOLD[1]).toBeLessThanOrEqual(6000);
  });

  it('ends at once on the reader’s first press, which acts: the stack pressed is lifted', async () => {
    const el = await mount('fr');
    intersect(el);
    expect(phase(el)).toBe('intro');
    square(el, 1).dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(phase(el)).toBe('ready');
    expect(said(el)).toBe('');
    square(el, 1).click();
    expect(marks(el, 'picked')).toEqual([1]);
    remove(el);
  });

  it('under reduced motion nothing plays: the position and its row, both whole, the reader’s from the start', async () => {
    const el = await mount('en', true);
    intersect(el);
    expect(phase(el)).toBe('ready');
    expect(said(el)).toBe('');
    expect($(el, '.turn-text').textContent).toBe('Red to move');
    expect($$(el, '.bars .bar').every((b) => b.style.opacity === '1')).toBe(true);
    expect(drawnRow(el)).toBe(drawn(first));
  });

  it('stops once disconnected', async () => {
    const el = await mount('en');
    vi.useFakeTimers();
    intersect(el);
    const line = $(el, '.say');
    remove(el);
    vi.advanceTimersByTime(20_000);
    expect(line.textContent).toBe('A position of Pogo.');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('<pogo-count>, the toy', () => {
  it('invites the reader in one short line, in the introduction’s place, and no « à vous » is left', async () => {
    const fr = await mountReady('fr');
    expect($(fr, '.toy-invite').textContent).toBe(`Déplacez une pièce ou un séparateur${NNBSP}: l’autre côté suit.`);
    expect($(fr, '.top').contains($(fr, '.toy-invite'))).toBe(true);
    expect($(fr, '.top').contains($(fr, '.say'))).toBe(true);
    expect(fr.shadowRoot!.textContent).not.toMatch(/À vous|à vous/);
    const en = await mountReady('en');
    expect($(en, '.toy-invite').textContent).toBe('Move a piece or a separator: the other side follows.');
    expect(en.shadowRoot!.textContent).not.toMatch(/Your turn|Your move/);
  });

  it('repeats none of the essay’s numbers: no 924, no 125 970, no total, no formula', async () => {
    const el = await mountReady();
    const all = (el.shadowRoot!.textContent ?? '').replace(/[\s  ]/g, '');
    for (const n of ['924', '125970', '232792560', '116396280']) expect(all).not.toContain(n);
    expect(el.shadowRoot!.querySelector('sub, sup, .binomial')).toBeNull();
    for (const lang of ['fr', 'en'] as const) {
      const own = Object.entries(STRINGS[lang]).filter(([k]) => k.startsWith('count'));
      expect(own.length).toBeGreaterThan(0);
      for (const [, v] of own) expect(v.replace(/[\s  ,]/g, '')).not.toMatch(/924|125970|232792560|C\(/);
    }
  });

  it('the board takes pieces as every board of the page: the stack, how many, where they land', async () => {
    const el = await mountReady();
    // At rest every stack may be lifted: cornered, as on the playable board.
    expect(marks(el, 'target')).toEqual([0, 1, 2, 6, 8]);
    expect(marks(el, 'picked')).toEqual([]);
    expect($(el, '.counts').hasAttribute('data-off')).toBe(true);
    square(el, 1).click();
    expect(marks(el, 'picked')).toEqual([1]);
    // Any other square may receive the pieces: every arrangement is a position.
    expect(marks(el, 'target')).toEqual([0, 2, 3, 4, 5, 6, 7, 8]);
    expect($(el, '.counts').hasAttribute('data-off')).toBe(false);
    expect([1, 2, 3].map((n) => count(el, n).hidden)).toEqual([false, false, false]);
    expect(count(el, 1).getAttribute('aria-pressed') ?? count(el, 1).getAttribute('aria-checked')).toBe('true');
    count(el, 3).click();
    square(el, 4).click();
    const edit = movePieces(first, 1, 3, 4);
    expect(drawnRow(el)).toBe(drawn(edit.row));
    expect(drawnRow(el)).toBe('W|WWW|W||RRW||RR||RR');
    expect(boardLabels(el)).toEqual(boardWords(edit.row, 'Red'));
    // The row follows at once: its places say the new position.
    expect(rowLabels(el)).toEqual(rowWords(edit.row));
    expect(order(el, '.pieces')).toEqual(edit.row.order);
    expect(order(el, '.twins')).toEqual(edit.row.order);
    expect(marks(el, 'picked')).toEqual([]);
  });

  it('a square of one piece offers one; a tap on the lifted stack or Escape puts it down; an empty square lifts nothing', async () => {
    const el = await mountReady();
    square(el, 0).click();
    expect([1, 2, 3].map((n) => count(el, n).hidden)).toEqual([false, true, true]);
    square(el, 0).click();
    expect(marks(el, 'picked')).toEqual([]);
    square(el, 4).click();
    expect(marks(el, 'picked')).toEqual([]);
    square(el, 6).click();
    key(square(el, 6), 'Escape');
    expect(marks(el, 'picked')).toEqual([]);
    expect(drawnRow(el)).toBe(drawn(first));
  });

  it('the moved pieces keep their own drawings: a piece is where the reader put it, on both sides', async () => {
    const el = await mountReady();
    const before = $$(el, '.twins .pc').map((p) => ({ p, rank: Number(p.dataset.rank) }));
    square(el, 1).click();
    count(el, 2).click();
    square(el, 3).click();
    const edit = movePieces(first, 1, 2, 3);
    for (const { p, rank } of before) expect(Number(p.dataset.rank)).toBe(edit.pieces[rank]);
  });

  it('a stack lifted on the board has its square’s name stamped under the row', async () => {
    const el = await mountReady();
    const names = () => $$(el, '.run-name').filter((n) => !n.hidden);
    // Each run of pieces carries its square's name; an empty square has none.
    expect(names().map((n) => n.textContent)).toEqual(['a1', 'b1', 'c1', 'a3', 'c3']);
    const found = runs(LAYOUTS.mid, first);
    names().forEach((n, k) => expect(parseFloat(n.style.left)).toBeCloseTo((found[k]!.x / LAYOUTS.mid.width) * 100, 2));
    expect(names().some((n) => n.hasAttribute('data-on'))).toBe(false);
    square(el, 6).click();
    expect(names().filter((n) => n.hasAttribute('data-on')).map((n) => n.textContent)).toEqual(['a3']);
  });

  it('draws how it reads: the board’s order at its left, an arrow over the row’s first place, and the squares named on the board', async () => {
    const el = await mountReady();
    expect($$(el, '.order path')).toHaveLength(5);
    const head = $(el, '.row-head .reads');
    expect(head.dataset.dir).toBe('right');
    expect(head.textContent).toBe('chaque pile, du bas vers le haut');
    expect($$(el, '.board-hit .board-labels .coord').map((c) => c.textContent).sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3']);
    // Ink, never dashed: a dashed edge means where a move left from.
    expect(sheet).not.toMatch(/dash/);
    const en = await mountReady('en');
    expect($(en, '.row-head .reads').textContent).toBe('each stack, bottom to top');
  });

  it('a piece dragged along the row is put where it is dropped, the things between closing up, and the board follows', async () => {
    const el = await mountReady();
    measurable(el);
    // The eighth place holds b1's top white piece: dragged three places right, into a2.
    pointer(el, 'pointerdown', 7, 225);
    pointer(el, 'pointermove', 7, 225 + DRAG_SLOP + 1);
    const held = $$(el, '.pieces .pc, .twins .pc').filter((p) => p.hasAttribute('data-held'));
    expect(held).toHaveLength(1);
    expect(held[0]!.dataset.colour).toBe('White');
    pointer(el, 'pointermove', 7, 315);
    // While it is held the row already shows the drop, and the board with it; nothing is the reader's position yet.
    const edit = moveItem(first, 7, 10);
    expect(order(el, '.pieces')).toEqual(edit.row.order);
    expect(drawnRow(el)).toBe(drawn(first));
    // The piece itself is under the pointer: 90px right of its place.
    expect(x(held[0]!)).toBeCloseTo(LAYOUTS.mid.row.x + 7.5 * LAYOUTS.mid.row.slot + 90, 1);
    pointer(el, 'pointerup', 7, 315);
    expect(drawnRow(el)).toBe(drawn(edit.row));
    expect(drawnRow(el)).toBe('W|WWWRR|W|W|||RR||RR');
    expect(boardLabels(el)).toEqual(boardWords(edit.row, 'Red'));
    expect(boardLabels(el)[3]).toBe(`a2${NNBSP}: pile de 1, sommet blanc`);
    expect(rowLabels(el)).toEqual(rowWords(edit.row));
    expect($$(el, '[data-held]')).toHaveLength(0);
    expect($(el, '.sr[role="status"]').textContent).toBe(`Place 11${NNBSP}: pièce blanche, en place.`);
  });

  it('a separator is dragged the same way: the squares on each side of it change', async () => {
    const el = await mountReady();
    measurable(el);
    pointer(el, 'pointerdown', 1, 45);
    pointer(el, 'pointermove', 1, 105);
    const bar = $$(el, '.bars .bar').filter((b) => b.hasAttribute('data-held'));
    expect(bar).toHaveLength(1);
    // Under the pointer, 60px right of its place, and as tall as it stands in the row.
    expect(x(bar[0]!)).toBeCloseTo(LAYOUTS.mid.row.x + 1.5 * LAYOUTS.mid.row.slot + 60, 1);
    expect(bar[0]!.style.transform).toContain('scale(1.0000)');
    pointer(el, 'pointerup', 1, 105);
    const edit = moveItem(first, 1, 3);
    expect(drawnRow(el)).toBe('WWW|WRRW|W||||RR||RR');
    expect(boardLabels(el)).toEqual(boardWords(edit.row, 'Red'));
  });

  it('a drag let go off the row, or taken back by the browser, moves nothing', async () => {
    const el = await mountReady();
    measurable(el);
    pointer(el, 'pointerdown', 0, 15);
    pointer(el, 'pointermove', 0, 15, 400);
    pointer(el, 'pointerup', 0, 15, 400);
    expect(drawnRow(el)).toBe(drawn(first));
    pointer(el, 'pointerdown', 0, 15);
    pointer(el, 'pointermove', 0, 200);
    pointer(el, 'pointercancel', 0, 200);
    expect(drawnRow(el)).toBe(drawn(first));
    expect(order(el, '.pieces')).toEqual(first.order);
    expect($$(el, '[data-held]')).toHaveLength(0);
  });

  it('the row is moved without dragging too: a tap then a tap, or the keyboard', async () => {
    const el = await mountReady();
    place(el, 0).click();
    expect(place(el, 0).getAttribute('aria-pressed')).toBe('true');
    place(el, 2).click();
    expect(drawnRow(el)).toBe(drawn(moveItem(first, 0, 2).row));
    expect(place(el, 0).getAttribute('aria-pressed')).toBe('false');
    // One tab stop; Enter takes, the arrows choose a place, Enter puts.
    expect($$(el, '.row-hit').filter((b) => b.tabIndex === 0)).toHaveLength(1);
    const before = drawnRow(el)!;
    place(el, 19).click();
    key(place(el, 19), 'ArrowLeft');
    place(el, 18).click();
    expect(drawnRow(el)).toBe(`${before.slice(0, 18)}${before[19]}${before[18]}`);
    key(place(el, 3), 'Escape');
    expect($$(el, '.row-hit').some((b) => b.getAttribute('aria-pressed') === 'true')).toBe(false);
  });

  it('the turn line passes the turn when pressed: the third thing a position is', async () => {
    const el = await mountReady();
    $(el, '.turn').click();
    expect($(el, '.turn-text').textContent).toBe('Trait aux Blancs');
    expect($(el, '.turn').dataset.turn).toBe('White');
    expect(drawnRow(el)).toBe(drawn(first));
    $(el, '.turn').click();
    expect($(el, '.turn-text').textContent).toBe('Trait aux Rouges');
  });
});
