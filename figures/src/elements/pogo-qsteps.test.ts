import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, intersect, resetMedia, setMedia, leave, playState } from '../test-dom';
import { FAST_MS, PogoQsteps, SLOW_MS, groupWords, qWords } from './pogo-qsteps';
import { ALPHA, qScript, qSteps } from './q-steps';

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
const $$ = (el: PogoQsteps, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const role = (el: PogoQsteps, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
const current = (el: PogoQsteps) => el.shadowRoot!.querySelector('.said:not([data-off])')!;
/** The notebook, a line per row: `*` the note just written, `>` the note read, `·` a game not played yet. */
const notebook = (el: PogoQsteps) =>
  $$(el, 'tbody tr').map((r) =>
    [...r.children].map((c) => `${c.classList.contains('wrote') ? '*' : ''}${c.classList.contains('read') ? '>' : ''}${c.textContent || '·'}`).join(' '),
  );
const moves = (el: PogoQsteps) =>
  $$(el, '.move-row:not([data-off])').map((r) => `${r.classList.contains('best') ? '*' : ''}${r.querySelector('.what')!.textContent} = ${r.querySelector('.val')!.textContent || '?'}`);
const formula = (el: PogoQsteps) => $(el, '.formula').textContent!;
const go = (el: PogoQsteps, n: number) => {
  for (let i = 0; i < n; i++) role(el, 'next').click();
};

const walk = qSteps();
const script = qScript(walk);
const words = (lang: 'fr' | 'en', i: number) => qWords(lang, walk, script[i]!, i === script.length - 1);
const at = (game: number, name: string, phase: string | null) =>
  script.findIndex((s) => walk.frames[s.frame]!.game === game && walk.frames[s.frame]!.update?.name === name && s.phase === phase);

beforeEach(() => resetMedia());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('qWords', () => {
  it('opens on the essay’s first rule', () => {
    expect(words('fr', 0)).toEqual({
      game: 'Avant la première partie',
      path: ['A'],
      text: 'Au départ, toutes les positions ont une note égale à 0.',
      counter: 'avant la première partie',
    });
  });

  it('says the five sub-steps of the first update that changes a note, in the essay’s words', () => {
    const i = at(1, 'C1', 'look');
    expect([0, 1, 2, 3, 4].map((k) => words('fr', i + k).text)).toEqual([
      'Le programme est en C1, Blanc au trait. Il regarde les coups possibles.',
      'Il attribue une valeur à chaque coup : +1 si le coup permet de gagner la partie ; sinon, l’opposé de la note de la position d’arrivée.',
      'Il garde la valeur du meilleur coup : +1,00.',
      'Il calcule la nouvelle note de C1.',
      'Il écrit la nouvelle note dans le carnet : C1 passe de 0,00 à 0,10. Il joue ensuite un coup, en général le meilleur.',
    ]);
    expect(words('fr', i).game).toBe('Partie 1 sur 5');
    expect(words('fr', i).path).toEqual(['A', 'B', 'C1']);
    expect(words('fr', i).counter).toBe('partie 1 sur 5 · étape 3 sur 8');
    expect(words('en', i + 4).text).toBe('It writes the new value in the notebook: C1 goes from 0.00 to 0.10. It then plays a move, usually the best one.');
  });

  it('where a value is read in the notebook, says so, with the essay’s reason', () => {
    expect(words('fr', at(3, 'B', 'value')).text).toBe(
      'Il attribue une valeur à chaque coup : l’opposé de la note de la position d’arrivée, lue dans le carnet (le coup suivant appartient à l’adversaire).',
    );
    expect(words('fr', at(3, 'B', 'write')).text).toContain('B passe de 0,00 à −0,01.');
  });

  it('says an update played at once in one sentence, the note staying or changing', () => {
    expect(words('fr', at(1, 'A', null)).text).toBe('En A, Blanc au trait : le meilleur coup vaut 0,00, la note de A reste 0,00.');
    expect(words('fr', at(2, 'C2', null)).text).toBe('En C2, Blanc au trait : le meilleur coup vaut +1,00, la note de C2 passe de 0,00 à 0,10.');
    expect(words('en', at(2, 'B', null)).text).toBe('At B, Red to move: the best move is worth 0.00, the value of B stays 0.00.');
  });

  it('ends each game on its winner, and the last on the essay’s sentence', () => {
    const ends = script.map((s, i) => ({ s, i })).filter(({ s }) => walk.frames[s.frame]!.kind === 'end');
    expect(words('fr', ends[0]!.i).text).toBe('Blanc gagne. Partie suivante, depuis A.');
    expect(words('fr', ends.at(-1)!.i).text).toBe('Blanc gagne. La valeur des positions gagnantes s’est propagée vers les positions qui y mènent.');
    expect(ends.at(-1)!.i).toBe(script.length - 1);
  });
});

describe('groupWords', () => {
  it('names a move by where it leads, and counts the others', () => {
    expect(groupWords('fr', { kind: 'to', to: 'C1', count: 1, q: 0 })).toBe('vers C1');
    expect(groupWords('fr', { kind: 'win', to: null, count: 2, q: 1 })).toBe('2 coups qui gagnent la partie');
    expect(groupWords('fr', { kind: 'win', to: null, count: 1, q: 1 })).toBe('1 coup qui gagne la partie');
    expect(groupWords('fr', { kind: 'unseen', to: null, count: 21, q: 0 })).toBe('21 autres coups, vers des positions notées 0');
    expect(groupWords('en', { kind: 'lose', to: null, count: 1, q: -1 })).toBe('1 move that loses the game');
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
    role(el, 'play').click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
    el.remove();
  });

  it('lays the position, its moves, the notebook and the formula in one body, the transport right under it', async () => {
    const el = await mount('fr');
    expect([...$(el, '.body').children].map((c) => c.className)).toEqual(['board-slot', 'moves', 'book', 'formula blank']);
    expect($(el, '.body').nextElementSibling!.classList.contains('controls')).toBe(true);
  });

  it('starts on a notebook of zeros with one column, the games to come empty', async () => {
    const el = await mount();
    expect(current(el).textContent).toContain('Au départ, toutes les positions ont une note égale à 0.');
    expect(notebook(el)).toEqual(['A 0,00 · · · · ·', 'B 0,00 · · · · ·', 'C1 0,00 · · · · ·', 'C2 0,00 · · · · ·']);
    expect($$(el, 'thead th').map((h) => h.textContent)).toEqual(['Position', 'départ', 'après la partie', '1', '2', '3', '4', '5']);
    expect(role(el, 'counter').textContent).toBe('avant la première partie');
    expect(moves(el)).toEqual([]);
  });

  it('plays one update in five sub-steps: the moves, their values, the best kept, the formula with these numbers, the note written', async () => {
    const el = await mount();
    go(el, at(1, 'C1', 'look'));
    expect(moves(el)).toEqual(['2 coups qui gagnent la partie = ?', '24 autres coups, vers des positions notées 0 = ?']);
    expect($(el, '.formula').classList.contains('blank')).toBe(true);
    go(el, 1);
    expect(moves(el)).toEqual(['2 coups qui gagnent la partie = +1,00', '24 autres coups, vers des positions notées 0 = 0,00']);
    go(el, 1);
    expect(moves(el)[0]).toBe('*2 coups qui gagnent la partie = +1,00');
    expect($$(el, '.move-row.dim')).toHaveLength(1);
    expect(notebook(el)[2]).toBe('C1 0,00 0,00 · · · ·');
    go(el, 1);
    expect(formula(el)).toBe('0,10nouvelle note=0,00ancienne note+ 10 % × (1,00valeur du meilleur coup−0,00ancienne note)');
    expect(notebook(el)[2]).toBe('C1 0,00 0,00 · · · ·');
    // The result travels from the formula to the notebook: the row changes when it lands.
    vi.useFakeTimers();
    go(el, 1);
    expect(notebook(el)[2]).toBe('C1 0,00 0,00 · · · ·');
    vi.advanceTimersByTime(3000);
    expect(el.shadowRoot!.querySelector('.flyer')).toBeNull();
    expect(notebook(el)[2]).toBe('C1 0,00 *0,10 · · · ·');
    expect($(el, '.name.here').textContent).toBe('C1');
    expect(role(el, 'counter').textContent).toBe('partie 1 sur 5 · étape 7 sur 8');
  });

  it('the step that values the moves marks the note it reads in the notebook, and the move gets its opposite', async () => {
    const el = await mount();
    go(el, at(3, 'B', 'value'));
    expect(notebook(el)).toEqual(['A 0,00 0,00 0,00 0,00 · ·', 'B 0,00 0,00 0,00 0,00 · ·', 'C1 0,00 0,10 0,10 >0,10 · ·', 'C2 0,00 0,00 0,10 >0,10 · ·']);
    expect(moves(el)).toEqual(['vers C1 = −0,10', 'vers C2 = −0,10']);
    go(el, 2);
    expect(formula(el)).toContain('−0,01nouvelle note=0,00ancienne note+ 10 % × (−0,10valeur du meilleur coup−0,00ancienne note)');
  });

  it('the formula’s 10 % is the walk’s step size, and a negative old note is bracketed', async () => {
    expect(ALPHA).toBe(0.1);
    const el = await mount();
    go(el, at(4, 'B', null));
    expect(formula(el)).toContain('−0,02nouvelle note=−0,01ancienne note+ 10 % × (−0,10valeur du meilleur coup−(−0,01)ancienne note)');
  });

  it('game after game the notebook keeps a column: at rest, the non-zero note is one position further back each time', async () => {
    setMedia(REDUCED_MOTION, true);
    const el = await mount();
    // Under reduced motion the figure rests on its last step: every game played.
    expect(notebook(el)).toEqual([
      'A 0,00 0,00 0,00 0,00 0,001 0,003',
      'B 0,00 0,00 0,00 −0,01 −0,02 −0,04',
      'C1 0,00 0,10 0,10 0,19 0,19 *0,27',
      'C2 0,00 0,00 0,10 0,10 0,19 0,19',
    ]);
    expect($$(el, 'tbody tr').map((r) => [...r.querySelectorAll('td')].findIndex((c) => c.classList.contains('set')))).toEqual([4, 3, 1, 2]);
    expect(current(el).textContent).toContain('La valeur des positions gagnantes s’est propagée vers les positions qui y mènent.');
    expect(playState(el)).toBe('play');
  });

  it('holds a step read for the first time longer than a step of a game already seen', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'play').click();
    const counter = role(el, 'counter');
    vi.advanceTimersByTime(SLOW_MS - 1);
    expect(counter.textContent).toBe('avant la première partie');
    vi.advanceTimersByTime(1);
    expect(counter.textContent).toBe('partie 1 sur 5 · étape 1 sur 8');
    expect(SLOW_MS).toBeGreaterThanOrEqual(2500);
    expect(FAST_MS).toBeLessThan(SLOW_MS);
    expect(script.filter((s) => s.phase !== null).every((s) => s.slow)).toBe(true);
  });

  it('an aborted signal stops a running walk', async () => {
    const el = await mount();
    vi.useFakeTimers();
    role(el, 'play').click();
    vi.advanceTimersByTime(SLOW_MS);
    const shown = role(el, 'counter');
    expect(shown.textContent).toBe('partie 1 sur 5 · étape 1 sur 8');
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(SLOW_MS * 10);
    expect(shown.textContent).toBe('partie 1 sur 5 · étape 1 sur 8');
    expect(vi.getTimerCount()).toBe(0);
  });
});
