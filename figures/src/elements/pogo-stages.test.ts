import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Data } from '../data';
import { REDUCED_MOTION, intersect, resetMedia, setMedia, shownText, leave, playState } from '../test-dom';
import { MOVE_MS, PogoStages, REST_MS } from './pogo-stages';
import { formatInterval, formatShare } from '../kit/score';

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
const $$ = (el: PogoStages, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const drawn = (el: PogoStages) => $$(el, '.lines .run:not([data-off])').length;
const said = (el: PogoStages) => shownText(el.shadowRoot!.querySelector('.said:not([data-off]):not(.sizer)')!);

beforeEach(() => resetMedia());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-stages>', () => {
  it('starts by itself once half of it is on screen, pauses when it leaves, and resumes when it comes back', async () => {
    const el = await mount('td');
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
    const el = await mount('td');
    intersect(el);
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-role="play"]')!.click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
    el.remove();
  });

  it('shows its fallback when the data load fails', async () => {
    const deps = PogoStages.deps;
    let fail!: (e: Error) => void;
    PogoStages.deps = { engine: () => Promise.resolve(), v5: () => new Promise((_, reject) => (fail = reject)) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const el = await mount('qtab', 'en');
      fail(new Error('503'));
      await flush();
      expect(el.hasAttribute('data-failed')).toBe(true);
    } finally {
      PogoStages.deps = deps;
      error.mockRestore();
    }
  });

  it('its heading names TD(λ) with a lowercase λ the label cut cannot uppercase', async () => {
    const el = await mount('td', 'en');
    const where = $(el, '.where');
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
      expect($(el, '.where').textContent).toBe(text);
      expect($(el, '[role="status"]').textContent).toMatch(new RegExp(`^${text.replace(/[()]/g, '\\$&')}\\. `));
      document.body.innerHTML = '';
    }
  });

  it('the points of the curve are the stage picker: one radio per stage of the data, named by its score, the first chosen', async () => {
    const el = await mount('qtab');
    expect($(el, '[role="radiogroup"]').getAttribute('aria-label')).toBe('Étape de l’entraînement');
    expect(choices(el)).toHaveLength(v5.stagesPct.length);
    expect(choices(el).map((b) => b.getAttribute('aria-checked'))).toEqual(['true', ...v5.stagesPct.slice(1).map(() => 'false')]);
    expect(choices(el).map((b) => b.tabIndex)).toEqual([0, ...v5.stagesPct.slice(1).map(() => -1)]);
    expect(choices(el)[0]!.getAttribute('aria-label')).toBe('avant tout entraînement : 3,1 % de parties gagnées contre le glouton');
    expect(choices(el)[7]!.getAttribute('aria-label')).toBe('100 % de l’entraînement : 17,8 % de parties gagnées contre le glouton');
  });

  it('places each point at its stage’s measured score, and names the three references with their scores', async () => {
    const el = await mount('td');
    choices(el).forEach((b, k) => {
      const stage = v5.programs.td.stages.find((s) => s.pct === v5.stagesPct[k])!;
      expect(parseFloat(b.style.top)).toBeCloseTo((1 - stage.score) * 100, 2);
    });
    expect($$(el, '.ref-name').map((r) => r.textContent)).toEqual(['table exacte 91,9 %', 'glouton 49,3 %', 'hasard 3,1 %']);
    expect($$(el, '.lines .ref')).toHaveLength(3);
    expect($$(el, '.x-axis .tick').map((x) => x.textContent)).toEqual(v5.stagesPct.map(String));
    expect($(el, '.unit-x').textContent).toBe('part de l’entraînement, en %');
    expect($(el, '.unit-y').textContent).toBe('parties gagnées, en %');
  });

  it('the headline score and its interval equal V5Data at every stage of the three programs', async () => {
    for (const program of ['qtab', 'td', 'az100'] as const) {
      for (const lang of ['fr', 'en'] as const) {
        const el = await mount(program, lang);
        for (const [k, stage] of v5.programs[program].stages.entries()) {
          choices(el)[k]!.click();
          const text = $(el, '.score').textContent!;
          expect(text).toBe(formatShare(lang, stage.score));
          // The percentage on screen is the data's score, within the 0.05 point of its rounding.
          const shown = Number(text.match(/^(\d+[.,]\d)/)![1]!.replace(',', '.'));
          expect(Math.abs(shown - stage.score * 100)).toBeLessThanOrEqual(0.05 + 1e-9);
          expect($(el, '.interval').textContent).toContain(formatInterval(lang, stage.ci95));
        }
        document.body.innerHTML = '';
      }
    }
  });

  it('says what the score is, where in training, and who is who in the game shown', async () => {
    const el = await mount('az100');
    choices(el)[7]!.click();
    expect($(el, '.where').textContent).toBe('AlphaZero, 100 simulations · après 10 000 parties, 100 % de l’entraînement');
    expect($(el, '.headline').textContent).toBe('Score contre le glouton89,1 %intervalle à 95 % : 87,8 à 90,3 %');
    expect($(el, '.shown').textContent).toBe('Partie montrée : le programme est Blanc, le glouton Rouge.');
  });

  it('the curve is drawn up to the stage shown, whose point is the large one', async () => {
    const el = await mount('td');
    expect(drawn(el)).toBe(0);
    expect(choices(el).map((b) => b.dataset.when)).toEqual(['now', 'later', 'later', 'later', 'later', 'later', 'later', 'later']);
    choices(el)[3]!.click();
    expect(drawn(el)).toBe(3);
    expect(choices(el).map((b) => b.dataset.when)).toEqual(['past', 'past', 'past', 'now', 'later', 'later', 'later', 'later']);
    expect($$(el, '.lines .run')).toHaveLength(v5.stagesPct.length - 1);
  });

  it('the arrow keys move along the curve and choose', async () => {
    const el = await mount('td');
    choices(el)[0]!.focus();
    choices(el)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(choices(el)[1]!.getAttribute('aria-checked')).toBe('true');
    expect(el.shadowRoot!.activeElement).toBe(choices(el)[1]);
    choices(el)[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    choices(el)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(choices(el)[7]!.getAttribute('aria-checked')).toBe('true');
  });

  it('replays the chosen stage’s game to its end, the opening said as random', async () => {
    const el = await mount('qtab');
    choices(el)[7]!.click();
    role(el, 'play').click();
    const stage = v5.programs.qtab.stages[7]!;
    expect(role(el, 'counter').textContent).toBe(`étape 8 sur 8 · coup 0 sur ${stage.game.length}`);
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
    expect(role(el, 'counter').textContent).toBe(`étape 8 sur 8 · coup ${stage.game.length} sur ${stage.game.length}`);
  });

  it('the stages advance by themselves: a game ends, rests, and the next stage starts with its own score', async () => {
    const el = await mount('td');
    vi.useFakeTimers();
    role(el, 'play').click();
    const moves = v5.programs.td.stages[0]!.game.length;
    vi.advanceTimersByTime(MOVE_MS * moves);
    expect(role(el, 'counter').textContent).toBe(`étape 1 sur 8 · coup ${moves} sur ${moves}`);
    expect($(el, '.score').textContent).toBe('7,1 %');
    vi.advanceTimersByTime(REST_MS - 1);
    expect(role(el, 'counter').textContent).toMatch(/^étape 1 sur 8/);
    vi.advanceTimersByTime(1);
    expect(role(el, 'counter').textContent).toMatch(/^étape 2 sur 8 · coup 0 sur /);
    expect(choices(el)[1]!.getAttribute('aria-checked')).toBe('true');
    // The number is set, never counted: it is the next stage's score at once.
    expect($(el, '.score').textContent).toBe('45,1 %');
    expect(REST_MS).toBeGreaterThan(MOVE_MS);
  });

  it('choosing a stage plays its game; under reduced motion it waits for the reader', async () => {
    const el = await mount('td');
    vi.useFakeTimers();
    choices(el)[3]!.click();
    vi.advanceTimersByTime(MOVE_MS);
    expect(role(el, 'counter').textContent).toMatch(/^étape 4 sur 8 · coup 1 sur /);
    setMedia(REDUCED_MOTION, true);
    choices(el)[4]!.click();
    vi.advanceTimersByTime(MOVE_MS * 3);
    expect(role(el, 'counter').textContent).toMatch(/^étape 5 sur 8 · coup 0 sur /);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('under reduced motion it rests on the last stage, its game ended and the whole curve drawn', async () => {
    setMedia(REDUCED_MOTION, true);
    const el = await mount('az100');
    expect(playState(el)).toBe('play');
    expect(drawn(el)).toBe(v5.stagesPct.length - 1);
    expect($(el, '.score').textContent).toBe('89,1 %');
    expect(role(el, 'next').disabled).toBe(true);
  });

  it('an aborted signal stops a running replay', async () => {
    const el = await mount('az100');
    vi.useFakeTimers();
    choices(el)[2]!.click();
    vi.advanceTimersByTime(MOVE_MS);
    const shown = role(el, 'counter');
    expect(shown.textContent).toMatch(/· coup 1 sur /);
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(MOVE_MS * 10);
    expect(shown.textContent).toMatch(/· coup 1 sur /);
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

describe('<pogo-stages> transport', () => {
  it('names its step buttons by the move, since each step is a move of a game', async () => {
    const el = await mount('td');
    const name = (r: string) => el.shadowRoot!.querySelector(`[data-role="${r}"]`)!.getAttribute('aria-label');
    expect([name('previous'), name('next')]).toEqual(['Revenir au coup précédent', 'Passer au coup suivant']);
  });
});
