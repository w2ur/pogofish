import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableData } from '../data';
import { initial, key, play } from '../engine';
import type { PlayFromDetail } from '../kit/figure';
import { intersect, resetMedia, shownText } from '../test-dom';
import { PogoOpenings } from './pogo-openings';

if (!customElements.get('pogo-openings')) customElements.define('pogo-openings', PogoOpenings);
const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
const NNBSP = ' ';

async function mount(lang = 'fr'): Promise<PogoOpenings> {
  resetMedia();
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
const cell = (el: PogoOpenings, i: number) => $(el, `.cell-button[data-cell="${i}"]`) as HTMLButtonElement;
const item = (el: PogoOpenings, name: string) => $(el, `.list .choice[data-value="${name}"]`) as HTMLButtonElement;
const readout = (el: PogoOpenings) => shownText($(el, '.readout .line'));
const head = (el: PogoOpenings) => $(el, '.head .line').textContent;
const level = (el: PogoOpenings) => $(el, '[data-role="level"]') as HTMLButtonElement;

beforeEach(() => {
  PogoOpenings.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(table) };
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-openings>', () => {
  it('lists the sixteen openings with each verdict in words, the six draws counted in its head', async () => {
    const el = await mount();
    expect(head(el)).toBe('Premiers coups des Blancs · 6 gardent la nulle, 10 perdent');
    const items = $$(el, '.list .choice');
    expect(items).toHaveLength(16);
    expect(shownText(item(el, 'a1-1-b1'))).toBe('a1-1-b1, garde la nulle');
    expect(shownText(item(el, 'a1-2-b2'))).toBe('a1-2-b2, perd en 12');
    expect($$(el, '.list .verdict[data-holds]')).toHaveLength(6);
    expect(level(el).disabled).toBe(true);
    expect(readout(el)).toBe('Touchez une pile, ou choisissez un coup dans la liste.');
  });

  it('each row carries its move’s explanation as its own tooltip, nothing focusable nested; hovering marks the move on the board', async () => {
    const el = await mount();
    const row = item(el, 'b1-2-b3');
    const tip = el.shadowRoot!.getElementById(row.getAttribute('aria-describedby')!.split(' ').at(-1)!)!;
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.textContent).toBe('De b1, 2 pièces, vers b3.');
    expect(row.contains(tip)).toBe(true);
    expect(row.querySelectorAll('[tabindex], button')).toHaveLength(0);
    row.dispatchEvent(new PointerEvent('pointerenter'));
    expect(tip.hasAttribute('data-open')).toBe(true);
    expect($(el, '.board .mark.picked').getAttribute('data-cell')).toBe('1');
    expect($$(el, '.board .mark.target').map((m) => m.getAttribute('data-cell'))).toEqual(['7']);
    row.dispatchEvent(new PointerEvent('pointerleave'));
    expect(tip.hasAttribute('data-open')).toBe(false);
    expect(el.shadowRoot!.querySelector('.board .mark.picked')).toBeNull();
  });

  it('a move chosen in the list is read out and marked on the board', async () => {
    const el = await mount();
    item(el, 'b1-1-b2').click();
    expect(readout(el)).toBe(`Blanc joue b1-1-b2${NNBSP}: perd en 16`);
    expect(item(el, 'b1-1-b2').getAttribute('aria-checked')).toBe('true');
    expect($(el, '.board .mark.picked').getAttribute('data-cell')).toBe('1');
    expect($(el, '.board .to').getAttribute('data-cell')).toBe('4');
  });

  it('chooses an opening on the board itself: a stack, its count, a destination', async () => {
    const el = await mount('en');
    cell(el, 2).click();
    expect(readout(el)).toBe('c1, 1\u00a0piece: b1, c2');
    cell(el, 1).click();
    expect(readout(el)).toBe('White plays c1-1-b1: holds the draw');
    expect(item(el, 'c1-1-b1').getAttribute('aria-checked')).toBe('true');
  });

  it('moves between cells with the arrow keys, one tab stop on the board', async () => {
    const el = await mount();
    const tabStops = () => $$(el, '.cell-button').filter((b) => b.tabIndex === 0).map((b) => b.dataset.cell);
    expect(tabStops()).toEqual(['0']);
    cell(el, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabStops()).toEqual(['1']);
  });

  it('after c1-1-b1, lists Red’s sixteen replies, two of which keep the draw', async () => {
    const el = await mount();
    item(el, 'c1-1-b1').click();
    level(el).click();
    expect(head(el)).toBe('Réponses des Rouges à c1-1-b1 · 2 gardent la nulle, 14 perdent');
    expect($$(el, '.list .choice')).toHaveLength(16);
    expect($$(el, '.list .verdict[data-holds]')).toHaveLength(2);
    // The board is now the position after the opening, Red to move.
    expect($$(el, '.board .mark.target').map((m) => m.getAttribute('data-cell')).sort()).toEqual(['6', '7', '8']);
  });

  it('after b1-2-b3, heads Red’s ten replies with its two wins, set heavier as moves that do not lose', async () => {
    const el = await mount('en');
    item(el, 'b1-2-b3').click();
    level(el).click();
    expect(head(el)).toBe('Red’s replies to b1-2-b3 · 2 win, 8 lose');
    expect($$(el, '.list .choice')).toHaveLength(10);
    expect($$(el, '.list .verdict[data-holds]').map((v) => v.textContent)).toEqual(['wins in 13', 'wins in 13']);
    level(el).click();
    expect(head(el)).toBe('White’s first moves · 6 hold the draw, 10 lose');
    expect(item(el, 'b1-2-b3').getAttribute('aria-checked')).toBe('true');
  });

  it('« Jouer d’ici » hands the position after the chosen moves to the board', async () => {
    const el = await mount();
    const got: PlayFromDetail[] = [];
    const listen = (e: Event) => got.push((e as CustomEvent<PlayFromDetail>).detail);
    document.addEventListener('pogo:playfrom', listen);
    try {
      item(el, 'a1-1-b1').click();
      level(el).click();
      item(el, 'a3-1-b3').click();
      $(el, '[data-role="play-from-here"]').click();
      expect(got).toHaveLength(1);
      expect(got[0]!.label).toBe('les premiers coups, a1-1-b1 a3-1-b3');
      expect(key(got[0]!.state)).toBe(key(play(play(initial(), [0, 1, 1]), [6, 1, 7])));
    } finally {
      document.removeEventListener('pogo:playfrom', listen);
    }
  });

  it('names the table and game A in its label', async () => {
    const el = await mount('en');
    expect($(el, '.fidelity').textContent).toBe('Measured data · game with no stopping rule · source: v3-solve/table.bin');
  });

  it('a table whose replies disagree with legal() shows the fallback', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = JSON.parse(JSON.stringify(table)) as TableData;
    broken.replies['a1-1-b1']!.pop();
    PogoOpenings.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(broken) };
    const el = await mount();
    expect(el.hasAttribute('data-failed')).toBe(true);
    error.mockRestore();
  });

  it('stops listening once disconnected', async () => {
    const el = await mount();
    const button = item(el, 'a1-1-b1');
    const line = $(el, '.readout .line');
    el.parentElement!.removeChild(el);
    button.click();
    expect(line.textContent).toBe('Touchez une pile, ou choisissez un coup dans la liste.');
  });
});
