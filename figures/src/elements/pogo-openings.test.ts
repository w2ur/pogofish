import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableData } from '../data';
import { initial, key, moveName, play } from '../engine';
import type { PlayFromDetail } from '../kit/figure';
import { IntersectionObserverMock, REDUCED_MOTION, intersect, observersOf, resetMedia, setMedia, shownText } from '../test-dom';
import { PogoOpenings } from './pogo-openings';

if (!customElements.get('pogo-openings')) customElements.define('pogo-openings', PogoOpenings);
const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
const NNBSP = ' ';

async function mount(lang = 'fr', reduced = false): Promise<PogoOpenings> {
  resetMedia();
  if (reduced) setMedia(REDUCED_MOTION, true);
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-openings') as PogoOpenings;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const $ = (el: PogoOpenings, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoOpenings, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const reply = (el: PogoOpenings, name: string) => $(el, `.reply[data-move="${name}"]`);

beforeEach(() => {
  PogoOpenings.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(table) };
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-openings>', () => {
  it('opens on the position after c1-1-b1, White’s move marked on it, Red to play', async () => {
    const el = await mount();
    const start = $(el, '.card.start');
    expect(shownText(start.querySelector('.caption')!)).toBe('Les Blancs ont joué c1-1-b1aux Rouges de jouer');
    expect(start.querySelector('.board title')!.textContent).toBe(`Les Blancs ont joué c1-1-b1${NNBSP}: aux Rouges de jouer.`);
    expect(start.querySelector('.board .from')!.getAttribute('data-cell')).toBe('2');
    expect(start.querySelector('.board .to')!.getAttribute('data-cell')).toBe('1');
    // The board is the position itself: three white pieces on b1, one on c1.
    expect(start.querySelectorAll('.stack[data-cell="1"] .disc.white')).toHaveLength(3);
    expect(start.querySelectorAll('.stack[data-cell="2"] .disc.white')).toHaveLength(1);
  });

  it('sets apart the two replies that keep the draw, counted from the table', async () => {
    const el = await mount();
    expect($(el, '.keep .head').textContent).toBe(`Gardent la nulle${NNBSP}: 2 réponses sur 16`);
    expect($$(el, '.keep .reply').map((c) => shownText(c.querySelector('.caption')!))).toEqual(['a3-1-b3garde la nulle', 'c3-1-b3garde la nulle']);
    expect($$(el, '.keep .reply').every((c) => c.dataset.verdict === 'keeps')).toBe(true);
  });

  it('shows the fourteen that lose from the fastest loss to the slowest, each with its verdict', async () => {
    const el = await mount();
    expect($(el, '.lose .head').textContent).toBe(`Perdent${NNBSP}: 14 réponses, du gain blanc le plus rapide au plus lent`);
    const lost = $$(el, '.lose .reply');
    expect(lost).toHaveLength(14);
    expect(shownText(lost[0]!.querySelector('.caption')!)).toBe('b3-2-b1perd en 8');
    expect(shownText(lost.at(-1)!.querySelector('.caption')!)).toBe('c3-1-c2perd en 22');
    const plies = lost.map((c) => Number(c.querySelector('.verdict')!.textContent!.split(' ').at(-1)));
    expect(plies).toEqual([...plies].sort((a, b) => a - b));
    // The control: the order shown is not simply the table's own.
    const asListed = table.replies['c1-1-b1']!.filter((m) => m.verdict.kind === 'loses-in').map((m) => moveName(m.move));
    expect(lost.map((c) => c.dataset.move)).not.toEqual(asListed);
  });

  it('each board is the position after its reply, the reply marked where it left and where it landed', async () => {
    const el = await mount();
    const card = reply(el, 'b3-2-b1');
    expect(card.querySelector('.board .from')!.getAttribute('data-cell')).toBe('7');
    expect(card.querySelector('.board .to')!.getAttribute('data-cell')).toBe('1');
    expect(card.querySelectorAll('.board .disc.moved')).toHaveLength(2);
    expect(card.querySelectorAll('.stack[data-cell="1"] .disc')).toHaveLength(5);
    expect(card.querySelector('.board title')!.textContent).toBe(`Rouge joue b3-2-b1${NNBSP}: perd en 8.`);
  });

  it('every move name carries its explanation', async () => {
    const el = await mount('en');
    const name = reply(el, 'a3-1-b3').querySelector<HTMLElement>('.move-name')!;
    expect(name.tabIndex).toBe(0);
    expect(el.shadowRoot!.getElementById(name.getAttribute('aria-describedby')!)!.textContent).toBe('From a3, 1 piece, to b3.');
    expect($(el, '.keep .head').textContent).toBe('Hold the draw: 2 replies of 16');
    expect($(el, '.lose .head').textContent).toBe('Lose: 14 replies, from White’s fastest win to the slowest');
  });

  it('a board offers « Jouer cette position », and hands over the position after both moves', async () => {
    const el = await mount();
    const got: PlayFromDetail[] = [];
    const listen = (e: Event) => got.push((e as CustomEvent<PlayFromDetail>).detail);
    document.addEventListener('pogo:playfrom', listen);
    try {
      const card = reply(el, 'a3-1-b3');
      const offer = card.querySelector<HTMLButtonElement>('[data-role="play-from-here"]')!;
      // The kit's icon, named by the full sentence, which its tooltip shows.
      expect(offer.classList.contains('play-from')).toBe(true);
      expect(offer.getAttribute('aria-label')).toBe('Jouer cette position contre l’ordinateur');
      expect(offer.textContent).toBe('Jouer cette position contre l’ordinateur');
      expect(offer.querySelector('svg')).not.toBeNull();
      offer.click();
      expect(got).toHaveLength(1);
      expect(got[0]!.label).toBe('les premiers coups, c1-1-b1 a3-1-b3');
      expect(key(got[0]!.state)).toBe(key(play(play(initial(), [2, 1, 1]), [6, 1, 7])));
    } finally {
      document.removeEventListener('pogo:playfrom', listen);
    }
    // Sixteen offers, one per reply; the position Red replies in has none.
    expect($$(el, '[data-role="play-from-here"]')).toHaveLength(16);
    expect($(el, '.card.start').querySelector('button')).toBeNull();
  });

  // Regression: every move name and every offer was its own tab stop, 33 in all.
  it('five tab stops: White’s move, then in each block one board’s offer and its name, the arrows moving among the boards', async () => {
    const el = await mount();
    const stops = () => $$(el, 'button, [tabindex]').filter((n) => n.tabIndex >= 0);
    const label = (n: HTMLElement) => (n.matches('[data-role="play-from-here"]') ? `offer ${n.closest<HTMLElement>('.reply')!.dataset.move}` : n.firstChild!.textContent);
    const keep = $$(el, '.keep .reply').map((c) => c.dataset.move!);
    const lose = $$(el, '.lose .reply').map((c) => c.dataset.move!);
    expect(stops().map(label)).toEqual(['c1-1-b1', `offer ${keep[0]}`, keep[0], `offer ${lose[0]}`, lose[0]]);
    const name = (m: string) => reply(el, m).querySelector<HTMLElement>('.move-name')!;
    name(lose[0]!).focus();
    name(lose[0]!).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.shadowRoot!.activeElement).toBe(name(lose[1]!));
    // The offer's stop follows: Tab from a board's name, Shift+Tab to its offer, stay on one board.
    expect(stops().map(label)).toEqual(['c1-1-b1', `offer ${keep[0]}`, keep[0], `offer ${lose[1]}`, lose[1]]);
    name(lose[1]!).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(el.shadowRoot!.activeElement).toBe(name(lose.at(-1)!));
    // A click on another board's offer makes that board the current one.
    reply(el, lose[3]!).querySelector<HTMLElement>('[data-role="play-from-here"]')!.focus();
    expect(stops().map(label).slice(3)).toEqual([`offer ${lose[3]}`, lose[3]]);
  });

  it('a tap on a board opens its offer and closes the one open before', async () => {
    const el = await mount();
    const [a, b] = [reply(el, 'a3-1-b3'), reply(el, 'b3-2-b1')];
    a.querySelector<HTMLElement>('.shot')!.click();
    expect(a.hasAttribute('data-open')).toBe(true);
    b.querySelector<HTMLElement>('.shot')!.click();
    expect(a.hasAttribute('data-open')).toBe(false);
    expect(b.hasAttribute('data-open')).toBe(true);
    b.querySelector<HTMLElement>('.shot')!.click();
    expect(b.hasAttribute('data-open')).toBe(false);
  });

  it('nothing else is interactive: no transport, no list, no playable board', async () => {
    const el = await mount();
    expect($$(el, 'button').every((b) => b.dataset.role === 'play-from-here')).toBe(true);
    expect(el.shadowRoot!.querySelector('.controls, [role="radiogroup"], .cell-button')).toBeNull();
  });

  it('the boards wait off screen, land in reading order once on screen, and are all there at rest', async () => {
    PogoOpenings.deps = { ...PogoOpenings.deps, Observer: IntersectionObserverMock as unknown as typeof IntersectionObserver };
    const el = await mount();
    const root = $(el, '.openings');
    expect(root.hasAttribute('data-wait')).toBe(true);
    const io = observersOf(root)[0]!;
    io.fire(root, false);
    expect(root.hasAttribute('data-wait')).toBe(true);
    io.fire(root);
    expect(root.hasAttribute('data-wait')).toBe(false);
    expect(root.hasAttribute('data-land')).toBe(true);
    // Reading order: the position, the two framed boards, then the fourteen.
    const order = $$(el, '.card').map((c) => Number(c.style.getPropertyValue('--k')));
    expect(order).toEqual(order.map((_, k) => k));
    expect(order).toHaveLength(17);
    expect(observersOf(root)).toHaveLength(0);
  });

  it('under reduced motion nothing waits and nothing lands', async () => {
    const el = await mount('fr', true);
    const root = $(el, '.openings');
    expect(root.hasAttribute('data-wait')).toBe(false);
    expect(observersOf(root)).toHaveLength(0);
  });

  it('a table whose replies disagree with legal() shows the fallback', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = JSON.parse(JSON.stringify(table)) as TableData;
    broken.replies['c1-1-b1']!.pop();
    PogoOpenings.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(broken) };
    const el = await mount();
    expect(el.hasAttribute('data-failed')).toBe(true);
    error.mockRestore();
  });

  it('stops watching once disconnected', async () => {
    const el = await mount();
    const root = $(el, '.openings');
    expect(observersOf(root)).toHaveLength(1);
    el.parentElement!.removeChild(el);
    expect(observersOf(root)).toHaveLength(0);
  });
});
