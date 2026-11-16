import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { describeCell } from '../board-state';
import { createDriver, type Searcher } from '../driver';
import { LC1_2, legal, moveName, play, replay, terminal, type State, type Triple } from '../engine';
import { REDUCED_MOTION, intersect, observersOf, resetMedia, setMedia, shownText } from '../test-dom';
import { createStore, type Store } from '../store';
import { PogoBoard } from './pogo-board';

if (!customElements.get('pogo-board')) customElements.define('pogo-board', PogoBoard);

const flush = () => new Promise((r) => setTimeout(r, 0));
const firstLegal = (s: State): Triple => {
  const m = legal(s)[0]!;
  return [m.from_cell, m.num_pieces, m.to_cell];
};

let store: Store;
let pending: { resolve: () => void; reject: (e: Error) => void }[];
let mode: 'auto' | 'manual';
let reply: (s: State, ply: number) => Triple;

const searcher: Searcher = {
  bestMove: (state) =>
    new Promise((resolve, reject) => {
      const answer = () =>
        resolve({ move: reply(state, store.current()!.moves.length), snapshot: { sim: 1, root: [] }, via: 'worker' });
      if (mode === 'auto') answer();
      else pending.push({ resolve: answer, reject });
    }),
};

beforeEach(() => {
  document.body.innerHTML = '';
  resetMedia();
  store = createStore({ storage: null, target: document, loadEngine: () => Promise.resolve() });
  const driver = createDriver(store, searcher, { minDelayMs: 0 });
  PogoBoard.deps = { store, driver: () => driver };
  pending = [];
  mode = 'auto';
  reply = (s) => firstLegal(s);
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function mount(lang = 'fr', attrs: Record<string, string> = {}): Promise<PogoBoard> {
  const wrapper = document.createElement('section');
  wrapper.setAttribute('lang', lang);
  const el = document.createElement('pogo-board') as PogoBoard;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = '<p>Sans JavaScript, un plateau statique.</p>';
  wrapper.append(el);
  document.body.append(wrapper);
  intersect(el);
  await flush();
  return el;
}

const $ = <T extends Element = HTMLElement>(el: PogoBoard, sel: string) => el.shadowRoot!.querySelector<T>(sel)!;
const cell = (el: PogoBoard, i: number) => $<HTMLButtonElement>(el, `.cell-button[data-cell="${i}"]`);
const marks = (el: PogoBoard, kind: string) =>
  [...el.shadowRoot!.querySelectorAll(`.board .mark.${kind}`)].map((m) => Number(m.getAttribute('data-cell'))).sort();
const live = (el: PogoBoard) => $(el, '.sr').textContent;
/** The « Nouvelle partie » buttons the reader can see: exactly one, wherever the game stands. */
const shownNewGame = (el: PogoBoard) =>
  [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-role="new-game"]')].filter((b) => b.closest('[hidden]') === null);
/** Starts a new game; during a game that takes the second press, as the reader's would. */
const newGame = (el: PogoBoard) => {
  const shown = shownNewGame(el);
  expect(shown).toHaveLength(1);
  shown[0]!.click();
  if (shown[0]!.textContent === 'Abandonner la partie\u202f?' || shown[0]!.textContent === 'Abandon this game?') shown[0]!.click();
};
const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));

describe('<pogo-board> inline', () => {
  it('every cell is a button named by coordinate and content, in the element’s language', async () => {
    const fr = await mount('fr');
    expect(fr.shadowRoot!.querySelectorAll('button.cell-button')).toHaveLength(9);
    expect(cell(fr, 0).getAttribute('aria-label')).toBe('a1 : pile de 2, sommet blanc');
    expect(cell(fr, 4).getAttribute('aria-label')).toBe('b2 : vide');
    expect($(fr, '.cells').getAttribute('aria-label')).toBe('Plateau');
    const en = await mount('en');
    expect(cell(en, 8).getAttribute('aria-label')).toBe('c3: stack of 2, Red on top');
    // Cells sit in screen order: a3 first, c1 last.
    const order = [...en.shadowRoot!.querySelectorAll<HTMLElement>('.cell-button')].map((b) => b.dataset.cell);
    expect(order).toEqual(['6', '7', '8', '3', '4', '5', '0', '1', '2']);
  });

  it('side and level are radio groups: one tab stop, arrows choose, the choice is for the next game', async () => {
    const el = await mount('en');
    const side = $(el, '.setup [role="radiogroup"][aria-labelledby="side-label"]');
    const radios = [...side.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(radios.map((b) => b.tabIndex)).toEqual([0, -1]);
    radios[0]!.focus();
    key(radios[0]!, 'ArrowRight');
    expect(store.preferences().readerColour).toBe('Red');
    expect(radios.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(el.shadowRoot!.activeElement).toBe(radios[1]);
  });

  it('lays the kit’s fixed-size coordinates over the board, not SVG text', async () => {
    const el = await mount('en');
    expect(el.shadowRoot!.querySelectorAll('.play .board-labels .coord')).toHaveLength(9);
    expect(el.shadowRoot!.querySelectorAll('.play svg text')).toHaveLength(0);
  });

  it('labels itself live in lc1-2, names the net and its measured strength, and marks « normal » as measured', async () => {
    const el = await mount('fr');
    expect($(el, '.fidelity').textContent).toBe('Calcul en direct · règle des répétitions (lc1-2)');
    expect($(el, '.note').textContent).toContain('az-lc1-s1');
    expect($(el, '.note').textContent).toContain('85,5\u202f% [82,3\u202f; 88,7]');
    expect($(el, '.choice[data-value="normal"]').textContent).toBe('Normal · mesuré');
    expect($(el, '.choice[data-value="easy"]').textContent).toBe('Facile');
    const en = await mount('en');
    expect($(en, '.note').textContent).toContain('85.5% [82.3; 88.7]');
    expect($(el, 'slot').hidden).toBe(true);
  });

  it('with no game, says how to start and offers nothing on the board', async () => {
    const el = await mount('fr');
    expect($(el, '.turn').textContent).toBe('Choisissez votre camp et le niveau, puis lancez une nouvelle partie.');
    cell(el, 0).click();
    expect(marks(el, 'picked')).toEqual([]);
    expect(store.current()).toBeNull();
  });

  it('lifting a stack offers its counts and rings exactly the legal destinations; a tap plays, the AI answers', async () => {
    const el = await mount('fr');
    newGame(el);
    const s0 = store.current()!.states[0]!;
    const moves = legal(s0);
    expect(marks(el, 'target')).toEqual([...new Set(moves.map((m) => m.from_cell))].sort());
    expect(cell(el, 0).getAttribute('aria-label')).toBe('a1 : pile de 2, sommet blanc, à vous');
    expect($(el, '.counts').hasAttribute('data-off')).toBe(true);

    cell(el, 0).click();
    expect(marks(el, 'picked')).toEqual([0]);
    const ones = moves.filter((m) => m.from_cell === 0 && m.num_pieces === 1).map((m) => m.to_cell).sort();
    expect(marks(el, 'target')).toEqual(ones);
    expect($(el, '.counts').hasAttribute('data-off')).toBe(false);
    const shown = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.counts .control')].filter((b) => !b.hidden);
    expect(shown.map((b) => b.textContent)).toEqual(
      [...new Set(moves.filter((m) => m.from_cell === 0).map((m) => String(m.num_pieces)))].sort(),
    );
    expect(cell(el, 0).getAttribute('aria-label')).toContain('soulevée');

    cell(el, ones[0]!).click();
    await flush();
    const g = store.current()!;
    expect(g.moves[0]).toEqual([0, 1, ones[0]]);
    expect(g.moves).toHaveLength(2);
    expect(live(el)).toMatch(/^Rouge joue [abc][123]-[123]-[abc][123]$/);
    expect(el.dataset.search).toBe('worker');
  });

  it('tapping the lifted stack again, or Escape, puts it down', async () => {
    const el = await mount('en');
    newGame(el);
    cell(el, 0).click();
    cell(el, 0).click();
    expect(marks(el, 'picked')).toEqual([]);
    cell(el, 1).click();
    key(cell(el, 1), 'Escape');
    expect(marks(el, 'picked')).toEqual([]);
    expect(store.current()!.moves).toHaveLength(0);
  });

  it('the keyboard: arrows move between cells, 1/2/3 choose the count', async () => {
    const el = await mount('en');
    newGame(el);
    cell(el, 0).focus();
    key(cell(el, 0), 'ArrowUp');
    expect(cell(el, 3).tabIndex).toBe(0);
    expect(cell(el, 0).tabIndex).toBe(-1);
    expect(el.shadowRoot!.activeElement).toBe(cell(el, 3));
    key(cell(el, 3), 'ArrowDown');
    expect(el.shadowRoot!.activeElement).toBe(cell(el, 0));

    cell(el, 0).click();
    const s0 = store.current()!.states[0]!;
    const twos = legal(s0).filter((m) => m.from_cell === 0 && m.num_pieces === 2).map((m) => m.to_cell).sort();
    key(cell(el, 0), '2');
    expect($(el, '.counts [role="radio"][aria-checked="true"]').textContent).toBe('2');
    expect($(el, '.counts').getAttribute('role')).toBe('radiogroup');
    expect(marks(el, 'target')).toEqual(twos);
  });

  it('while the AI thinks the board stays drawn, says so, and ignores input', async () => {
    mode = 'manual';
    const el = await mount('fr');
    store.setReaderColour('Red');
    newGame(el);
    expect(store.current()!.readerColour).toBe('Red');
    expect($(el, '.turn').textContent).toBe('L’IA réfléchit…');
    expect(el.shadowRoot!.querySelectorAll('.board .disc')).toHaveLength(12);
    cell(el, 6).click();
    expect(marks(el, 'picked')).toEqual([]);
    expect(cell(el, 6).getAttribute('aria-disabled')).toBe('true');
    pending[0]!.resolve();
    await flush();
    expect($(el, '.turn').textContent).toBe('À vous de jouer · Rouge');
    expect(marks(el, 'target').length).toBeGreaterThan(0);
  });

  it('a failed search says so and offers a retry, which asks again', async () => {
    mode = 'manual';
    const el = await mount('en');
    store.setReaderColour('Red');
    newGame(el);
    pending[0]!.reject(new Error('pogo-figures: net 404'));
    await flush();
    expect($(el, '.turn').textContent).toBe('The AI could not move.');
    const retry = $<HTMLButtonElement>(el, '.retry');
    expect(retry.hidden).toBe(false);
    retry.focus();
    retry.click();
    expect($(el, '.turn').textContent).toBe('The AI is thinking…');
    expect(retry.hidden).toBe(true);
    // The retry button went away under focus: the board takes it.
    expect(el.shadowRoot!.activeElement?.classList.contains('cell-button')).toBe(true);
    expect(pending).toHaveLength(2);
  });

  it('a game played to the end shows who won and how, and becomes lastFinished', async () => {
    reply = (_s, ply) => DEFAULT_GAME[ply]!;
    const el = await mount('fr');
    newGame(el);
    for (let ply = 0; ply < DEFAULT_GAME.length; ply += 2) {
      const [from, n, to] = DEFAULT_GAME[ply]!;
      cell(el, from).click();
      key(cell(el, from), String(n));
      cell(el, to).click();
      await flush();
    }
    expect(store.lastFinished()).toMatchObject({ finished: true, result: 'W', endedByRepetition: false });
    expect($(el, '.result:not(.sizer)').hidden).toBe(false);
    expect($(el, '.result:not(.sizer) .who').textContent).toBe('Blanc gagne');
    expect($(el, '.result:not(.sizer) .who').classList.contains('shout')).toBe(true);
    expect($(el, '.result:not(.sizer) .how').textContent).toBe('Toutes les piles ont un sommet blanc.');
    expect($(el, '.result:not(.sizer) .you').textContent).toBe('Vous gagnez.');
    expect(live(el)).toContain('Blanc gagne');
    expect(marks(el, 'target')).toEqual([]);
    expect($<HTMLDetailsElement>(el, 'details.moves').open).toBe(false);
    expect(el.shadowRoot!.querySelectorAll('details.moves li')).toHaveLength(9);
    // Each played move names itself with its explanation.
    const first = $(el, 'details.moves li');
    expect(shownText(first)).toBe(`Blanc ${moveName(DEFAULT_GAME[0]!)}`);
    expect(first.querySelector('.move-name [role="tooltip"]')!.textContent).toMatch(/^De [abc][123], [123] pièces?, vers [abc][123]\.$/);
    expect($(el, 'details.moves summary').textContent).toBe('Coups joués (9)');
    // « Nouvelle partie » sits below the board, the only one shown, primary again.
    expect(shownNewGame(el)).toHaveLength(1);
    expect(shownNewGame(el)[0]!.closest('.next')).not.toBeNull();
    expect(shownNewGame(el)[0]!.classList.contains('secondary')).toBe(false);
    expect($(el, '.setup').hidden).toBe(false);
    expect($(el, '.counts').hidden).toBe(true);
    newGame(el);
    expect(store.current()!.moves).toHaveLength(0);
    expect(store.lastFinished()!.finished).toBe(true);
  });

  it('a repetition loss names the rule and who repeated', async () => {
    const loop: Triple[] = [[0, 1, 1], [6, 1, 3], [1, 1, 0], [3, 1, 6]];
    const el = await mount('en');
    store.newGame('Red', 'normal');
    // The test plays both sides through the store; the board only shows.
    reply = (_s, ply) => [...loop, ...loop][ply]!;
    await flush();
    for (let ply = 1; ply < 8; ply += 2) {
      store.play([...loop, ...loop][ply]!);
      await flush();
    }
    expect(store.current()).toMatchObject({ finished: true, endedByRepetition: true, result: 'W' });
    expect($(el, '.result:not(.sizer) .how').textContent).toBe('Red produced a position for the third time and loses, under the repetition rule.');
    expect($(el, '.result:not(.sizer) .you').textContent).toBe('The AI wins.');
  });

  it('a figure’s playFrom shows the position on every board, with its label, the reader on the side to move', async () => {
    const el = await mount('fr');
    const s = replay(DEFAULT_GAME.slice(0, 3) as Triple[])[3]!;
    const figure = document.createElement('div');
    document.body.append(figure);
    figure.dispatchEvent(new CustomEvent('pogo:playfrom', { detail: { state: s, label: 'coup 3' }, bubbles: true, composed: true }));
    await flush();
    expect($(el, '.caption').textContent).toBe('Position reprise : coup 3');
    expect(store.current()!.readerColour).toBe('Red');
    expect($(el, '.choice[data-value="Red"]').getAttribute('aria-checked')).toBe('true');
    for (let i = 0; i < 9; i++) {
      const mark = legal(s).some((m) => m.from_cell === i) ? 'can-lift' : null;
      expect(cell(el, i).getAttribute('aria-label')).toBe(describeCell('fr', s, i, mark));
    }
    expect(live(el)).toBe('Position reprise : coup 3');
  });

  it('a move travels in 240ms ease-out, and is placed without motion under reduced motion', async () => {
    const spy = vi.fn();
    const proto = Element.prototype as unknown as { animate?: unknown };
    const original = proto.animate;
    proto.animate = spy;
    try {
      const el = await mount('en');
      newGame(el);
      const [from, n, to] = firstLegal(store.current()!.states[0]!);
      mode = 'manual';
      cell(el, from).click();
      key(cell(el, from), String(n));
      cell(el, to).click();
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0]![1]).toEqual({ duration: 240, easing: 'ease-out' });
      // The driver's « thinking » that follows must not redraw the board under the running motion.
      await flush();
      expect(spy.mock.contexts.every((node) => (node as Element).isConnected)).toBe(true);

      spy.mockClear();
      setMedia(REDUCED_MOTION, true);
      pending[0]!.resolve();
      await flush();
      expect(store.current()!.moves).toHaveLength(2);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      proto.animate = original;
    }
  });

  it('a lifted stack is put down when the game changes under it', async () => {
    const el = await mount('en');
    newGame(el);
    cell(el, 0).click();
    expect(marks(el, 'picked')).toEqual([0]);
    newGame(el);
    expect(marks(el, 'picked')).toEqual([]);
  });

  it('during a game, the setup is one line and « Nouvelle partie » is secondary and asks once before abandoning', async () => {
    mode = 'manual';
    const el = await mount('fr');
    expect($(el, '.setup').hidden).toBe(false);
    expect(shownNewGame(el)[0]!.classList.contains('secondary')).toBe(false);
    newGame(el);
    expect($(el, '.setup').hidden).toBe(true);
    expect($(el, '.summary').textContent).toBe('Blanc · Normal');
    const button = shownNewGame(el)[0]!;
    expect(button.classList.contains('secondary')).toBe(true);
    const start = store.current();
    button.focus();
    button.click();
    expect(store.current()).toBe(start);
    expect(button.textContent).toBe('Abandonner la partie\u202f?');
    expect(live(el)).toBe('Abandonner la partie\u202f?');
    // Escape, or focus leaving, puts the question away.
    key(button, 'Escape');
    expect(button.textContent).toBe('Nouvelle partie');
    button.click();
    button.dispatchEvent(new FocusEvent('blur'));
    expect(button.textContent).toBe('Nouvelle partie');
    // Two presses in a row abandon the game for a new one.
    button.click();
    button.click();
    expect(store.current()).not.toBe(start);
    expect(store.lastFinished()).toBeNull();
  });

  it('the abandon question goes away when the game moves on, with no blur (Safari and Firefox do not focus a clicked button)', async () => {
    const el = await mount('en');
    newGame(el);
    const button = shownNewGame(el)[0]!;
    const start = store.current();
    button.click();
    expect(button.textContent).toBe('Abandon this game?');
    // The reader keeps playing: no blur event is fired.
    const [from, n, to] = firstLegal(store.current()!.states[0]!);
    cell(el, from).click();
    key(cell(el, from), String(n));
    cell(el, to).click();
    await flush();
    expect(store.current()!.moves).toHaveLength(2);
    expect(button.textContent).toBe('New game');
    // One press now only asks again: the game is the same one, two plies in.
    button.click();
    expect(store.current()!.start).toBe(start!.start);
    expect(store.current()!.moves).toHaveLength(2);
    expect(button.textContent).toBe('Abandon this game?');
  });

  it('a press elsewhere in the board puts the abandon question away', async () => {
    const el = await mount('en');
    newGame(el);
    const button = shownNewGame(el)[0]!;
    button.click();
    cell(el, 4).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(button.textContent).toBe('New game');
    // A press on the button itself keeps the question for its second press.
    button.click();
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(button.textContent).toBe('Abandon this game?');
  });

  it('the status area keeps one height: an invisible copy of the longest result holds it', async () => {
    const el = await mount('en');
    const sizer = $(el, '.status .sizer');
    expect(sizer.getAttribute('aria-hidden')).toBe('true');
    expect($(el, '.status .sizer .how').textContent).toBe('White produced a position for the third time and loses, under the repetition rule.');
    // The visible variants share the sizer's grid cell (pogo-board.css), and the result is not inside the board's frame.
    expect($(el, '.status').nextElementSibling).toBe($(el, '.play'));
  });

  it('a new game mid-way abandons the current one', async () => {
    const el = await mount('en');
    newGame(el);
    const [from, n, to] = firstLegal(store.current()!.states[0]!);
    cell(el, from).click();
    key(cell(el, from), String(n));
    cell(el, to).click();
    await flush();
    newGame(el);
    expect(store.current()!.moves).toHaveLength(0);
    expect(store.lastFinished()).toBeNull();
  });

  it('the count chooser losing focus as the move is played hands focus to the board', async () => {
    mode = 'manual';
    const el = await mount('en');
    newGame(el);
    const [from, n, to] = firstLegal(store.current()!.states[0]!);
    cell(el, from).click();
    const count = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.counts .control')][n - 1]!;
    count.focus();
    count.click();
    cell(el, to).click();
    expect(el.shadowRoot!.activeElement?.classList.contains('cell-button')).toBe(true);
  });
});

describe('<pogo-board mode="follow">', () => {
  it('stays out of the page until a game is under way, then shows it', async () => {
    const el = document.createElement('pogo-board') as PogoBoard;
    el.setAttribute('mode', 'follow');
    document.body.append(el);
    expect(el.hasAttribute('data-idle')).toBe(true);
    store.newGame('White', 'normal');
    expect(el.hasAttribute('data-idle')).toBe(false);
  });

  it('is bound to the same game, folded to a bar saying whose turn it is until the reader opens it', async () => {
    const inline = await mount('fr');
    newGame(inline);
    const el = await mount('fr', { mode: 'follow' });
    expect(el.shadowRoot!.querySelector('.setup')).toBeNull();
    expect($(el, '.bar-status').textContent).toBe('À vous de jouer\u00a0· Blanc');
    const toggle = $<HTMLButtonElement>(el, '.bar .control');
    // A game started on the inline board leaves it folded.
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe('Ouvrir');
    expect($(el, '.body').hidden).toBe(true);
    expect(el.hasAttribute('data-collapsed')).toBe(true);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Réduire');
    expect($(el, '.body').hidden).toBe(false);
    toggle.click();
    expect($(el, '.body').hidden).toBe(true);
    toggle.click();
    expect($(el, '.body').hidden).toBe(false);

    // A move on the follow board is the inline board's move too.
    const [from, n, to] = firstLegal(store.current()!.states[0]!);
    cell(el, from).click();
    key(cell(el, from), String(n));
    cell(el, to).click();
    await flush();
    expect(store.current()!.moves).toHaveLength(2);
    expect(inline.shadowRoot!.querySelectorAll('details.moves li')).toHaveLength(2);
    // Announced once, by one board.
    expect([live(inline), live(el)].filter((x) => x.includes('Rouge joue'))).toHaveLength(1);
  });
});

describe('<pogo-board mode="follow"> as a panel', () => {
  /** A legal move that does not end the game. */
  const lasting = (s: State): Triple => {
    for (const m of legal(s)) {
      const t: Triple = [m.from_cell, m.num_pieces, m.to_cell];
      if (!terminal(play(s, t), LC1_2)) return t;
    }
    throw new Error('every move ends the game');
  };
  /** Tells every observer watching `el` whether it is on screen. */
  const onScreen = (el: Element, isIntersecting: boolean): void => {
    for (const o of observersOf(el)) {
      (o as unknown as { callback: IntersectionObserverCallback }).callback(
        [{ target: el, isIntersecting } as IntersectionObserverEntry],
        o as unknown as IntersectionObserver,
      );
    }
  };
  const toggleOf = (el: PogoBoard) => $<HTMLButtonElement>(el, '.bar .control');

  it('a game from a figure’s « Jouer d’ici » opens it; one started on a board leaves it folded', async () => {
    const el = await mount('fr', { mode: 'follow' });
    store.newGame('White', 'normal');
    await flush();
    expect(toggleOf(el).getAttribute('aria-expanded')).toBe('false');
    document.dispatchEvent(
      new CustomEvent('pogo:playfrom', { detail: { state: replay(DEFAULT_GAME.slice(0, 2)).at(-1)!, label: 'coup 2' } }),
    );
    await flush();
    expect(toggleOf(el).getAttribute('aria-expanded')).toBe('true');
    expect($(el, '.body').hidden).toBe(false);
  });

  it('the reader’s choice holds through ten moves and the AI’s replies', async () => {
    reply = (s) => lasting(s);
    const el = await mount('fr', { mode: 'follow' });
    store.newGame('White', 'normal');
    await flush();
    toggleOf(el).click();
    for (let k = 0; k < 5; k++) {
      store.play(lasting(store.current()!.states.at(-1)!));
      await flush();
      expect(toggleOf(el).getAttribute('aria-expanded')).toBe('true');
    }
    expect(store.current()!.moves).toHaveLength(10);
    toggleOf(el).click();
    store.play(lasting(store.current()!.states.at(-1)!));
    await flush();
    expect(toggleOf(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('is hidden while an inline board is on screen, and comes back when it leaves', async () => {
    const inline = await mount('fr');
    const el = await mount('fr', { mode: 'follow' });
    newGame(inline);
    await flush();
    expect(el.hasAttribute('data-yield')).toBe(false);
    onScreen(inline, true);
    expect(el.hasAttribute('data-yield')).toBe(true);
    // Folded or open, it stays out of the way, and moves do not bring it back.
    store.play(firstLegal(store.current()!.states.at(-1)!));
    await flush();
    expect(el.hasAttribute('data-yield')).toBe(true);
    onScreen(inline, false);
    expect(el.hasAttribute('data-yield')).toBe(false);
    // It lets go of the inline board at disconnect.
    el.remove();
    expect(observersOf(inline)).toHaveLength(0);
  });

  it('a yielding follow board never claims a move: the inline board on screen says it', async () => {
    // The follow board renders first (a saved game, the reader scrolled below), so it sees each move first.
    mode = 'manual';
    const el = await mount('fr', { mode: 'follow' });
    const inline = await mount('fr');
    store.newGame('White', 'normal');
    await flush();
    onScreen(inline, true);
    expect(el.hasAttribute('data-yield')).toBe(true);
    const [from, n, to] = firstLegal(store.current()!.states[0]!);
    cell(inline, from).click();
    key(cell(inline, from), String(n));
    cell(inline, to).click();
    await flush();
    expect(live(inline)).toBe(`Blanc joue ${moveName([from, n, to])}`);
    expect(live(el)).toBe('');
    pending[0]!.resolve();
    await flush();
    expect(live(inline)).toMatch(/^Rouge joue /);
    expect(live(el)).toBe('');
  });

  it('with the inline board off screen, the follow board, shown and first, says the move, and only it', async () => {
    mode = 'manual';
    const el = await mount('fr', { mode: 'follow' });
    const inline = await mount('fr');
    store.newGame('White', 'normal');
    await flush();
    onScreen(inline, false);
    expect(el.hasAttribute('data-yield')).toBe(false);
    store.play(firstLegal(store.current()!.states[0]!));
    await flush();
    expect(live(el)).toMatch(/^Blanc joue /);
    expect(live(inline)).toBe('');
  });

  it('a move made while no board is shown is not read back later', async () => {
    mode = 'manual';
    const el = await mount('fr', { mode: 'follow' });
    const inline = await mount('fr');
    store.newGame('White', 'normal');
    await flush();
    onScreen(inline, true);
    // The inline board is put in a hidden container: no board is shown.
    inline.parentElement!.style.display = 'none';
    store.play(firstLegal(store.current()!.states[0]!));
    await flush();
    expect(live(el)).toBe('');
    expect(live(inline)).toBe('');
    inline.parentElement!.style.display = '';
    pending[0]!.resolve();
    await flush();
    // Only the newest move, the AI's: the reader's, made unseen, is not replayed.
    expect(live(inline)).toMatch(/^Rouge joue [a-c][1-3]-[1-3]-[a-c][1-3]$/);
  });

  it('with no inline board on the page, it simply follows', async () => {
    const el = await mount('fr', { mode: 'follow' });
    store.newGame('White', 'normal');
    await flush();
    expect(el.hasAttribute('data-idle')).toBe(false);
    expect(el.hasAttribute('data-yield')).toBe(false);
  });

  it('Escape folds it when focus is inside, and hands focus to the toggle', async () => {
    const el = await mount('fr', { mode: 'follow' });
    store.newGame('White', 'normal');
    await flush();
    toggleOf(el).click();
    const [from] = firstLegal(store.current()!.states[0]!);
    cell(el, from).focus();
    cell(el, from).click();
    expect(marks(el, 'picked')).toEqual([from]);
    // First the lifted stack goes down, then the panel folds.
    key(cell(el, from), 'Escape');
    expect(marks(el, 'picked')).toEqual([]);
    expect(toggleOf(el).getAttribute('aria-expanded')).toBe('true');
    key(cell(el, from), 'Escape');
    expect(toggleOf(el).getAttribute('aria-expanded')).toBe('false');
    expect(el.shadowRoot!.activeElement).toBe(toggleOf(el));
    // Folded, Escape does nothing more.
    key(toggleOf(el), 'Escape');
    expect(toggleOf(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('while it holds focus it does not hide, so hiding never moves focus', async () => {
    const inline = await mount('fr');
    const el = await mount('fr', { mode: 'follow' });
    newGame(inline);
    await flush();
    toggleOf(el).focus();
    onScreen(inline, true);
    expect(el.hasAttribute('data-yield')).toBe(false);
    toggleOf(el).blur();
    await flush();
    expect(el.hasAttribute('data-yield')).toBe(true);
  });

  it('its sheet: opaque and framed with the kit’s tokens, hidden by attribute, never animated', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-board.css'), 'utf8');
    const panel = /\.pb\[data-mode='follow'\] \{([^}]*)\}/.exec(css)![1]!;
    expect(panel).toContain('background: var(--_ground);');
    expect(panel).toContain('border: 3px solid var(--_ink);');
    expect(panel).toContain('padding: 12px;');
    expect(panel).toContain('max-width: 320px;');
    expect(css).toMatch(/:host\(\[data-idle\]\),\s*:host\(\[data-yield\]\) \{\s*display: none;/);
    expect(css).toMatch(/\.bar \{[^}]*min-height: 44px;/);
    expect(css).not.toMatch(/animation|transition/);
    // No fidelity line in either state: one rule on the mode, none on the folded state alone.
    expect(css).toMatch(/:host\(\[mode='follow'\]\) \.fidelity \{\s*display: none;/);
    expect(css).not.toMatch(/data-collapsed/);
  });
});

describe('<pogo-board mode="follow"> is compact', () => {
  it('holds the board, the count and the bar only; « Nouvelle partie » once the game is over', async () => {
    reply = (_s, ply) => DEFAULT_GAME[ply]!;
    const el = await mount('fr', { mode: 'follow' });
    store.newGame('White', 'normal');
    await flush();
    $<HTMLButtonElement>(el, '.bar .control').click();
    expect(el.shadowRoot!.querySelector('details.moves')).toBeNull();
    expect(el.shadowRoot!.querySelector('.note')).toBeNull();
    expect(el.shadowRoot!.querySelector('.setup')).toBeNull();
    expect(shownNewGame(el)).toHaveLength(0);
    for (let ply = 0; ply < DEFAULT_GAME.length; ply += 2) {
      store.play(DEFAULT_GAME[ply]!);
      await flush();
    }
    expect($(el, '.bar-status').textContent).toBe('Blanc gagne');
    expect(shownNewGame(el)).toHaveLength(1);
  });
});

describe('<pogo-board> side and level during a game', () => {
  it('pressing the AI’s colour while it thinks does not hand the reader its move', async () => {
    mode = 'manual';
    const el = await mount('en');
    newGame(el);
    const [from, n, to] = firstLegal(store.current()!.states[0]!);
    cell(el, from).click();
    key(cell(el, from), String(n));
    cell(el, to).click();
    expect($(el, '.turn').textContent).toBe('The AI is thinking…');
    $<HTMLButtonElement>(el, '.choice[data-value="Red"]').click();
    expect(store.current()!.readerColour).toBe('White');
    expect(pending).toHaveLength(1);
    cell(el, 6).click();
    expect(marks(el, 'picked')).toEqual([]);
    pending[0]!.resolve();
    await flush();
    expect(store.current()!.moves).toHaveLength(2);
    expect(store.preferences().readerColour).toBe('Red');
  });
});
