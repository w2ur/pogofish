import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { features, key, legal, play, type State, type Triple } from '../engine';
import { createStore, type Store } from '../store';
import { REDUCED_MOTION, intersect, leave, resetMedia, setMedia } from '../test-dom';
import { encodingDemo } from './encoding-demo';
import { encodingDiff } from './encoding-diff';
import { defaultPosition } from './net-position';
import { INTRO_MOVE, INTRO_REST, PogoEncoding, inputText } from './pogo-encoding';

if (!customElements.get('pogo-encoding')) customElements.define('pogo-encoding', PogoEncoding);

const sheet = readFileSync(resolve(process.cwd(), 'src/elements/pogo-encoding.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const flush = () => new Promise((r) => setTimeout(r, 0));
const makeStore = () => createStore({ storage: null, loadEngine: () => Promise.resolve() });
const LOOP: Triple[] = [
  [0, 1, 1],
  [6, 1, 3],
  [1, 1, 0],
  [3, 1, 6],
];

function mountSync(lang = 'fr'): PogoEncoding {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-encoding') as PogoEncoding;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  return el;
}

async function mount(lang = 'fr'): Promise<PogoEncoding> {
  const el = mountSync(lang);
  await flush();
  return el;
}

const $ = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: Element, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const cellButton = (el: Element, i: number) => $(el, `.cell-button[data-cell="${i}"]`) as HTMLButtonElement;
const values = (el: Element) => $$(el, '.v').map((c) => c.textContent);
const shownKey = (el: Element) => $(el, '.encoding').dataset.position;
const phase = (el: Element) => $(el, '.encoding').dataset.toy;
const stamped = (el: Element) => $$(el, '.enc-row.on .c-name').map((n) => n.textContent);
const expected = (s: State, lang: 'fr' | 'en' = 'fr') => Array.from(features(s)).map((v) => inputText(lang, v));
/** Plays `m` on the figure's board as a reader does: the stack, the count, the landing. */
function playByHand(el: Element, [from, n, to]: Triple): void {
  cellButton(el, from).click();
  if (n > 1) ($(el, `.counts [data-value="${n}"]`) as HTMLButtonElement).click();
  cellButton(el, to).click();
}

let st: Store;
beforeEach(() => {
  resetMedia();
  st = makeStore();
  PogoEncoding.deps = { store: st };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-encoding>', () => {
  it('opens on the essay’s position and shows its 127 inputs: nine rows of 14 in the order of the cells, then the 127th', async () => {
    const el = await mount();
    const s = defaultPosition();
    expect(shownKey(el)).toBe(key(s));
    expect(values(el)).toEqual(expected(s));
    expect(values(el)).toHaveLength(127);
    expect($$(el, '.enc-row:not(.enc-head)')).toHaveLength(9);
    expect($$(el, '.enc-row:not(.enc-head) .c-name').map((n) => n.textContent)).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3']);
    for (const row of $$(el, '.enc-row:not(.enc-head)')) expect(row.querySelectorAll('.v')).toHaveLength(14);
    expect($(el, '.enc-rep').textContent).toBe('127ᵉ nombre0nombre de fois où la position est déjà apparue, ÷ 2');
  });

  // Regression: at 390px the grid's digits were set at ~9px (clamp from 9.5px at 3.3cqi), under the
  // page's 12.8px floor. They keep 12.8px at every width; the grid no longer scrolls sideways in a
  // box of its own (it left the figure's box by 68px at 320px): narrow, the digits take the face's
  // narrow cut and the columns close up.
  it('never sets the grid under 12.8px, and never wider than the figure: narrow, the digits narrow and the columns close up', async () => {
    expect(sheet).toMatch(/\.enc-table \{[^}]*font-size: 12\.8px;/);
    expect(sheet).not.toMatch(/\.enc-table \{[^}]*min-width/);
    expect(sheet.match(/overflow-x|overflow: auto|overflow: scroll/g)).toBeNull();
    const narrow = sheet.slice(sheet.indexOf('@container (max-width: 499px)'));
    expect(narrow).toMatch(/\.v \{\s*font-stretch: 75%;/);
    expect(narrow).toMatch(/\.enc-table \{\s*--gap: 1px;/);
    // No size is set under the floor anywhere in the sheet.
    for (const [, px] of sheet.matchAll(/font-size: (?:max\(1em, )?([\d.]+)px/g)) expect(Number(px)).toBeGreaterThanOrEqual(11);
    const el = await mount('fr');
    // The grid is no scrolling region: nothing to reach by keyboard but the board and its buttons.
    expect(el.shadowRoot!.querySelector('.enc-wrap, [role="region"]')).toBeNull();
    expect($(el, '.enc-table').tabIndex).toBe(-1);
  });

  // Regression: « Aux Rouges de jouer » was pulled 4px out of the figure's box by a negative margin
  // (measured at 566px by lot K5).
  it('nothing is pulled out of the figure’s box by a negative margin', () => {
    expect(sheet).not.toMatch(/margin(-left|-right|-inline)?: -/);
  });

  // A visitor read « +1 = pièce rouge » without seeing the essay's « +1 pour le joueur dont c'est le
  // tour » in it: the line now says the essay's words, and who that is now.
  it('says whose turn it is and what +1 means now, in the essay’s words: the player to move, and who that is', async () => {
    const el = await mount();
    expect($(el, '.key').textContent).toBe('Aux Rouges de jouer : +1 pour le joueur dont c’est le tour, ici les Rouges ; −1 pour l’adversaire, ici les Blancs ; 0 s’il n’y a pas de pièce.');
    playByHand(el, [6, 1, 3]);
    expect($(el, '.key').textContent).toBe('Aux Blancs de jouer : +1 pour le joueur dont c’est le tour, ici les Blancs ; −1 pour l’adversaire, ici les Rouges ; 0 s’il n’y a pas de pièce.');
    expect($(el, '.key').hasAttribute('data-turned')).toBe(true);
    const en = await mount('en');
    expect($(en, '.key').textContent).toBe('Red to move: +1 for the player whose turn it is, here Red; −1 for the opponent, here White; 0 if there is no piece.');
  });

  it('invites the reader to play on its board, in one line directly above it, and no « à vous » is left', async () => {
    const el = await mount();
    expect($(el, '.toy-invite').textContent).toBe('Jouez sur le plateau, les deux couleurs tour à tour\u202f: les 127 nombres suivent.');
    expect($(el, '.toy-invite').nextElementSibling!.classList.contains('play')).toBe(true);
    expect(el.shadowRoot!.textContent).not.toMatch(/À vous|à vous/);
    const en = await mount('en');
    expect($(en, '.toy-invite').textContent).toBe('Play on the board, both colours in turn: the 127 numbers follow.');
    expect(en.shadowRoot!.textContent).not.toMatch(/Your move|Your turn/);
  });

  it('draws which way it reads: an arrow from the board to the grid, and one along the stack’s columns, bottom to top', async () => {
    const el = await mount();
    // Between the board and the grid, in the order of the page.
    expect($$(el, '.enc-body > *').map((n) => n.className)).toEqual(['enc-side', 'enc-reads', 'enc-main', 'controls actions']);
    const between = $(el, '.enc-reads .reads');
    expect(between.dataset.dir).toBe('right');
    expect(between.getAttribute('aria-hidden')).toBe('true');
    // Downwards while the grid is under the board, rightwards once it stands beside it.
    expect(sheet).toMatch(/\.enc-reads \.reads \{\s*transform: rotate\(90deg\);/);
    const wide = sheet.slice(sheet.indexOf('@container (min-width: 860px)', sheet.indexOf('.sr {')));
    expect(wide).toMatch(/\.enc-reads \.reads \{\s*transform: none;/);
    const stack = $(el, '.enc-head .c-slots .reads');
    expect(stack.dataset.dir).toBe('right');
    expect(stack.textContent).toBe('pile, du bas vers le haut');
    expect(sheet).not.toMatch(/dash/);
  });

  it('the board keeps the move just played: its origin ring and the pieces it lifted', async () => {
    const el = await mount();
    const s = defaultPosition();
    const m = legal(s).find((x) => x.num_pieces === 2)!;
    playByHand(el, [m.from_cell, 2, m.to_cell]);
    expect($(el, '.board .from')?.getAttribute('data-cell')).toBe(String(m.from_cell));
    expect($(el, '.board-labels .lifted').textContent).toBe('2');
  });

  it('a slot holding a piece takes that piece’s colour whoever is to move; an empty slot is none', async () => {
    const el = await mount();
    const check = (s: State): void => {
      s.cells.forEach((stack, i) => {
        const slots = $$(el, `.enc-row[data-row="${i}"] .slot`);
        stack.forEach((piece, k) => expect(slots[k]!.dataset.piece).toBe(piece.toLowerCase()));
        slots.slice(stack.length).forEach((x) => expect(x.dataset.piece).toBe('none'));
        const top = $(el, `.enc-row[data-row="${i}"] .top`);
        expect(top.dataset.piece).toBe(stack.at(-1)?.toLowerCase() ?? 'none');
      });
    };
    const s0 = defaultPosition();
    check(s0);
    playByHand(el, [6, 1, 3]);
    check(play(s0, [6, 1, 3]));
  });

  it('the reader plays both colours in turn, legal moves only, and the grid follows each move at once', async () => {
    const el = await mount();
    let s = defaultPosition();
    // Only the side to move may lift: a White stack does nothing while Red is to move.
    cellButton(el, 0).click();
    expect($$(el, '.board .mark.picked')).toHaveLength(0);
    expect(cellButton(el, 0).hasAttribute('data-actionable')).toBe(false);
    for (let n = 0; n < 6; n++) {
      const m = legal(s)[(n * 5) % legal(s).length]!;
      const triple: Triple = [m.from_cell, m.num_pieces, m.to_cell];
      playByHand(el, triple);
      s = play(s, triple);
      expect(shownKey(el)).toBe(key(s));
      expect(values(el)).toEqual(expected(s));
    }
  });

  it('a lifted stack shows where it may land, offers its counts, and its row answers on the grid', async () => {
    const el = await mount();
    const s = defaultPosition();
    cellButton(el, 8).click();
    expect($(el, '.board .mark.picked').getAttribute('data-cell')).toBe('8');
    const lands = legal(s).filter((m) => m.from_cell === 8 && m.num_pieces === 1).map((m) => String(m.to_cell)).sort();
    expect($$(el, '.board .mark.target').map((m) => m.getAttribute('data-cell')!).sort()).toEqual(lands);
    expect($(el, '.counts').hasAttribute('data-off')).toBe(false);
    expect(stamped(el)).toEqual(['c3']);
    // Lifting changes nothing in the grid: no mark appears.
    expect($$(el, '.v[data-change]')).toHaveLength(0);
    cellButton(el, 8).click();
    expect($$(el, '.board .mark.picked')).toHaveLength(0);
    expect(stamped(el)).toEqual([]);
  });

  it('ties the rows to the board: a row carries its square’s name, stamped where the move just played left and landed', async () => {
    const el = await mount();
    // The same nine names, on the board's squares and at the head of the rows.
    expect($$(el, '.board-labels .coord').map((c) => c.textContent).sort()).toEqual($$(el, '.enc-row:not(.enc-head) .c-name').map((n) => n.textContent).sort());
    // At rest on the essay's position nothing is in use.
    expect(stamped(el)).toEqual([]);
    playByHand(el, [6, 1, 3]);
    expect($(el, '.board .from')?.getAttribute('data-cell')).toBe('6');
    expect($(el, '.board .to')?.getAttribute('data-cell')).toBe('3');
    expect(stamped(el)).toEqual(['a2', 'a3']);
    // A stack lifted takes over: its row alone.
    const next = legal(play(defaultPosition(), [6, 1, 3]))[0]!;
    cellButton(el, next.from_cell).click();
    expect(stamped(el)).toHaveLength(1);
    cellButton(el, next.from_cell).click();
    expect(stamped(el)).toEqual(['a2', 'a3']);
    ($(el, '[data-role="undo"]') as HTMLButtonElement).click();
    expect(stamped(el)).toEqual([]);
    expect(sheet).toMatch(/\.enc-row\.on \.c-name \{[^}]*background: var\(--_ink\);[^}]*color: var\(--_ground\);/);
  });

  it('the row of the square under the pointer or the focus answers too', async () => {
    const el = await mount();
    cellButton(el, 1).dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(stamped(el)).toEqual(['b1']);
    cellButton(el, 2).dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(stamped(el)).toEqual(['c1']);
    $(el, '.play').dispatchEvent(new Event('pointerleave'));
    expect(stamped(el)).toEqual([]);
    cellButton(el, 4).dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(stamped(el)).toEqual(['b2']);
    cellButton(el, 4).dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(stamped(el)).toEqual([]);
  });

  it('marks every input a move changed: new facts about the board apart from pieces merely seen from the other side', async () => {
    const el = await mount();
    const s0 = defaultPosition();
    const s1 = play(s0, [6, 1, 3]);
    const tick = $(el, '.encoding').dataset.tick;
    playByHand(el, [6, 1, 3]);
    const diff = encodingDiff({ x: features(s0), toMove: s0.to_move }, { x: features(s1), toMove: s1.to_move });
    expect($$(el, '.v').map((c) => c.dataset.change ?? 'same')).toEqual(diff);
    expect(diff.filter((d) => d === 'changed').length).toBeGreaterThan(0);
    // The whole grid turns over: every piece left in place.
    expect(diff.filter((d) => d === 'flipped').length).toBeGreaterThan(10);
    // Each move restarts the marks.
    expect($(el, '.encoding').dataset.tick).not.toBe(tick);
    expect(sheet).toMatch(/\[data-tick='0'\] \.v\[data-change='changed'\] \{\s*animation: enc-mark-a/);
    expect(sheet).toMatch(/\[data-tick='1'\] \.v\[data-change='changed'\] \{\s*animation: enc-mark-b/);
    expect(sheet).toMatch(/\[data-tick='0'\] \.v\[data-change='flipped'\] \{\s*animation: enc-flip-a/);
  });

  it('under reduced motion a mark is an outline that stays until the next move, and nothing is animated', () => {
    const reduced = sheet.slice(sheet.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.v\[data-change\],[^}]*\{\s*animation: none/);
    expect(reduced).toMatch(/\.v\[data-change='changed'\] \{\s*outline: 3px solid var\(--_ink\)/);
    expect(reduced).toMatch(/\.v\[data-change='flipped'\] \{\s*outline: 1px dotted var\(--_ink\)/);
  });

  it('« Annuler le coup » takes the last move back, « Revenir à la position de départ » the whole line', async () => {
    const el = await mount();
    const s0 = defaultPosition();
    const undo = $(el, '[data-role="undo"]') as HTMLButtonElement;
    const reset = $(el, '[data-role="reset"]') as HTMLButtonElement;
    expect([undo.textContent, reset.textContent]).toEqual(['Annuler le coup', 'Revenir à la position de départ']);
    expect([undo.disabled, reset.disabled]).toEqual([true, true]);
    playByHand(el, [6, 1, 3]);
    const s1 = play(s0, [6, 1, 3]);
    const m = legal(s1)[0]!;
    playByHand(el, [m.from_cell, m.num_pieces, m.to_cell]);
    expect([undo.disabled, reset.disabled]).toEqual([false, false]);
    undo.click();
    expect(shownKey(el)).toBe(key(s1));
    expect(values(el)).toEqual(expected(s1));
    reset.click();
    expect(shownKey(el)).toBe(key(s0));
    expect([undo.disabled, reset.disabled]).toEqual([true, true]);
  });

  it('the 127th input counts the position’s earlier occurrences, ÷ 2, as the reader repeats a position', async () => {
    st.newGame('White', 'normal');
    const el = await mount();
    ($(el, '[data-role="take"]') as HTMLButtonElement).click();
    for (const m of LOOP) playByHand(el, m);
    const rep = $(el, '.rep-value');
    expect(rep.textContent).toBe('0,5');
    expect(rep.title).toBe('1 ÷ 2');
    expect(rep.dataset.change).toBe('changed');
  });

  it('« Prendre la position de ma partie » is there only when the page has a game, and brings its position in without touching it', async () => {
    const el = await mount();
    const take = $(el, '[data-role="take"]') as HTMLButtonElement;
    expect(take.hidden).toBe(true);
    st.newGame('White', 'normal');
    st.play([0, 1, 3]);
    expect(take.hidden).toBe(false);
    expect(take.textContent).toBe('Prendre la position de ma partie');
    // The page's game moving does not move the figure by itself.
    expect(shownKey(el)).toBe(key(defaultPosition()));
    take.click();
    const mine = st.current()!.states[1]!;
    expect(shownKey(el)).toBe(key(mine));
    const m = legal(mine)[0]!;
    playByHand(el, [m.from_cell, m.num_pieces, m.to_cell]);
    // The figure's game is its own: the page's game has not moved.
    expect(st.current()!.moves).toHaveLength(1);
    ($(el, '[data-role="reset"]') as HTMLButtonElement).click();
    expect(shownKey(el)).toBe(key(defaultPosition()));
  });

  it('plays a short introduction once on screen: the next moves of the essay’s game, the grid following, then the essay’s position again', async () => {
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    const demo = encodingDemo();
    expect(demo.moves).toHaveLength(2);
    expect(phase(el)).toBe('waiting');
    intersect(el);
    expect(phase(el)).toBe('intro');
    expect(shownKey(el)).toBe(key(demo.states[0]!));
    await vi.advanceTimersByTimeAsync(INTRO_REST);
    for (let i = 1; i < demo.states.length; i++) {
      expect(shownKey(el)).toBe(key(demo.states[i]!));
      expect(values(el)).toEqual(expected(demo.states[i]!));
      // Each move shows what it changed, and where it left and landed.
      expect($$(el, '.v[data-change]').length).toBeGreaterThan(0);
      expect(stamped(el)).toHaveLength(2);
      expect(phase(el)).toBe('intro');
      await vi.advanceTimersByTimeAsync(INTRO_MOVE);
    }
    // The toy is the reader's, on the essay's position, with nothing marked as just changed.
    expect(phase(el)).toBe('ready');
    expect(shownKey(el)).toBe(key(defaultPosition()));
    expect(values(el)).toEqual(expected(defaultPosition()));
    expect($$(el, '.v[data-change]')).toHaveLength(0);
    expect(stamped(el)).toEqual([]);
    expect(($(el, '[data-role="undo"]') as HTMLButtonElement).disabled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    // It never plays again, and nothing is there to replay it.
    leave(el);
    intersect(el);
    await vi.advanceTimersByTimeAsync(INTRO_MOVE * 4);
    expect(phase(el)).toBe('ready');
    expect(shownKey(el)).toBe(key(defaultPosition()));
    expect(el.shadowRoot!.querySelector('[data-role="play"], [data-role="next"], [data-role="previous"], [data-role="counter"]')).toBeNull();
  });

  it('is short, and holds a move no longer than it needs to be read', () => {
    expect(INTRO_REST + 2 * INTRO_MOVE).toBeLessThanOrEqual(7000);
    // The marks of a move take 2200ms to fade: a move is held that long at least.
    expect(INTRO_MOVE).toBeGreaterThanOrEqual(2200);
  });

  it('the reader’s first press ends the introduction for good, and acts on the essay’s position', async () => {
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    intersect(el);
    await vi.advanceTimersByTimeAsync(INTRO_REST);
    const demo = encodingDemo();
    expect(shownKey(el)).toBe(key(demo.states[1]!));
    // A press on a stack: the toy is the reader's before the press is heard.
    cellButton(el, 6).dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(phase(el)).toBe('ready');
    expect(shownKey(el)).toBe(key(defaultPosition()));
    cellButton(el, 6).click();
    expect($(el, '.board .mark.picked').getAttribute('data-cell')).toBe('6');
    await vi.advanceTimersByTimeAsync(INTRO_MOVE * 3);
    expect(shownKey(el)).toBe(key(defaultPosition()));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a stack lifted on a position of the introduction is not lifted on the reader’s', async () => {
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    intersect(el);
    await vi.advanceTimersByTimeAsync(INTRO_REST);
    // A script presses without a pointer: White's a1, which may move only in the introduction's position.
    const demo = encodingDemo();
    const m = legal(demo.states[1]!)[0]!;
    cellButton(el, m.from_cell).click();
    expect(phase(el)).toBe('ready');
    expect(shownKey(el)).toBe(key(defaultPosition()));
    expect($$(el, '.board .mark.picked')).toHaveLength(0);
  });

  it('under reduced motion nothing plays: it rests on the essay’s position, the reader’s from the start', async () => {
    setMedia(REDUCED_MOTION, true);
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(phase(el)).toBe('ready');
    intersect(el);
    await vi.advanceTimersByTimeAsync(INTRO_MOVE * 3);
    expect(shownKey(el)).toBe(key(defaultPosition()));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('says a game that ends on its board', async () => {
    const el = await mount();
    // The essay's game, to its end: White wins.
    for (const m of (await import('../default-game')).DEFAULT_GAME.slice(3)) playByHand(el, m as Triple);
    expect($(el, '.key').textContent).toBe('Partie terminée : Blanc gagne.');
    expect($$(el, '.cell-button[data-actionable]')).toHaveLength(0);
  });

  it('the board stands beside the grid in the wide box, its actions under it; otherwise the grid comes under the board and the actions last', () => {
    const wide = sheet.slice(sheet.indexOf('@container (min-width: 860px)', sheet.indexOf('.sr {')));
    expect(wide).toMatch(/\.enc-body \{[^}]*grid-template-columns: 300px 40px minmax\(0, 640px\)/);
    expect(wide).toMatch(/\.enc-main \{[^}]*grid-column: 3;/);
    expect(wide).toMatch(/\.actions \{[^}]*grid-column: 1;/);
    expect(sheet).toMatch(/\.enc-row \{[^}]*grid-template-columns: 2\.1em repeat\(12, minmax\(0, 1fr\)\)/);
  });
});

describe('inputText', () => {
  it('writes the inputs as the essay names them', () => {
    expect([1, -1, 0, 0.25, 1 / 12, 0.5, 1].map((x) => inputText('fr', Math.fround(x)))).toEqual(['+1', '−1', '0', '0,25', '0,08', '0,5', '+1']);
    expect(inputText('en', 0.25)).toBe('0.25');
  });
});
