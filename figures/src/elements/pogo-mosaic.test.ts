import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Data } from '../data';
import { intersect, resetMedia, leave, playState } from '../test-dom';
import { MOSAIC_PROGRAMS, mosaicStages } from './mosaic-grid';
import { SWEEP_STEP_MS } from './mosaic-sweep';
import { formatShare } from '../kit/score';
import { REDUCED_MOTION, setMedia } from '../test-dom';
import { PogoMosaic } from './pogo-mosaic';

if (!customElements.get('pogo-mosaic')) customElements.define('pogo-mosaic', PogoMosaic);
const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;

const flush = () => new Promise((r) => setTimeout(r, 0));
const PROGRAMS = MOSAIC_PROGRAMS;

/** Mounts and brings it into view; the caller flushes (fake timers or not). */
function mountSync(lang: string): PogoMosaic {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-mosaic') as PogoMosaic;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  return el;
}

const sweptGrids = (el: PogoMosaic) => [...el.shadowRoot!.querySelectorAll<SVGSVGElement>('.sweep .swept')];
/** Each square's state as its class says it: "win mistake", "loss none-judged"… */
const stateOf = (svg: SVGSVGElement) => [...svg.children].map((g) => g.getAttribute('class')!.replace(/^sq /, '').replace('m-', ''));
const expected = (program: (typeof PROGRAMS)[number], k: number) => v5.mosaics[program][k]!.games.map((g) =>
  `${g.result} ${g.mistakes > 0 ? 'mistake' : g.judged > 0 ? 'clean' : 'none-judged'}`,
);

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
  it('starts by itself once half of it is on screen, pauses when it leaves, and resumes when it comes back', async () => {
    const el = await mount('fr');
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    leave(el);
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    el.remove();
  });

  it('a reader’s pause holds when it comes back on screen', async () => {
    const el = await mount('fr');
    intersect(el);
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-role="play"]')!.click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
    el.remove();
  });

  it('puts the transport right under the three grids it steps', async () => {
    const el = await mount('fr');
    const items = [...el.shadowRoot!.querySelectorAll('.sweep > .sweep-item')];
    expect(items).toHaveLength(3);
    expect(items[2]!.nextElementSibling!.classList.contains('controls')).toBe(true);
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
    expect(items[7]!.querySelector('.bench')!.textContent).toBe(`score sur toute la série\u202f: ${formatShare('fr', stages[7]!.score)}`);
    const az7 = v5.mosaics.az100[7]!.games;
    const mistaken = az7.filter((g) => g.mistakes > 0).length;
    const none = az7.filter((g) => g.judged === 0).length;
    const games = `${mistaken} parties avec au moins une erreur · ${none} sans coup jugé`;
    expect(items[7]!.querySelector('.games-count')!.textContent).toBe(games);
    expect(items[7]!.querySelector('svg')!.getAttribute('aria-label')).toContain(games);
    expect(items[1]!.querySelector('.where')!.textContent).toBe('1 % · après 100 parties');
    expect(items[0]!.querySelector('.where')!.textContent).toBe('0\u202f% · avant tout entraînement');
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
      'no move by the program judged',
    ]);
  });

  it('main view: three grids at stage 0, at rest, every square in its game’s state', async () => {
    vi.useFakeTimers();
    try {
      const el = mountSync('fr');
      await vi.advanceTimersByTimeAsync(0);
      const grids = sweptGrids(el);
      expect(grids).toHaveLength(3);
      expect($(el, '[data-role="counter"]').textContent).toBe('0\u202f%');
      expect($(el, '[data-role="play"]').hidden).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(grids.map((g) => g.closest('.sweep-item')!.querySelector('.cell .where:not([data-off])')!.textContent)).toEqual([
        'AlphaZero, 100 simulations · avant tout entraînement',
        'TD(λ) · avant tout entraînement',
        'Q-learning · avant tout entraînement',
      ]);
      PROGRAMS.forEach((program, i) => expect(stateOf(grids[i]!)).toEqual(expected(program, 0)));
      // Every stage's heading and totals are there already, one seen: a step never changes the height.
      for (const item of $$(el, '.sweep-item')) {
        expect(item.querySelectorAll('.cell .where')).toHaveLength(8);
        expect(item.querySelectorAll('.cell .totals')).toHaveLength(8);
        expect(item.querySelectorAll('.cell > :not([data-off])')).toHaveLength(2);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('a step sweeps the squares in game order, and the totals change in one go at the end', async () => {
    vi.useFakeTimers();
    try {
      const el = mountSync('fr');
      await vi.advanceTimersByTimeAsync(0);
      const grids = sweptGrids(el);
      const before = grids.map((g) => g.closest('.sweep-item')!.querySelector('.cell .totals:not([data-off])')!.textContent);
      ($(el, '[data-role="next"]') as HTMLButtonElement).click();
      PROGRAMS.forEach((program, i) => {
        expect(stateOf(grids[i]!)).toEqual(expected(program, 1));
        // Each changed square waits for its place in the order of the games.
        const squares = [...grids[i]!.children] as SVGGElement[];
        const from = expected(program, 0);
        const to = expected(program, 1);
        to.forEach((s, k) => {
          if (s !== from[k]) expect(squares[k]!.style.getPropertyValue('--d')).toBe(`${k * SWEEP_STEP_MS}ms`);
        });
      });
      expect(grids[0]!.closest('.sweep-item')!.querySelector('.cell .where:not([data-off])')!.textContent).toBe('AlphaZero, 100 simulations · après 100 parties');
      await vi.advanceTimersByTimeAsync(SWEEP_STEP_MS * 50);
      expect(grids.map((g) => g.closest('.sweep-item')!.querySelector('.cell .totals:not([data-off])')!.textContent)).toEqual(before);
      await vi.advanceTimersByTimeAsync(SWEEP_STEP_MS * 50);
      const s1 = mosaicStages(v5, 'az100')[1]!;
      expect(grids[0]!.closest('.sweep-item')!.querySelector('.cell .totals:not([data-off])')!.textContent).toBe(
        `${s1.wins} gagnées sur 100 · erreurs\u202f: ${formatShare('fr', s1.share)} des coups jugés (${s1.mistakes} sur ${s1.judged})`,
      );
      // The sweep is over: no square keeps its delay, so a later theme change recolours at once.
      for (const g of grids) for (const sq of [...g.children] as SVGGElement[]) expect(sq.style.getPropertyValue('--d')).toBe('');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a step during a sweep cancels it: the target stage exactly, one totals timer', async () => {
    vi.useFakeTimers();
    try {
      const el = mountSync('en');
      await vi.advanceTimersByTimeAsync(0);
      const next = $(el, '[data-role="next"]') as HTMLButtonElement;
      next.click();
      await vi.advanceTimersByTimeAsync(100);
      next.click();
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      const grids = sweptGrids(el);
      PROGRAMS.forEach((program, i) => {
        expect(stateOf(grids[i]!)).toEqual(expected(program, 2));
        const s = mosaicStages(v5, program)[2]!;
        expect(grids[i]!.closest('.sweep-item')!.querySelector('.cell .totals:not([data-off]) strong')!.textContent).toBe(`${s.wins} won of 100`);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays the eight stages to the end, then stops; disconnecting stops it', async () => {
    vi.useFakeTimers();
    try {
      const el = mountSync('en');
      await vi.advanceTimersByTimeAsync(0);
      ($(el, '[data-role="play"]') as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(1100 * 3 + 10);
      const counter = $(el, '[data-role="counter"]');
      expect(counter.textContent).toBe('5%');
      el.remove();
      await vi.advanceTimersByTimeAsync(10000);
      expect(counter.textContent).toBe('5%');
      expect(vi.getTimerCount()).toBe(0);
      const again = mountSync('en');
      await vi.advanceTimersByTimeAsync(0);
      ($(again, '[data-role="play"]') as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(1100 * 8);
      expect($(again, '[data-role="counter"]').textContent).toBe('100%');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('under reduced motion nothing plays and a step changes every square at once, totals included', async () => {
    vi.useFakeTimers();
    try {
      const el = mountSync('fr');
      await vi.advanceTimersByTimeAsync(0);
      setMedia(REDUCED_MOTION, true);
      expect($(el, '[data-role="play"]').getAttribute('aria-label')).not.toBe('Pause');
      ($(el, '[data-role="next"]') as HTMLButtonElement).click();
      const grids = sweptGrids(el);
      for (const g of grids) for (const sq of [...g.children] as SVGGElement[]) expect(['', '0ms']).toContain(sq.style.getPropertyValue('--d'));
      const s1 = mosaicStages(v5, 'td')[1]!;
      expect(grids[1]!.closest('.sweep-item')!.querySelector('.cell .totals:not([data-off]) strong')!.textContent).toBe(`${s1.wins} gagnées sur 100`);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('names each grid by its current stage and says each stage once, with the three win counts', async () => {
    const el = await mount('en');
    const grids = sweptGrids(el);
    expect(grids[2]!.getAttribute('aria-label')).toContain('Q-learning, before any training');
    const live = $(el, '.sweep [role="status"]');
    expect(live.textContent).toBe('');
    ($(el, '[data-role="next"]') as HTMLButtonElement).click();
    const wins = PROGRAMS.map((p) => mosaicStages(v5, p)[1]!.wins);
    expect(live.textContent).toBe(`1%: AlphaZero, 100 simulations: ${wins[0]} won of 100; TD(λ): ${wins[1]} won of 100; Q-learning: ${wins[2]} won of 100.`);
    expect(grids[1]!.getAttribute('aria-label')).toContain('TD(λ), after 500 games');
  });

  it('the motion is a cut, not a fade: zero-length transitions, no animation, still under reduced motion', () => {
    const css = readFileSync('src/elements/pogo-mosaic.css', 'utf8');
    expect(css).not.toMatch(/animation|@keyframes|opacity/);
    expect(css.match(/transition-duration: ([^;]+);/g)).toEqual(['transition-duration: 0s;']);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.swept \.sq > \* \{\s*transition: none;/);
  });
});
