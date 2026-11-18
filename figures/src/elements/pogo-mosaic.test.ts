import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Data } from '../data';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia } from '../test-dom';
import { MOSAIC_PROGRAMS } from './mosaic-grid';
import { SWEEP_MS, SWEEP_STEP_MS } from './mosaic-sweep';
import { PogoMosaic, SWEEP_INTERVAL } from './pogo-mosaic';

if (!customElements.get('pogo-mosaic')) customElements.define('pogo-mosaic', PogoMosaic);
const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;
const sheet = readFileSync(resolve(process.cwd(), 'src/elements/pogo-mosaic.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Mounts and brings it into view; the caller flushes (fake timers or not). */
function mountSync(lang = 'fr'): PogoMosaic {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-mosaic') as PogoMosaic;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  return el;
}

async function mount(lang = 'fr'): Promise<PogoMosaic> {
  const el = mountSync(lang);
  await flush();
  return el;
}

const $ = (el: PogoMosaic, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoMosaic, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const rows = (el: PogoMosaic) => $$(el, '.stage-row');
const shown = (el: PogoMosaic) => rows(el).map((r) => r.hasAttribute('data-on'));
const upTo = (k: number) => v5.stagesPct.map((_, i) => i <= k);
const wins = (program: 'az100' | 'td' | 'qtab', k: number) => v5.mosaics[program][k]!.games.filter((g) => g.result === 'win').length;

beforeEach(() => {
  resetMedia();
  PogoMosaic.deps = { v5: () => Promise.resolve(v5) };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-mosaic>', () => {
  it('draws the three programs side by side, one row per stage: 100 framed squares each, a red one filled per game won, in the data’s order', async () => {
    const el = await mount();
    expect(rows(el)).toHaveLength(v5.stagesPct.length);
    rows(el).forEach((row, k) => {
      const cells = [...row.querySelectorAll<HTMLElement>('.cell')];
      expect(cells.map((c) => c.dataset.program)).toEqual([...MOSAIC_PROGRAMS]);
      cells.forEach((cell, p) => {
        const games = v5.mosaics[MOSAIC_PROGRAMS[p]!][k]!.games;
        // Every game has its frame, under the red: a lost game is the empty frame.
        const slots = cell.querySelector('.slots')!;
        expect((slots.getAttribute('d') ?? '').split('M').length - 1).toBe(100);
        expect(slots.parentElement!.firstElementChild).toBe(slots);
        // And one filled square per game won, at its own place; a lost game has none.
        const won = [...cell.querySelectorAll<SVGRectElement>('rect.won')];
        expect(won.map((r) => Number(r.dataset.game))).toEqual(games.flatMap((g, i) => (g.result === 'win' ? [i] : [])));
        expect(cell.querySelectorAll('rect.lost')).toHaveLength(0);
        for (const r of won) {
          const i = Number(r.dataset.game);
          expect([Number(r.getAttribute('x')), Number(r.getAttribute('y'))]).toEqual([(i % 20) * 10 + 1, Math.floor(i / 20) * 10 + 1]);
        }
      });
    });
  });

  it('writes under each mosaic how far the program has trained and its games won, counted from the games', async () => {
    const el = await mount();
    const cell = (k: number, program: string) => rows(el)[k]!.querySelector<HTMLElement>(`.cell[data-program="${program}"]`)!;
    expect(cell(0, 'az100').querySelector('.count')!.textContent).toBe(`avant tout entraînement · ${wins('az100', 0)} gagnées sur 100`);
    expect(cell(4, 'az100').querySelector('.count')!.textContent).toBe(`après 1 000 parties · ${wins('az100', 4)} gagnées sur 100`);
    expect(cell(7, 'qtab').querySelector('.count')!.textContent).toBe(`après 5 000 000 parties · ${wins('qtab', 7)} gagnées sur 100`);
    expect(cell(7, 'td').querySelector('.count strong')!.textContent).toBe(`${wins('td', 7)} gagnées sur 100`);
    // The drawing says the same to a reader who cannot see it.
    expect(cell(7, 'td').querySelector('svg')!.getAttribute('aria-label')).toBe(`TD(λ), après 50 000 parties : ${wins('td', 7)} gagnées sur 100.`);
    const en = await mount('en');
    expect(rows(en)[4]!.querySelector('.cell[data-program="az100"] .count')!.textContent).toBe(`after 1,000 games · ${wins('az100', 4)} won of 100`);
  });

  it('heads each column with its program and each row with the share of the training done, said beside the number at every width', async () => {
    const el = await mount();
    expect($$(el, '.head .program').map((h) => h.textContent)).toEqual(['AlphaZero, 100 simulations', 'TD(λ)', 'Q-learning']);
    expect($$(el, '.stage-label .pct').map((h) => h.textContent)).toEqual(v5.stagesPct.map((p) => `${p} %`));
    // « 0 %, 1 %, 2 % » alone read as games won: the words stay by every number.
    expect($$(el, '.stage-label .of').map((o) => o.textContent)).toEqual(v5.stagesPct.map(() => 'de l’entraînement effectué'));
    expect(sheet).not.toMatch(/\.of \{[^}]*display: none/);
    const en = await mount('en');
    expect($(en, '.stage-label .of').textContent).toBe('of training done');
  });

  it('says what a square is in one line, and nothing else: no note, no disclosure, no table of values', async () => {
    const el = await mount();
    expect($(el, '.key').textContent).toBe('Une case par partie : rouge si le programme gagne, vide s’il perd.');
    expect($(await mount('en'), '.key').textContent).toBe('One square per game: red if the program wins, empty if it loses.');
    expect(el.shadowRoot!.querySelector('details')).toBeNull();
    expect(el.shadowRoot!.querySelector('table')).toBeNull();
    expect($$(el, '.mosaics > p').map((p) => p.className)).toEqual(['say title', 'key', 'sr']);
  });

  it('a won square is the page’s red, a lost one is its empty frame, readable in light and dark: no other colour', () => {
    expect(sheet).toMatch(/\.mosaic \.won \{[^}]*fill: var\(--_red\)/);
    expect(sheet).not.toMatch(/--_white|--_black|\.lost/);
    expect(sheet).toMatch(/\.mosaic \.slots \{[^}]*fill: none;[^}]*stroke: var\(--_edge\)/);
    expect(sheet).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(|hsl\(/i);
  });

  it('rests on the first stage, then fills stage after stage once half of it is on screen, and stops on the whole mosaic', async () => {
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown(el)).toEqual(upTo(0));
    expect(playState(el)).toBe('play');
    // The figure is drawn: now half of it comes on screen.
    intersect(el);
    expect(playState(el)).toBe('pause');
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL);
    expect(shown(el)).toEqual(upTo(1));
    expect($(el, '[data-role="counter"]').textContent).toBe('étape 2 sur 8 · 1 % de l’entraînement effectué');
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL * 10);
    expect(shown(el)).toEqual(upTo(7));
    expect(playState(el)).toBe('replay');
  });

  it('pauses when it leaves the screen and resumes when it comes back, unless the reader paused it', async () => {
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    intersect(el);
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL);
    leave(el);
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL * 3);
    expect(shown(el)).toEqual(upTo(1));
    intersect(el);
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL);
    expect(shown(el)).toEqual(upTo(2));
    $(el, '[data-role="play"]').click();
    leave(el);
    intersect(el);
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL * 3);
    expect(shown(el)).toEqual(upTo(2));
  });

  it('a stage fills square by square in the order of the games, and its count comes once the last has filled', async () => {
    const el = await mount();
    const cell = rows(el)[3]!.querySelector<HTMLElement>('.cell[data-program="az100"]')!;
    const fills = cell.querySelectorAll<SVGRectElement>('rect.won');
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.length).toBeLessThan(100);
    for (const r of fills) expect(r.style.getPropertyValue('--d')).toBe(`${Number(r.dataset.game) * SWEEP_STEP_MS}ms`);
    expect(sheet).toMatch(/\.stage-row\[data-on\] \.won \{[^}]*opacity: 1;[^}]*transition: opacity 0s linear var\(--d\)/);
    expect($(el, '.table').style.getPropertyValue('--sweep')).toBe(`${SWEEP_MS}ms`);
    expect(sheet).toMatch(/\.stage-row\[data-on\] \.count \{[^}]*visibility: visible;[^}]*transition: visibility 0s linear var\(--sweep\)/);
    // The interval leaves the sweep time to end and the stage time to be read.
    expect(SWEEP_INTERVAL).toBeGreaterThan(2 * SWEEP_MS);
  });

  it('plays fast enough to keep up with a reader scrolling past: the eight stages in under five seconds', () => {
    // Round 3 took 1.4 s a stage, ten seconds in all, and the owner scrolled past it unfilled.
    expect(SWEEP_INTERVAL * (v5.stagesPct.length - 1)).toBeLessThanOrEqual(5000);
    expect(SWEEP_MS).toBeLessThanOrEqual(300);
  });

  it('under reduced motion nothing starts by itself: the whole mosaic at once, and the play control', async () => {
    setMedia(REDUCED_MOTION, true);
    vi.useFakeTimers();
    const el = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    intersect(el);
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL * 3);
    expect(shown(el)).toEqual(upTo(7));
    expect(playState(el)).toBe('play');
    expect(sheet).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.won,[^@]*\.count \{\s*transition: none/);
  });

  it('puts the transport right under the mosaics, and says each stage once to a screen reader', async () => {
    const el = await mount();
    expect($(el, '.table').nextElementSibling!.classList.contains('controls')).toBe(true);
    $(el, '[data-role="play"]').click();
    $(el, '[data-role="next"]').click();
    expect($(el, '.sr').textContent).toBe(
      `1 % de l’entraînement effectué : AlphaZero, 100 simulations, ${wins('az100', 1)} gagnées sur 100 ; TD(λ), ${wins('td', 1)} gagnées sur 100 ; Q-learning, ${wins('qtab', 1)} gagnées sur 100.`,
    );
  });

  it('the three columns stay side by side at every width: the stage heads its row when the box is narrow', () => {
    expect(sheet).toMatch(/\.table \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    const wide = sheet.slice(sheet.indexOf('@container (min-width: 560px)'));
    expect(wide).toMatch(/\.table \{[^}]*grid-template-columns: max-content repeat\(3, minmax\(0, 280px\)\)/);
  });

  it('refuses data that does not add up, before drawing anything', async () => {
    const broken = structuredClone(v5);
    broken.mosaics.td[2]!.games.pop();
    PogoMosaic.deps = { v5: () => Promise.resolve(broken) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await mount();
    expect(el.hasAttribute('data-failed')).toBe(true);
    error.mockRestore();
  });
});
