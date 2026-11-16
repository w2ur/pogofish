import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import type { Triple } from '../engine';
import { parseTd } from '../nets';
import { lambdaReturns } from '../players';
import { createStore, type Store } from '../store';
import { precisionsOf, REDUCED_MOTION, intersect, resetMedia, setMedia } from '../test-dom';
import { PogoTdTargets, stepWords } from './pogo-td-targets';
import { signedNote } from './q-steps';
import { TD_LAMBDA, tdGame, tdWalk } from './td-walk';

if (!customElements.get('pogo-td-targets')) customElements.define('pogo-td-targets', PogoTdTargets);

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as {
  openingWin: { returns: number[] };
};
const b = readFileSync(resolve(process.cwd(), 'public/nets/td-s1.pfv'));
const td = parseTd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const flush = () => new Promise((r) => setTimeout(r, 0));
const makeStore = () => createStore({ storage: null, loadEngine: () => Promise.resolve() });
const LOOP: Triple[] = [
  [0, 1, 1],
  [6, 1, 3],
  [1, 1, 0],
  [3, 1, 6],
];

function use(s: Store): void {
  PogoTdTargets.deps = { store: s, td: () => Promise.resolve(td) };
}

async function mount(lang = 'fr'): Promise<PogoTdTargets> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-td-targets') as PogoTdTargets;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: Element, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const role = (el: Element, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
const said = (el: Element) => $(el, '.said:not([data-off])');

beforeEach(() => {
  resetMedia();
  use(makeStore());
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-td-targets>', () => {
  it('puts the transport right under the chart it steps, before the legend and the table', async () => {
    const el = await mount('fr');
    expect(el.shadowRoot!.querySelector('.plot')!.nextElementSibling!.classList.contains('controls')).toBe(true);
  });

  it('is computed live under lc1-2 and says in « Précisions » whose values these are, never the net’s code name', async () => {
    const el = await mount('en');
    expect(precisionsOf(el)).toEqual([
      'Computed in your browser by the game’s engine: nothing is prerecorded.',
      'Here, the player who repeats a position a third time loses the game.',
      'The TD(λ) program’s net trained for this essay has 24,705 adjustable numbers (weights and biases).',
    ]);
    expect(el.shadowRoot!.textContent).not.toContain('v4-td-lc1-s1');
  });

  it('pogo-td-targets uses lastFinished when there is one, DEFAULT_GAME otherwise, and says which', async () => {
    const s = makeStore();
    use(s);
    const el = await mount('fr');
    expect($(el, '.where-from').textContent).toBe('Partie : l’erreur d’ouverture, 9 coups, victoire des Blancs.');
    expect($$(el, '.td-table tbody tr')).toHaveLength(DEFAULT_GAME.length + 1);
    expect($(el, '.hint').hasAttribute('data-off')).toBe(false);
    s.newGame('Red', 'easy');
    for (const m of [...LOOP, ...LOOP]) s.play(m);
    expect($(el, '.where-from').textContent).toBe('Partie : la dernière partie terminée du plateau, 8 coups, victoire des Blancs.');
    expect($$(el, '.td-table tbody tr')).toHaveLength(9);
    expect($(el, '.hint').hasAttribute('data-off')).toBe(true);
  });

  it('a game under way changes nothing: only a finished game is taken', async () => {
    const s = makeStore();
    use(s);
    const el = await mount('fr');
    const table = $(el, '.td-table');
    s.newGame('White', 'normal');
    s.play(DEFAULT_GAME[0]!);
    expect($(el, '.td-table')).toBe(table);
  });

  it('the λ-returns shown equal lambdaReturns over the net’s values, and the fixture’s', async () => {
    const el = await mount('en');
    const w = tdWalk(tdGame(makeStore()).states, (s) => td.value(s));
    expect(w.returns).toEqual(lambdaReturns(w.values, TD_LAMBDA));
    const T = w.returns.length;
    // Step to the end: every target square is known, carrying the White-view return.
    for (let i = 0; i < T + 1; i++) role(el, 'next').click();
    const squares = $$(el, '.td-chart .target');
    expect(squares.every((sq) => sq.classList.contains('known'))).toBe(true);
    const states = tdGame(makeStore()).states;
    squares.forEach((sq, t) => {
      const white = Number(sq.dataset.target);
      const mover = states[t]!.to_move === 'White' ? white : -white;
      expect(mover).toBe(w.returns[t]);
      expect(Math.abs(mover - fixture.openingWin.returns[t]!)).toBeLessThanOrEqual(1e-5);
    });
    expect($$(el, '.td-table .target-cell').slice(0, T).map((c) => c.textContent)).toEqual(w.white.targets.map((x) => signedNote('en', x)));
  });

  it('walks backwards: the result first, then each target from the next, its sum written', async () => {
    const el = await mount('fr');
    expect(said(el).textContent).toContain('Les cibles se calculent depuis la fin.');
    expect($$(el, '.td-chart .target.known')).toHaveLength(0);
    role(el, 'next').click();
    expect(said(el).querySelector('.step-head')!.textContent).toBe('Après 8 coups, Blanc au trait');
    expect(said(el).querySelector('.calc')!.textContent).toBe('cible = résultat = +1,00');
    // The target is this position’s, not the next one’s.
    expect(said(el).querySelector('.step-text')!.textContent).toBe('La position suivante est la fin de la partie\u202f: la cible de cette position est le résultat.');
    expect($$(el, '.td-chart .target.known').map((x) => x.dataset.t)).toEqual(['8']);
    role(el, 'next').click();
    const w = tdWalk(tdGame(makeStore()).states, (s) => td.value(s));
    expect(said(el).querySelector('.calc')!.textContent).toBe(
      `cible = 70 % × ${signedNote('fr', w.white.targets[8]!)} + 30 % × ${signedNote('fr', w.white.notes[8]!).replace(/^−.*/, (x) => `(${x})`)} = ${signedNote('fr', w.white.targets[7]!)}`,
    );
  });

  it('steps by its buttons only under reduced motion', async () => {
    setMedia(REDUCED_MOTION, true);
    vi.useFakeTimers();
    const el = await (async () => {
      const p = mount('fr');
      await vi.advanceTimersByTimeAsync(0);
      return p;
    })();
    expect(role(el, 'play').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect($$(el, '.td-chart .target.known')).toHaveLength(0);
  });

  it('stepWords: the first and last words', () => {
    const g = tdGame(makeStore());
    const w = tdWalk(g.states, (s) => td.value(s));
    expect(stepWords('en', g, w, 0).text).toBe('The game is over and the net has valued every position. The targets are computed from the end.');
    expect(stepWords('en', g, w, w.returns.length + 1).text).toMatch(/^Every target is computed/);
  });
});
