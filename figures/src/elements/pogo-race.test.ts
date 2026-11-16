import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Data } from '../data';
import { formatDate } from '../kit/date';
import { formatScore, formatShare } from '../kit/score';
import { precisionsOf, intersect, resetMedia } from '../test-dom';
import { PogoRace } from './pogo-race';
import { RACE_PROGRAMS } from './race-chart';

if (!customElements.get('pogo-race')) customElements.define('pogo-race', PogoRace);
const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(lang = 'fr'): Promise<PogoRace> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-race') as PogoRace;
  el.innerHTML = '<p>fallback</p><p>https://youtu.be/ARDa8YljkWE</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: PogoRace, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoRace, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];

beforeEach(() => {
  PogoRace.deps = { v5: () => Promise.resolve(v5) };
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-race>', () => {
  it('is measured under lc1-2, citing the data’s own source, and prints the data’s date', async () => {
    const en = await mount('en');
    expect(en.dataset.source).toBe(v5.source);
    expect(precisionsOf(en).slice(0, 2)).toEqual([`Measured before publication: these numbers do not change when you play. Data as of ${formatDate('en', v5.asOf)}.`, 'Here, the player who repeats a position a third time loses the game.']);
    expect(en.shadowRoot!.querySelector('.as-of')).toBeNull();
    const fr = await mount('fr');
    expect(precisionsOf(fr)[0]).toContain('Données arrêtées le 11 novembre 2026.');
  });

  it('names the file it asks for until the data loads, and for good when the load fails', async () => {
    let fail!: (e: Error) => void;
    PogoRace.deps = { v5: () => new Promise((_, reject) => (fail = reject)) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const el = await mount('en');
      expect(el.dataset.source).toBe('data/v5.json');
      fail(new Error('503'));
      await flush();
      expect(el.hasAttribute('data-failed')).toBe(true);
      expect(el.dataset.source).toBe('data/v5.json');
      expect(precisionsOf(el)[0]).toBe('Measured before publication: these numbers do not change when you play.');
      // The fallback, with its link to the video, is still there and shown.
      expect(el.querySelectorAll('p')).toHaveLength(2);
    } finally {
      error.mockRestore();
    }
  });

  it('every value is in a table, as the kit prints a score', async () => {
    for (const lang of ['fr', 'en'] as const) {
      const el = await mount(lang);
      for (const program of RACE_PROGRAMS) {
        const rows = $$(el, `.table-${program} tbody tr`);
        const stages = v5.programs[program].stages;
        expect(rows).toHaveLength(stages.length);
        rows.forEach((row, i) => {
          const cells = [...row.children].map((c) => c.textContent);
          expect(cells[1]).toBe(new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB').format(stages[i]!.gamesTrained));
          expect(cells[2]).toBe(formatScore(lang, stages[i]!));
        });
      }
      const refs = $$(el, '.table-refs tbody td').map((c) => c.textContent);
      expect(refs).toEqual(['table', 'greedy', 'random'].map((k) => formatScore(lang, v5.references[k as 'table'])));
    }
  });

  it('plots one marker per stage, stage 0 in the zero column, the drawing hidden from assistive tech', async () => {
    const el = await mount('en');
    expect($(el, '.plot').getAttribute('aria-hidden')).toBe('true');
    expect($$(el, '.zero .mark')).toHaveLength(RACE_PROGRAMS.length);
    expect($$(el, '.log .mark')).toHaveLength(RACE_PROGRAMS.reduce((n, p) => n + v5.programs[p].stages.length - 1, 0));
    expect($$(el, '.log .run')).toHaveLength(RACE_PROGRAMS.length);
    // Every name is direct: one per program at its line's end, one per reference.
    expect($$(el, '.log .name').map((n) => n.textContent)).toEqual(
      expect.arrayContaining(['AlphaZero with search', 'AlphaZero, no search', 'TD(λ)', 'Q-learning', 'exact table', 'greedy', 'random']),
    );
    expect($$(el, '.log-axis .tick').map((n) => n.textContent)).toEqual(['100', '1,000', '10,000', '100,000', '1,000,000']);
  });

  it('says in words where each program first passes greedy, from the data', async () => {
    const fr = await mount('fr');
    const said = $$(fr, '.pass').map((li) => li.textContent);
    expect(said).toEqual([
      'AlphaZero, 100 simulations : au-dessus du glouton dès 500 parties.',
      'AlphaZero sans recherche : au-dessus du glouton dès 5 000 parties.',
      'TD(λ) : au-dessus du glouton dès 1 000 parties.',
      `Q-learning : jamais au-dessus du glouton en 5 000 000 parties (${formatShare('fr', v5.programs.qtab.stages[7]!.score)} à la fin).`,
    ]);
    // The rule that decides it is in « Précisions », with greedy's own score.
    expect(precisionsOf(fr).at(-1)).toBe(
      `«\u00a0Au-dessus du glouton\u00a0»\u202f: la première étape mesurée dont tout l’intervalle à 95\u202f% dépasse le score du glouton contre lui-même, ${formatShare('fr', v5.references.greedy.score)}.`,
    );
    expect(fr.shadowRoot!.querySelector('.rule')).toBeNull();
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
    const css = readFileSync('src/elements/pogo-race.css', 'utf8');
    expect(css).not.toMatch(/animation|transition|@keyframes/);
  });
});
