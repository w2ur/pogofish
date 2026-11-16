import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Data } from '../data';
import { precisionsOf, REDUCED_MOTION, intersect, resetMedia, setMedia, shownText } from '../test-dom';
import { PogoStages } from './pogo-stages';
import { formatInterval, formatShare } from '../kit/score';
import { formatDate } from '../kit/date';

if (!customElements.get('pogo-stages')) customElements.define('pogo-stages', PogoStages);
const v5 = JSON.parse(readFileSync('public/data/v5.json', 'utf8')) as V5Data;
PogoStages.deps = { engine: () => Promise.resolve(), v5: () => Promise.resolve(v5) };

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(program: string, lang = 'fr'): Promise<PogoStages> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-stages') as PogoStages;
  el.setAttribute('program', program);
  el.innerHTML = '<p>fallback</p><p>https://youtu.be/x</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: PogoStages, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const role = (el: PogoStages, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
const choices = (el: PogoStages) => [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
const readout = (el: PogoStages) => el.shadowRoot!.querySelector('.stage-words:not([data-off])')!;
const said = (el: PogoStages) => el.shadowRoot!.querySelector('.said:not([data-off]):not(.sizer)')!.textContent;

beforeEach(() => resetMedia());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-stages>', () => {
  it('is measured under lc1-2, citing the data’s own source and the games’ directory', async () => {
    const el = await mount('td', 'en');
    expect(el.dataset.source).toBe(`${v5.source} · docs/experiments/v5/games/`);
    expect(precisionsOf(el).slice(0, 3)).toEqual([
      `Measured before publication: these numbers do not change when you play. Data as of ${formatDate('en', v5.asOf)}.`,
      'Here, the player who repeats a position a third time loses the game.',
      'The score is measured over a long series of games against greedy, played from openings drawn at random; the game shown is one of them.',
    ]);
  });

  it('names the file it asks for until the data loads, and for good when the load fails', async () => {
    const deps = PogoStages.deps;
    let fail!: (e: Error) => void;
    PogoStages.deps = { engine: () => Promise.resolve(), v5: () => new Promise((_, reject) => (fail = reject)) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const el = await mount('qtab', 'en');
      expect(el.dataset.source).toBe('data/v5.json');
      fail(new Error('503'));
      await flush();
      expect(el.hasAttribute('data-failed')).toBe(true);
      expect(el.dataset.source).toBe('data/v5.json');
      expect(precisionsOf(el)[0]).toBe('Measured before publication: these numbers do not change when you play.');
    } finally {
      PogoStages.deps = deps;
      error.mockRestore();
    }
  });

  it('its heading names TD(λ) with a lowercase λ the label cut cannot uppercase', async () => {
    const el = await mount('td', 'en');
    const where = readout(el).querySelector('.where')!;
    expect(where.textContent).toMatch(/^TD\(λ\) · /);
    expect(where.querySelector('.keep-case')!.textContent).toBe('λ');
  });

  it('stage 0 reads « avant tout entraînement », not « 0 % de l’entraînement : 0 parties »', async () => {
    for (const [lang, text] of [
      ['fr', 'TD(λ) · avant tout entraînement'],
      ['en', 'TD(λ) · before any training'],
    ] as const) {
      const el = await mount('td', lang);
      expect(v5.programs.td.stages[0]!.gamesTrained).toBe(0);
      expect(readout(el).querySelector('.where')!.textContent).toBe(text);
      expect($(el, '[role="status"]').textContent).toMatch(new RegExp(`^${text.replace(/[()]/g, '\\$&')}\\. `));
      document.body.innerHTML = '';
    }
  });

  it('offers the data’s stages, the first chosen', async () => {
    const el = await mount('qtab');
    expect(choices(el).map((b) => b.textContent)).toEqual(v5.stagesPct.map((p) => `${p} %`));
    expect(choices(el)[0]!.getAttribute('aria-checked')).toBe('true');
  });

  it('stage scores shown equal V5Data', async () => {
    for (const program of ['qtab', 'td', 'az100'] as const) {
      for (const lang of ['fr', 'en'] as const) {
        const el = await mount(program, lang);
        for (const [k, stage] of v5.programs[program].stages.entries()) {
          choices(el)[k]!.click();
          const text = readout(el).querySelector('.score')!.textContent!;
          expect(text).toContain(formatShare(lang, stage.score));
          // The percentage on screen is the data's score, within the 0.05 point of its rounding, and so is the interval in « Précisions ».
          const num = (x: string) => Number(x.replace(',', '.'));
          const shown = num(text.match(/^(\d+[.,]\d)\u202f?% (?:de parties gagnées contre le glouton|of games won against greedy)$/)![1]!);
          expect(Math.abs(shown - stage.score * 100)).toBeLessThanOrEqual(0.05 + 1e-9);
          const interval = precisionsOf(el).at(-1)!;
          expect(interval).toContain(formatInterval(lang, stage.ci95));
          const [lo, hi] = interval.match(/(\d+[.,]\d) (?:à|to) (\d+[.,]\d)/)!.slice(1).map(num);
          expect(Math.abs(lo! - stage.ci95[0] * 100)).toBeLessThanOrEqual(0.05 + 1e-9);
          expect(Math.abs(hi! - stage.ci95[1] * 100)).toBeLessThanOrEqual(0.05 + 1e-9);
        }
      }
    }
  });

  it('says what the score is, against whom, the program’s colour and how its game ended', async () => {
    const el = await mount('az100');
    choices(el)[7]!.click();
    const r = readout(el).textContent!;
    expect(r).toContain('AlphaZero, 100 simulations · 100 % de l’entraînement : 10 000 parties');
    expect(r).toContain('89,1\u202f% de parties gagnées contre le glouton');
    expect(precisionsOf(el).at(-1)).toBe('À cette étape, l’intervalle à 95\u202f% de ce score va de 87,8 à 90,3\u202f%.');
    expect(r).toContain('Partie montrée : le programme est Blanc, le glouton Rouge ; le programme gagne.');
  });

  it('replays the chosen stage’s game to its end, the opening said as random', async () => {
    const el = await mount('qtab');
    choices(el)[7]!.click();
    const stage = v5.programs.qtab.stages[7]!;
    expect(role(el, 'counter').textContent).toBe(`0 / ${stage.game.length}`);
    role(el, 'next').click();
    expect(said(el)).toContain('Ouverture tirée au sort');
    for (let i = 1; i < stage.openingPlies; i++) role(el, 'next').click();
    expect(said(el)).toContain('Ouverture tirée au sort');
    role(el, 'next').click();
    expect(said(el)).toMatch(/^Blanc \(le programme\) joue/);
    expect(el.shadowRoot!.querySelector('.said:not([data-off]):not(.sizer) .move-name [role="tooltip"]')!.textContent).toMatch(
      /^De [abc][123], [123] pièces?, vers [abc][123]\.$/,
    );
    while (!role(el, 'next').disabled) role(el, 'next').click();
    expect(said(el)).toContain('Rouge gagne');
  });

  it('choosing a stage plays its game; under reduced motion it waits for the reader', async () => {
    const el = await mount('td');
    vi.useFakeTimers();
    choices(el)[3]!.click();
    vi.advanceTimersByTime(1100);
    expect(role(el, 'counter').textContent).toMatch(/^1 \//);
    setMedia(REDUCED_MOTION, true);
    choices(el)[4]!.click();
    vi.advanceTimersByTime(1100 * 3);
    expect(role(el, 'counter').textContent).toMatch(/^0 \//);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an aborted signal stops a running replay', async () => {
    const el = await mount('az100');
    vi.useFakeTimers();
    choices(el)[2]!.click();
    vi.advanceTimersByTime(1100);
    const shown = role(el, 'counter');
    expect(shown.textContent).toMatch(/^1 \//);
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(1100 * 10);
    expect(shown.textContent).toMatch(/^1 \//);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a bad program shows the fallback, untouched', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await mount('az0');
    expect(el.hasAttribute('data-failed')).toBe(true);
    expect(el.innerHTML).toBe('<p>fallback</p><p>https://youtu.be/x</p>');
    error.mockRestore();
  });
});
