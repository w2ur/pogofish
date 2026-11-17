import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Data } from '../data';
import { formatScore, formatShare } from '../kit/score';
import { intersect, leave, playState, REDUCED_MOTION, resetMedia, setMedia } from '../test-dom';
import { PogoRace, RACE_MS, raceHold } from './pogo-race';
import { RACE_PROGRAMS, raceChart, raceEvents } from './race-chart';

if (!customElements.get('pogo-race')) customElements.define('pogo-race', PogoRace);
const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(lang = 'fr', reduced = false): Promise<PogoRace> {
  resetMedia();
  setMedia(REDUCED_MOTION, reduced);
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

/** As mount, with fake timers already on. */
async function mountFake(lang: string): Promise<PogoRace> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-race') as PogoRace;
  section.append(el);
  document.body.append(section);
  intersect(el);
  await vi.advanceTimersByTimeAsync(0);
  return el;
}

const $ = (el: PogoRace, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoRace, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const key = (el: PogoRace, k: string): void => void $(el, '.scrub').dispatchEvent(new KeyboardEvent('keydown', { key: k }));
const said = (el: PogoRace): string[] => $$(el, '.pass').filter((li) => !li.hasAttribute('data-off')).map((li) => li.className);

beforeEach(() => {
  PogoRace.deps = { v5: () => Promise.resolve(v5) };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-race>', () => {
  it('says what a vertical stroke is under the chart, and nothing about the 0 column: its own label says it', async () => {
    const en = await mount('en');
    const notes = $$(en, '.race > .axis-note').map((p) => p.textContent);
    expect(notes).toEqual([
      'Horizontal axis: training games, each mark ten times the one before.',
      'The vertical stroke right of each point is its 95% confidence interval: the shorter it is, the more precise the measure.',
    ]);
    expect(en.shadowRoot!.textContent).not.toMatch(/has no place/);
    expect(en.shadowRoot!.querySelector('.as-of')).toBeNull();
    const fr = await mount('fr');
    expect(fr.shadowRoot!.textContent).not.toMatch(/n’a pas de place/);
  });

  it('names the column of the points before training under it, in words, never as a 0 on the axis', async () => {
    const fr = await mount('fr');
    expect($$(fr, '.zero-axis .tick').map((n) => n.textContent)).toEqual(['avant l’entraînement']);
    const en = await mount('en');
    expect($$(en, '.zero-axis .tick').map((n) => n.textContent)).toEqual(['before training']);
  });

  it('draws every point’s 95 % interval as a capped stroke beside its marker, in ink, from its data', async () => {
    const el = await mount('en');
    const chart = raceChart(v5);
    const bars = (sel: string) => $$(el, sel).map((b) => [b.style.left, b.style.top, b.style.height]);
    const want = (column: 'zero' | 'log') =>
      chart.series
        .flatMap((s) => s.points.filter((p) => p.column === column))
        .map((p) => [`${(p.x * 100).toFixed(3)}%`, `${((1 - p.hi) * 100).toFixed(3)}%`, `${((p.hi - p.lo) * 100).toFixed(3)}%`]);
    // Same points, any drawing order.
    expect(bars('.zero .marks .ci').sort()).toEqual(want('zero').sort());
    expect(bars('.log .ink .ci').sort()).toEqual(want('log').sort());
    // No interval left in the stretched SVG, where it hid under its marker in the muted tint.
    expect(el.shadowRoot!.querySelector('svg .ci')).toBeNull();
    const css = readFileSync('src/elements/pogo-race.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\n\.ci \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/border-left: [^;]*var\(--_ink\)/);
    // Beside the marker (half its width and a gap), never under it.
    expect(rule).toMatch(/transform: translateX\(\d+px\)/);
    // Its two caps.
    expect(css).toMatch(/\.ci::before,\s*\.ci::after \{[^}]*border-top: [^;]*var\(--_ink\)/);
  });

  it('shows its fallback when the data load fails', async () => {
    let fail!: (e: Error) => void;
    PogoRace.deps = { v5: () => new Promise((_, reject) => (fail = reject)) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const el = await mount('en');
      fail(new Error('503'));
      await flush();
      expect(el.hasAttribute('data-failed')).toBe(true);
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
    for (const part of $$(el, '.plot > :not(.scrub)')) expect(part.getAttribute('aria-hidden')).toBe('true');
    expect($$(el, '.zero .mark')).toHaveLength(RACE_PROGRAMS.length);
    expect($$(el, '.log .ink .mark')).toHaveLength(RACE_PROGRAMS.reduce((n, p) => n + v5.programs[p].stages.length - 1, 0));
    expect($$(el, '.log .run')).toHaveLength(RACE_PROGRAMS.length);
    // Every name is direct: one riding each program's line, one per reference.
    expect($$(el, '.log .ref-name').map((n) => n.textContent)).toEqual(['exact table', 'greedy', 'random']);
    expect($$(el, '.log .head-name').map((n) => n.firstChild!.textContent)).toEqual([
      'AlphaZero with search',
      'AlphaZero, no search',
      'TD(λ)',
      'Q-learning',
    ]);
    expect($$(el, '.log-axis .tick').map((n) => n.textContent)).toEqual(['100', '1,000', '10,000', '100,000', '1,000,000']);
  });

  it('says in words where each program first passes greedy, from the data, in the order it happens', async () => {
    const fr = await mount('fr');
    expect($$(fr, '.pass').map((li) => li.textContent)).toEqual([
      'AlphaZero, 100 simulations\u202f: au-dessus du glouton dès 500 parties.',
      'TD(λ)\u202f: au-dessus du glouton dès 1\u202f000 parties.',
      'AlphaZero sans recherche\u202f: au-dessus du glouton dès 5\u202f000 parties.',
      `Q-learning\u202f: jamais au-dessus du glouton en 5\u202f000\u202f000 parties (${formatShare('fr', v5.programs.qtab.stages[7]!.score)} à la fin).`,
    ]);
    expect(fr.shadowRoot!.querySelector('.rule')).toBeNull();
  });

  it('at rest, the finished chart: every crossing and every sentence, the clock at the end', async () => {
    const el = await mount('fr');
    expect(said(el)).toHaveLength(4);
    expect($$(el, '.cross').every((f) => !f.hasAttribute('data-off'))).toBe(true);
    expect($$(el, '.cross')).toHaveLength(3);
    expect($(el, '[data-role="counter"]').textContent).toBe('5\u202f000\u202f000 parties');
    expect($(el, '.ink').style.clipPath).toContain('calc(4.000% - 14px)');
  });

  it('runs once on screen: the clock sweeps at one speed, each sentence landing when its crossing is reached', async () => {
    vi.useFakeTimers();
    const el = await mountFake('fr');
    intersect(el);
    expect(playState(el)).toBe('pause');
    expect($(el, '[data-role="counter"]').textContent).toBe('avant l’entraînement');
    expect(said(el)).toHaveLength(0);
    const events = raceEvents(raceChart(v5));
    const landedAt: Record<string, number> = {};
    let elapsed = 0;
    for (let i = 0; i < events.length - 1; i++) {
      // While it runs, the clock heads for the next stop, over the time that stop is away.
      expect($(el, '.race').style.getPropertyValue('--_t')).toBe(`${raceHold(events, i)}ms`);
      vi.advanceTimersByTime(raceHold(events, i));
      elapsed += raceHold(events, i);
      for (const c of said(el)) landedAt[c] ??= events[i + 1]!.games;
    }
    expect(landedAt).toEqual({ 'pass pass-az100': 500, 'pass pass-td': 1000, 'pass pass-az0': 5000, 'pass pass-qtab': 5_000_000 });
    expect(elapsed).toBeGreaterThanOrEqual(15_000);
    expect(elapsed).toBeLessThanOrEqual(20_000);
    expect(Math.abs(elapsed - RACE_MS)).toBeLessThan(20);
    expect(playState(el)).toBe('replay');
  });

  it('a head’s value is its program’s last measured stage reached, and a head waits for its program’s first stage', async () => {
    const el = await mount('fr');
    const az = $(el, '.head-name.name-az100');
    const td = $(el, '.head-name.name-td');
    key(el, 'Home');
    expect(az.hasAttribute('data-off')).toBe(true);
    key(el, 'ArrowRight');
    expect($(el, '[data-role="counter"]').textContent).toBe('100 parties');
    expect(az.hasAttribute('data-off')).toBe(false);
    expect(az.querySelector('.head-value')!.textContent).toBe(formatShare('fr', v5.programs.az100.stages[1]!.score));
    expect(td.hasAttribute('data-off')).toBe(true);
    key(el, 'ArrowRight');
    key(el, 'ArrowRight');
    expect($(el, '[data-role="counter"]').textContent).toBe('500 parties');
    expect(td.hasAttribute('data-off')).toBe(false);
    expect(td.querySelector('.head-value')!.textContent).toBe(formatShare('fr', v5.programs.td.stages[1]!.score));
    expect($(el, '.scrub').getAttribute('aria-valuetext')).toBe('500 parties');
    expect(said(el)).toEqual(['pass pass-az100']);
    key(el, 'End');
    expect($(el, '[data-role="counter"]').textContent).toBe('5\u202f000\u202f000 parties');
  });

  it('a reader’s key on the clock pauses the race, and the pause holds when the figure comes back', async () => {
    const el = await mount('fr');
    intersect(el);
    expect(playState(el)).toBe('pause');
    key(el, 'ArrowRight');
    expect(playState(el)).toBe('play');
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
  });

  it('under reduced motion, the finished chart, nothing starts, and nothing glides', async () => {
    const el = await mount('fr', true);
    intersect(el);
    expect(playState(el)).toBe('play');
    expect($(el, '[data-role="counter"]').textContent).toBe('5\u202f000\u202f000 parties');
    const css = readFileSync('src/elements/pogo-race.css', 'utf8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ink,\s*\.clock,\s*\.heads \.head-name \{\s*transition: none;/);
  });
});
