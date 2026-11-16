import { afterEach, describe, expect, it } from 'vitest';
import { intersect, resetMedia } from '../test-dom';
import { PogoMoves } from './pogo-moves';

if (!customElements.get('pogo-moves')) customElements.define('pogo-moves', PogoMoves);
PogoMoves.deps = { engine: () => Promise.resolve() };

async function mount(view: string, lang = 'fr'): Promise<PogoMoves> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-moves') as PogoMoves;
  el.setAttribute('view', view);
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const $ = (el: PogoMoves, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const cell = (el: PogoMoves, i: number) => $(el, `.cell-button[data-cell="${i}"]`) as HTMLButtonElement;
const marks = (el: PogoMoves, kind: string) =>
  [...el.shadowRoot!.querySelectorAll(`.board .mark.${kind}`)].map((m) => Number(m.getAttribute('data-cell'))).sort();
const shownCounts = (el: PogoMoves) =>
  [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.counts .choice')].filter((b) => !b.hidden).map((b) => b.textContent);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-moves view="start">', () => {
  it('draws the start position with its description, a key, and nothing to press', async () => {
    const el = await mount('start');
    expect($(el, 'svg.board title').textContent).toContain('a1, b1 et c1');
    expect(el.shadowRoot!.querySelectorAll('.board .disc')).toHaveLength(12 + 2);
    expect(el.shadowRoot!.querySelectorAll('button')).toHaveLength(0);
    expect($(el, '.legend').textContent).toBe('BlancRouge');
  });
});

describe('<pogo-moves view="moves">', () => {
  it('names the game it plays in its label; the start position names none', async () => {
    expect($(await mount('moves'), '.fidelity').textContent).toBe('Calcul en direct · jeu sans règle d’arrêt');
    expect($(await mount('start'), '.fidelity').textContent).toBe('Calcul en direct');
  });

  it('lifting a1 shows its one-piece cells, then its two-piece cells', async () => {
    const el = await mount('moves');
    expect(marks(el, 'target')).toEqual([0, 1, 2]);
    expect($(el, '.line').textContent).toBe('Touchez une pile au sommet blanc.');
    cell(el, 0).click();
    expect(marks(el, 'picked')).toEqual([0]);
    expect(marks(el, 'target')).toEqual([1, 3]);
    expect(shownCounts(el)).toEqual(['1', '2']);
    expect($(el, '.line').textContent).toBe('a1, 1 pièce : b1, a2');
    (el.shadowRoot!.querySelector('.counts .choice[data-value="2"]') as HTMLButtonElement).click();
    expect(marks(el, 'target')).toEqual([2, 4, 6]);
  });

  it('a tap on a destination plays it; the other side moves next; three pieces appear', async () => {
    const el = await mount('moves', 'en');
    cell(el, 0).click();
    cell(el, 1).click();
    expect($(el, '.line').textContent).toBe('White plays a1-1-b1. Tap a stack with Red on top.');
    expect(marks(el, 'target')).toEqual([6, 7, 8]);
    cell(el, 6).click();
    cell(el, 3).click();
    cell(el, 1).click();
    expect(shownCounts(el)).toEqual(['1', '2', '3']);
    // « Restart » goes back to the start position.
    (el.shadowRoot!.querySelector('.controls .control') as HTMLButtonElement).click();
    expect(marks(el, 'target')).toEqual([0, 1, 2]);
    expect(el.shadowRoot!.querySelectorAll('.board .to')).toHaveLength(0);
  });
});
