import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { features, key, legal, play, type State, type Triple } from '../engine';
import { createStore, type Store } from '../store';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia } from '../test-dom';
import { encodingDemo } from './encoding-demo';
import { encodingDiff } from './encoding-diff';
import { defaultPosition } from './net-position';
import { DEMO_INTERVAL, PogoEncoding, inputText } from './pogo-encoding';

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

  it('says whose turn it is and what +1 means now', async () => {
    const el = await mount();
    expect($(el, '.key').textContent).toBe('Aux Rouges de jouer : +1 = pièce rouge, −1 = pièce blanche, 0 = pas de pièce.');
    playByHand(el, [6, 1, 3]);
    expect($(el, '.key').textContent).toBe('Aux Blancs de jouer : +1 = pièce blanche, −1 = pièce rouge, 0 = pas de pièce.');
    expect($(el, '.key').hasAttribute('data-turned')).toBe(true);
    const en = await mount('en');
    expect($(en, '.key').textContent).toBe('Red to move: +1 = a Red piece, −1 = a White piece, 0 = no piece.');
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
    expect($(el, '.enc-row[data-row="8"]').classList.contains('on')).toBe(true);
    // Lifting changes nothing in the grid: no mark appears.
    expect($$(el, '.v[data-change]')).toHaveLength(0);
    cellButton(el, 8).click();
    expect($$(el, '.board .mark.picked')).toHaveLength(0);
    expect($$(el, '.enc-row.on')).toHaveLength(0);
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

  it('plays a short demonstration by itself once on screen: the next moves of the essay’s game, the grid following', async () => {
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    const demo = encodingDemo();
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    expect($(el, '[data-role="counter"]').textContent).toBe('coup 0 sur 4');
    for (let i = 1; i < demo.states.length; i++) {
      await vi.advanceTimersByTimeAsync(DEMO_INTERVAL);
      expect(shownKey(el)).toBe(key(demo.states[i]!));
      expect(values(el)).toEqual(expected(demo.states[i]!));
      expect($(el, '[data-role="counter"]').textContent).toBe(`coup ${i} sur 4`);
    }
    expect(playState(el)).toBe('replay');
    // The demonstration's moves are the figure's line: they can be taken back.
    ($(el, '[data-role="undo"]') as HTMLButtonElement).click();
    expect(shownKey(el)).toBe(key(demo.states[3]!));
  });

  it('the reader’s first touch stops the demonstration for good', async () => {
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    intersect(el);
    await vi.advanceTimersByTimeAsync(DEMO_INTERVAL);
    const demo = encodingDemo();
    expect(shownKey(el)).toBe(key(demo.states[1]!));
    // A stack lifted is enough.
    const m = legal(demo.states[1]!)[0]!;
    cellButton(el, m.from_cell).click();
    expect(playState(el)).toBe('play');
    expect($(el, '[data-role="counter"]').textContent).toBe('À vous de jouer');
    await vi.advanceTimersByTimeAsync(DEMO_INTERVAL * 3);
    expect(shownKey(el)).toBe(key(demo.states[1]!));
    leave(el);
    intersect(el);
    await vi.advanceTimersByTimeAsync(DEMO_INTERVAL * 3);
    expect(shownKey(el)).toBe(key(demo.states[1]!));
  });

  it('under reduced motion it rests on the essay’s position, with the play control', async () => {
    setMedia(REDUCED_MOTION, true);
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    intersect(el);
    await vi.advanceTimersByTimeAsync(DEMO_INTERVAL * 3);
    expect(shownKey(el)).toBe(key(defaultPosition()));
    expect(playState(el)).toBe('play');
  });

  it('says a game that ends on its board', async () => {
    const el = await mount();
    // The essay's game, to its end: White wins.
    for (const m of (await import('../default-game')).DEFAULT_GAME.slice(3)) playByHand(el, m as Triple);
    expect($(el, '.key').textContent).toBe('Partie terminée : Blanc gagne.');
    expect($$(el, '.cell-button[data-actionable]')).toHaveLength(0);
  });

  it('the board stands beside the grid in the wide box, and above it otherwise; the grid never scrolls', () => {
    const wide = sheet.slice(sheet.indexOf('@container (min-width: 860px)', sheet.indexOf('.sr {')));
    expect(wide).toMatch(/\.enc-body \{[^}]*grid-template-columns: 300px minmax\(0, 640px\)/);
    expect(sheet).not.toMatch(/overflow-x|overflow: auto|overflow: scroll/);
    expect(sheet).toMatch(/\.enc-row \{[^}]*grid-template-columns: 2\.1em repeat\(12, minmax\(0, 1fr\)\)/);
  });
});

describe('inputText', () => {
  it('writes the inputs as the essay names them', () => {
    expect([1, -1, 0, 0.25, 1 / 12, 0.5, 1].map((x) => inputText('fr', Math.fround(x)))).toEqual(['+1', '−1', '0', '0,25', '0,08', '0,5', '+1']);
    expect(inputText('en', 0.25)).toBe('0.25');
  });
});
