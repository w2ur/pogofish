import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Data } from '../data';
import { REDUCED_MOTION, intersect, resetMedia, setMedia } from '../test-dom';
import { PogoStages } from './pogo-stages';
import { formatScore } from '../kit/score';

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
  it('is measured under lc1-2, its source the data’s own string', async () => {
    const el = await mount('td', 'en');
    expect($(el, '.fidelity').textContent).toBe(`Measured data · repetition rule (lc1-2) · source: ${v5.source}`);
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
          expect(text).toContain(formatScore(lang, stage));
          // The percentage on screen is the data's score, within the 0.05 point of its rounding, and so is the interval.
          const num = (x: string) => Number(x.replace(',', '.'));
          const shown = num(text.match(/(\d+[.,]\d)\u202f?% \[/)![1]!);
          expect(Math.abs(shown - stage.score * 100)).toBeLessThanOrEqual(0.05 + 1e-9);
          const [lo, hi] = text.match(/\[(.+)\]/)![1]!.split(lang === 'fr' ? '\u202f; ' : '; ').map(num);
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
    expect(r).toContain('Score contre le joueur glouton\u202f: 89,1\u202f% [87,8\u202f; 90,3]');
    expect(r).toContain('Part des parties gagnées');
    expect(r).toContain('Partie montrée : le programme est Blanc, le glouton Rouge ; le programme gagne.');
  });

  it('replays the chosen stage’s game to its end, the opening said as random', async () => {
    const el = await mount('qtab');
    choices(el)[7]!.click();
    const stage = v5.programs.qtab.stages[7]!;
    expect(role(el, 'counter').textContent).toBe(`0 / ${stage.game.length}`);
    role(el, 'next').click();
    expect(said(el)).toContain('Ouverture tirée au sort');
    for (let i = 0; i < 4; i++) role(el, 'next').click();
    expect(said(el)).toMatch(/^Blanc \(le programme\) joue/);
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
