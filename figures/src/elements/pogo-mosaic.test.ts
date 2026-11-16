import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Data } from '../data';
import { formatScore } from '../kit/score';
import { intersect, resetMedia } from '../test-dom';
import { mosaicStages } from './mosaic-grid';
import { PogoMosaic } from './pogo-mosaic';

if (!customElements.get('pogo-mosaic')) customElements.define('pogo-mosaic', PogoMosaic);
const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(lang = 'fr'): Promise<PogoMosaic> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-mosaic') as PogoMosaic;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: PogoMosaic, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoMosaic, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const choices = (el: PogoMosaic) => $$(el, '[role="radio"]') as HTMLButtonElement[];
/** Squares drawn in one path: one `M` per square. */
const count = (d: string | null) => (d ?? '').split('M').length - 1;

beforeEach(() => {
  PogoMosaic.deps = { v5: () => Promise.resolve(v5) };
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-mosaic>', () => {
  it('is measured under lc1-2, citing the data’s source and the mosaics’ directory, with the data’s date', async () => {
    const el = await mount('en');
    expect($(el, '.fidelity').textContent).toBe(
      `Measured data · repetition rule (lc1-2) · source: ${v5.source} · docs/experiments/v5/mosaic/`,
    );
    expect($(el, '.as-of').textContent).toBe('Data as of 11 November 2026');
  });

  it('names the file it asks for until the data loads, and for good when the load fails', async () => {
    let fail!: (e: Error) => void;
    PogoMosaic.deps = { v5: () => new Promise((_, reject) => (fail = reject)) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const el = await mount('en');
      const label = 'Measured data · repetition rule (lc1-2) · source: data/v5.json';
      expect($(el, '.fidelity').textContent).toBe(label);
      fail(new Error('503'));
      await flush();
      expect(el.hasAttribute('data-failed')).toBe(true);
      expect($(el, '.fidelity').textContent).toBe(label);
    } finally {
      error.mockRestore();
    }
  });

  it('mosaic has 100 squares per stage, won and lost as the data says, for each program picked', async () => {
    const el = await mount('fr');
    expect(choices(el).map((b) => b.dataset.value)).toEqual(['az100', 'td', 'qtab']);
    for (const [k, program] of (['az100', 'td', 'qtab'] as const).entries()) {
      choices(el)[k]!.click();
      expect(choices(el)[k]!.getAttribute('aria-checked')).toBe('true');
      const svgs = $$(el, '.stage-list .mosaic');
      expect(svgs).toHaveLength(v5.stagesPct.length);
      svgs.forEach((svg, i) => {
        const games = v5.mosaics[program][i]!.games;
        const won = count(svg.querySelector('.won')!.getAttribute('d'));
        const lost = count(svg.querySelector('.lost')!.getAttribute('d'));
        expect(won + lost, `${program} ${i}`).toBe(100);
        expect(won).toBe(games.filter((g) => g.result === 'win').length);
        const marks = count(svg.querySelector('.on-won')!.getAttribute('d')) + count(svg.querySelector('.on-lost')!.getAttribute('d'));
        expect(marks).toBe(games.filter((g) => g.mistakes > 0 || g.judged === 0).length);
        // One image per stage, its totals said; no focusable node per game.
        expect(svg.getAttribute('role')).toBe('img');
        expect(svg.querySelectorAll('[tabindex]')).toHaveLength(0);
      });
    }
  });

  it('writes each stage’s totals in words and in a table, summed from its games', async () => {
    const el = await mount('fr');
    const stages = mosaicStages(v5, 'az100');
    const items = $$(el, '.stage-item');
    expect(items[0]!.querySelector('.totals')!.textContent).toBe(
      '19 gagnées sur 100 · erreurs : 52,2 % des coups jugés (97 sur 186)',
    );
    expect(items[7]!.querySelector('.totals')!.textContent).toBe('90 gagnées sur 100 · erreurs : 1,5 % des coups jugés (7 sur 465)');
    expect(items[7]!.querySelector('.bench')!.textContent).toBe(`score au banc d’essai : ${formatScore('fr', stages[7]!)}`);
    const az7 = v5.mosaics.az100[7]!.games;
    const mistaken = az7.filter((g) => g.mistakes > 0).length;
    const none = az7.filter((g) => g.judged === 0).length;
    const games = `${mistaken} parties avec au moins une erreur · ${none} sans coup jugé`;
    expect(items[7]!.querySelector('.games-count')!.textContent).toBe(games);
    expect(items[7]!.querySelector('svg')!.getAttribute('aria-label')).toContain(games);
    expect(items[1]!.querySelector('.where')!.textContent).toBe('1 % · après 100 parties');
    const rows = $$(el, '.table tbody tr').map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toHaveLength(8);
    expect(rows[7]).toEqual(['100 %', '10 000', '90', '1,5 % (7 / 465)']);
  });

  it('says what each state of a square is, in words', async () => {
    const el = await mount('en');
    expect($$(el, '.legend li').map((li) => li.textContent)).toEqual([
      'won',
      'lost',
      'at least one mistake by the program',
      'no move judged (none played, or all played from a position already lost)',
    ]);
  });

  it('nothing moves: no animation, no transition, no timer', async () => {
    vi.useFakeTimers();
    try {
      const pending = mount('en');
      await vi.runAllTimersAsync();
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
    expect(readFileSync('src/elements/pogo-mosaic.css', 'utf8')).not.toMatch(/animation|transition|@keyframes/);
  });
});
