import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReachData } from '../data';
import { intersect, resetMedia } from '../test-dom';
import { PogoReach } from './pogo-reach';

if (!customElements.get('pogo-reach')) customElements.define('pogo-reach', PogoReach);
const reach = JSON.parse(readFileSync('public/data/reach.json', 'utf8')) as ReachData;
const NNBSP = ' ';

async function mount(lang: string): Promise<PogoReach> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-reach') as PogoReach;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const $ = (el: PogoReach, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoReach, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];

beforeEach(() => {
  PogoReach.deps = { reach: () => Promise.resolve(reach) };
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-reach>', () => {
  it('is a table of the sixteen moves, every number written as text in the reader’s language', async () => {
    const fr = await mount('fr');
    expect($$(fr, 'tbody th').map((n) => n.textContent)).toEqual([...Array(16).keys()].map(String));
    const values = $$(fr, 'tbody .value').map((n) => n.textContent);
    expect(values[0]).toBe('1');
    expect(values[10]).toBe(`68${NNBSP}847${NNBSP}740`);
    expect(values[15]).toBe(`2${NNBSP}460`);
    expect($(fr, 'thead .ply').textContent).toBe('Coup');
    const en = await mount('en');
    expect($$(en, 'tbody .value').map((n) => n.textContent)[10]).toBe('68,847,740');
    expect($(en, 'caption').textContent).toBe('Positions first seen at each move');
    expect($(en, '.total').textContent).toBe('230,015,628reachable positions of 232,792,560 possible');
  });

  it('draws each bar at its share of the largest, hidden from assistive tech, and says the scale is linear', async () => {
    const el = await mount('en');
    const widths = $$(el, '.bar').map((b) => parseFloat(b.style.width));
    expect(widths[10]).toBe(100);
    expect(widths[9]).toBeCloseTo((50327416 / 68847740) * 100, 3);
    expect($$(el, '.track').every((t) => t.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect($(el, '.scale').textContent).toContain('Linear scale');
  });

  it('keeps the digit groups of the summary’s second number apart in the label cut', async () => {
    const el = await mount('fr');
    expect($$(el, '.what .sep')).toHaveLength(2);
    const css = readFileSync('src/elements/pogo-reach.css', 'utf8');
    expect(css).toMatch(/\.what \.sep \{\s*padding-inline: 0\.12em;/);
  });

  it('names reach.json’s own source and game A in its label', async () => {
    const el = await mount('fr');
    expect($(el, '.fidelity').textContent).toBe(
      `Données mesurées · jeu sans règle d’arrêt · source${NNBSP}: docs/experiments/v3-solve/reach.json`,
    );
    // A path this long breaks after a slash at 280px, and nowhere else.
    expect($$(el, '.fidelity .source .segment').map((s) => s.textContent)).toEqual([
      'docs/',
      'experiments/',
      'v3-solve/',
      'reach.json',
    ]);
  });

  it('a file that does not add up shows the fallback, not a wrong chart', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    PogoReach.deps = { reach: () => Promise.resolve({ ...reach, reachable: 1 }) };
    const el = await mount('fr');
    expect(el.hasAttribute('data-failed')).toBe(true);
    expect(el.shadowRoot!.querySelector('slot')!.hidden).toBe(false);
    error.mockRestore();
  });
});
