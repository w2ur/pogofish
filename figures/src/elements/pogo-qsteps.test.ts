import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, intersect, resetMedia, setMedia, leave, playState } from '../test-dom';
import { PogoQsteps, qWords } from './pogo-qsteps';
import { qSteps } from './q-steps';

if (!customElements.get('pogo-qsteps')) customElements.define('pogo-qsteps', PogoQsteps);
PogoQsteps.deps = { engine: () => Promise.resolve() };

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(lang = 'fr'): Promise<PogoQsteps> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-qsteps') as PogoQsteps;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: PogoQsteps, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const role = (el: PogoQsteps, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
const current = (el: PogoQsteps) => el.shadowRoot!.querySelector('.said:not([data-off])')!;
const notebook = (el: PogoQsteps) =>
  [...el.shadowRoot!.querySelectorAll('tbody tr')].map((r) => `${r.classList.contains('on') ? '*' : ''}${r.textContent}`);

beforeEach(() => resetMedia());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('qWords', () => {
  const { frames } = qSteps();
  it('writes the update of B at game 4 as qsteps.mjs does', () => {
    const f = frames.find((x) => x.game === 4 && x.changed === 'B')!;
    const w = qWords('fr', f, false);
    expect(w.game).toBe('Partie 4');
    expect(w.path).toEqual(['A', 'B']);
    expect(w.text).toBe(
      'En B, Rouge au trait. Coups : vers C1, −0,19 ; vers C2, −0,10. Meilleur coup pour Rouge : −0,10.',
    );
    expect(w.calc).toBe('Note de B : −0,01 + 10 % × (−0,10 − (−0,01)) = −0,02');
    expect(qWords('en', f, false).calc).toBe('Value of B: −0.01 + 10% × (−0.10 − (−0.01)) = −0.02');
  });

  it('at A the unseen moves are counted, and a C has a winning move', () => {
    const a = frames.find((x) => x.game === 1 && x.changed === 'A')!;
    expect(qWords('fr', a, false).text).toMatch(/^En A, Blanc au trait\. Coups : vers B, 0,00 ; \d+ autres, vers des positions jamais vues, 0\./);
    const c = frames.find((x) => x.changed === 'C1')!;
    expect(qWords('fr', c, false).text).toContain('Un coup gagne sur-le-champ : il vaut +1.');
  });

  it('the last game does not announce a next one', () => {
    const ends = frames.filter((x) => x.kind === 'end');
    expect(qWords('fr', ends[0]!, false).text).toBe('Blanc gagne. Partie suivante, depuis A.');
    expect(qWords('fr', ends.at(-1)!, true).text).toBe('Blanc gagne. Dernière partie de la démonstration.');
  });
});

describe('<pogo-qsteps>', () => {
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

  it('puts the transport right under the board it steps, the notebook beside or below them', async () => {
    const el = await mount('fr');
    const col = el.shadowRoot!.querySelector('.board-col')!;
    expect([...col.children].map((c) => c.className)).toEqual(['board-slot', 'controls']);
    expect(col.nextElementSibling!.classList.contains('notebook')).toBe(true);
  });

  it('starts on a blank notebook and changes one row per step', async () => {
    const el = await mount();
    expect(current(el).textContent).toContain('Le carnet est vierge');
    expect(notebook(el)).toEqual(['A0,00', 'B0,00', 'C10,00', 'C20,00']);
    for (let i = 0; i < 3; i++) role(el, 'next').click();
    expect(current(el).querySelector('.here')!.textContent).toBe('C1');
    expect(notebook(el)).toEqual(['A0,00', 'B0,00', '*C10,10', 'C20,00']);
    expect(role(el, 'counter').textContent).toBe('étape 3 sur 24');
  });

  it('under reduced motion it never plays by itself', async () => {
    setMedia(REDUCED_MOTION, true);
    const el = await mount();
    expect(playState(el)).toBe('play');
  });

  it('an aborted signal stops a running walk', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'play').click();
    vi.advanceTimersByTime(1600);
    const shown = role(el, 'counter');
    expect(shown.textContent).toBe('étape 1 sur 24');
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(1600 * 10);
    expect(shown.textContent).toBe('étape 1 sur 24');
    expect(vi.getTimerCount()).toBe(0);
  });
});
