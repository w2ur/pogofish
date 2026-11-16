import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableData } from '../data';
import { precisionsOf, intersect, resetMedia, shownText } from '../test-dom';
import { PogoRetrograde } from './pogo-retrograde';

if (!customElements.get('pogo-retrograde')) customElements.define('pogo-retrograde', PogoRetrograde);
const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;

async function mount(lang: string): Promise<PogoRetrograde> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-retrograde') as PogoRetrograde;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const $ = (el: PogoRetrograde, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoRetrograde, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const shown = (el: PogoRetrograde) => $$(el, '.step').map((s) => !s.hasAttribute('data-off'));

beforeEach(() => {
  PogoRetrograde.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(table) };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-retrograde>', () => {
  it('steps lost 0 → won 1 → lost 2, each band keeping its room before its turn', async () => {
    const el = await mount('fr');
    expect($$(el, '.head').map((h) => h.textContent)).toEqual(['Perdue en 0', 'Gagnée en 1', 'Perdue en 2']);
    expect(shown(el)).toEqual([true, false, false]);
    expect($(el, '[role="status"]').textContent).toContain('Perdue en 0');
    $(el, '[data-role="next"]').click();
    expect(shown(el)).toEqual([true, true, false]);
    $(el, '[data-role="next"]').click();
    expect(shown(el)).toEqual([true, true, true]);
    expect($(el, '[role="status"]').textContent).toBe(
      'Perdue en 2. Tous les coups mènent à une position gagnée en 1 pour l’adversaire.',
    );
  });

  it('names each move and the position it leads to under its board, the name explained; the title names the position', async () => {
    const el = await mount('en');
    const drawn = (c: Element): string => {
      const copy = c.cloneNode(true) as Element;
      for (const x of copy.querySelectorAll('.move-tip, .sr')) x.replaceWith();
      return copy.textContent ?? '';
    };
    const captions = $$(el, '.caption');
    expect(drawn(captions[0]!)).toBe('A · White to move');
    expect(drawn(captions[4]!)).toBe('E · White to moveWhite plays c1-1-b1 → CWhite plays c1-1-c2 → D');
    // Read, the caption says where the move leads, not the arrow.
    expect(captions[4]!.hasAttribute('aria-hidden')).toBe(false);
    expect([...captions[4]!.querySelectorAll('.sr')].map((x) => x.textContent)).toEqual([', leads to position C', ', leads to position D']);
    expect([...captions[4]!.querySelectorAll('.move-name [role="tooltip"]')].map((x) => x.textContent)).toEqual([
      'From c1, 1 piece, to b1.',
      'From c1, 1 piece, to c2.',
    ]);
    const title = $$(el, 'svg.board title')[4]!.textContent;
    expect(title).toBe('Position E, lost in 2: White to move.');
    // The lifted stack is ringed and both destinations dashed.
    const lost2 = $$(el, 'svg.board')[4]!;
    expect([...lost2.querySelectorAll('.mark.picked')].map((m) => m.getAttribute('data-cell'))).toEqual(['2']);
    expect([...lost2.querySelectorAll('.mark.target')].map((m) => m.getAttribute('data-cell'))).toEqual(['1', '5']);
  });

  it('cites the table on its host, and says in « Précisions » that the positions are examples, under game A', async () => {
    const el = await mount('en');
    expect(el.dataset.source).toBe('v3-solve/table.bin');
    expect(precisionsOf(el)).toEqual([
      'Measured before publication: these numbers do not change when you play.',
      'Here the game has no stopping rule: a game may never end.',
      'The positions shown are examples: at each step, the analysis marks every position concerned, not only these.',
    ]);
  });

  it('a step file that breaks the analysis shows the fallback', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = JSON.parse(JSON.stringify(table)) as TableData;
    broken.retro[2]!.positions[0]!.moves!.pop();
    PogoRetrograde.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(broken) };
    const el = await mount('fr');
    expect(el.hasAttribute('data-failed')).toBe(true);
    error.mockRestore();
  });

  it('an aborted signal stops a running stepper', async () => {
    const el = await mount('fr');
    vi.useFakeTimers();
    $(el, '[data-role="play"]').click();
    const bands = $$(el, '.step');
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(10_000);
    expect(bands.map((s) => !s.hasAttribute('data-off'))).toEqual([true, false, false]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
