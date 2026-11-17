import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import type { V5Data } from '../data';
import type { Triple } from '../engine';
import { parseTd } from '../nets';
import { lambdaReturns } from '../players';
import { createStore, type Store } from '../store';
import { REDUCED_MOTION, intersect, resetMedia, setMedia, leave, playState } from '../test-dom';
import { ADJUST_MS, PogoTdTargets, RETARGET_MS, START_MS, STRIP_MAX, climbMs, stepWords } from './pogo-td-targets';
import { noteText, signedNote } from './q-steps';
import { TD_LAMBDA, TD_ROUNDS, tdGame, tdRounds, tdScript, tdWalk } from './td-walk';

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

  it('puts the transport right under the film it steps, before the legend and the table', async () => {
    const el = await mount('fr');
    expect($(el, '.film').nextElementSibling!.classList.contains('controls')).toBe(true);
    expect($(el, '.controls').nextElementSibling!.classList.contains('legend')).toBe(true);
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

  // Regression: the values' summary, a flex box, had lost its disclosure marker and read as a
  // heading over nothing; and « note du réseau » wrapped in a 4.6em column, clipped by the next row.
  it('the values read as a disclosure, and a row’s name stands on one line', async () => {
    const el = await mount('fr');
    expect($(el, 'details.values > summary').textContent).toBe('Les valeurs');
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-td-targets.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.values summary::before \{[^}]*border-right: 2px solid currentColor;/);
    expect(css).toMatch(/\.values\[open\] summary::before \{[^}]*rotate\(45deg\)/);
    expect(css).toMatch(/\.row-name \{[^}]*white-space: nowrap;/);
    expect(css).toMatch(/\.film\.strip \{[^}]*grid-template-columns: max-content minmax\(0, 1fr\);/);
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

  it('lays the game’s boards, the chart’s marks and the numbers on one column per position', async () => {
    const el = await mount('fr');
    const n = DEFAULT_GAME.length + 1;
    expect(n).toBeLessThanOrEqual(STRIP_MAX);
    expect($(el, '.film').style.getPropertyValue('--n')).toBe(String(n));
    expect($$(el, '.cell.boards svg')).toHaveLength(n);
    expect($$(el, '.cell.ticks').map((c) => c.textContent)).toEqual(Array.from({ length: n }, (_, i) => String(i)));
    expect($$(el, '.mk.note')).toHaveLength(n - 1);
    expect($$(el, '.mk.result')).toHaveLength(1);
    expect($$(el, '.side').map((p) => p.textContent)).toEqual(['+1 : les Blancs gagnent', '−1 : les Rouges gagnent']);
    expect($(el, '.axis-x').textContent).toBe('positions de la partie, dans l’ordre');
  });

  it('a game too long for a strip keeps the chart and names only the ends of its axis', async () => {
    const s = makeStore();
    use(s);
    s.newGame('Red', 'easy');
    // A real 22-move game: the one the bench kept for Q-learning's last stage.
    const long = (JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/v5.json'), 'utf8')) as V5Data).programs.qtab.stages.at(-1)!.game;
    expect(long.length + 1).toBeGreaterThan(STRIP_MAX);
    for (const m of long) s.play(m);
    const el = await mount('fr');
    expect($(el, '.where-from').textContent).toContain(`${long.length} coups`);
    expect($$(el, '.film.strip')).toHaveLength(0);
    expect($$(el, '.cell.boards')).toHaveLength(0);
    expect($$(el, '.cell.notes')).toHaveLength(0);
    expect($$(el, '.mk.note')).toHaveLength(long.length);
    expect($$(el, '.cell.ticks').map((c) => c.textContent).filter(Boolean)).toEqual(['0', String(long.length)]);
  });

  it('the λ-returns shown equal lambdaReturns over the net’s values, and the fixture’s', async () => {
    const el = await mount('en');
    const w = tdWalk(tdGame(makeStore()).states, (s) => td.value(s));
    expect(w.returns).toEqual(lambdaReturns(w.values, TD_LAMBDA));
    const T = w.returns.length;
    // Step to the end of the climb: every target square is known, carrying the White-view return.
    for (let i = 0; i < T; i++) role(el, 'next').click();
    const squares = $$(el, '.mk.target');
    expect(squares.every((sq) => sq.classList.contains('known'))).toBe(true);
    const states = tdGame(makeStore()).states;
    squares.forEach((sq, t) => {
      const white = Number(sq.dataset.target);
      const mover = states[t]!.to_move === 'White' ? white : -white;
      expect(mover).toBe(w.returns[t]);
      expect(Math.abs(mover - fixture.openingWin.returns[t]!)).toBeLessThanOrEqual(1e-5);
    });
    expect($$(el, '.td-table .target-cell').slice(0, T).map((c) => c.textContent)).toEqual(w.white.targets.map((x) => signedNote('en', x)));
    expect($$(el, '.cell.targets').slice(0, T).map((c) => c.textContent)).toEqual(w.white.targets.map((x) => signedNote('en', x)));
  });

  it('walks backwards: the result first, then each target from the next, its sum written and its two sources marked', async () => {
    const el = await mount('fr');
    expect(said(el).textContent).toContain('Les cibles se calculent depuis la fin.');
    expect($$(el, '.mk.target.known')).toHaveLength(0);
    role(el, 'next').click();
    expect(said(el).querySelector('.step-head')!.textContent).toBe('Après 8 coups, Blanc au trait');
    expect(said(el).querySelector('.calc')!.textContent).toBe('cible = résultat = +1,00');
    // The target is this position’s, not the next one’s.
    expect(said(el).querySelector('.step-text')!.textContent).toBe('La position suivante est la fin de la partie : la cible de cette position est le résultat.');
    expect($$(el, '.mk.target.known').map((x) => x.dataset.t)).toEqual(['8']);
    role(el, 'next').click();
    const w = tdWalk(tdGame(makeStore()).states, (s) => td.value(s));
    expect(said(el).querySelector('.calc')!.textContent).toBe(
      `cible = 70 % × ${signedNote('fr', w.white.targets[8]!)} + 30 % × ${signedNote('fr', w.white.notes[8]!).replace(/^−.*/, (x) => `(${x})`)} = ${signedNote('fr', w.white.targets[7]!)}`,
    );
    expect($$(el, '.mk.new').map((x) => x.dataset.t)).toEqual(['7']);
    expect($$(el, '.mk.src').map((x) => `${x.classList.contains('target') ? 'target' : 'note'} ${x.dataset.t}`).sort()).toEqual(['note 8', 'target 8']);
    expect($$(el, '.cell.boards.now')).toHaveLength(1);
    expect($$(el, '.cell.boards.next')).toHaveLength(1);
  });

  it('then adjusts the net, several times: the values shown are those of the real net after each of the trainer’s steps', async () => {
    const el = await mount('fr');
    const states = tdGame(makeStore()).states;
    const walks = tdRounds(states, td);
    const T = states.length - 1;
    for (let i = 0; i < T; i++) role(el, 'next').click();
    const notes = () => $$(el, '.mk.note, .mk.result').map((m) => Number(m.dataset.note));
    const targets = () => $$(el, '.mk.target').map((m) => Number(m.dataset.target));
    for (let r = 1; r <= TD_ROUNDS; r++) {
      role(el, 'next').click();
      expect(said(el).querySelector('.step-head')!.textContent).toBe(`Réglage ${r} sur ${TD_ROUNDS}`);
      // The values have moved; the targets they moved towards are still those of before.
      expect(notes()).toEqual(walks[r]!.white.notes);
      expect(targets()).toEqual(walks[r - 1]!.white.targets);
      expect($$(el, 'polyline.trace').filter((p) => p.getAttribute('points') !== '')).toHaveLength(r);
      role(el, 'next').click();
      expect(targets()).toEqual(walks[r]!.white.targets);
    }
    expect(role(el, 'next').disabled).toBe(true);
    expect($$(el, '.gap.on')).toHaveLength(T);
  });

  it('says the adjustment in the essay’s words, and the mean gap from the values themselves', async () => {
    const g = tdGame(makeStore());
    const script = tdScript(tdRounds(g.states, td));
    const T = g.states.length - 1;
    const gap = (k: number) => noteText('fr', script[k]!.gap!);
    expect(stepWords('fr', g, script, T + 1)).toEqual({
      head: 'Réglage 1 sur 5',
      text: 'Les poids du réseau sont ajustés pour rapprocher les valeurs calculées des valeurs cibles.',
      calc: `écart moyen entre note et cible : ${gap(T)} → ${gap(T + 1)}`,
    });
    expect(stepWords('fr', g, script, T + 2).text).toBe('Le réseau réglé note de nouveau la même partie : les notes ont changé, donc les cibles aussi.');
    expect(stepWords('fr', g, script, T + 3).text).toBe('Nouveau réglage : chaque note se rapproche encore de sa cible.');
    const last = script.length - 1;
    expect(stepWords('fr', g, script, last).text).toBe(`Après 5 réglages sur cette partie, l’écart moyen entre note et cible est passé de ${gap(T)} à ${gap(last)}.`);
    expect([gap(T), gap(last)]).toEqual(['0,23', '0,06']);
    expect(stepWords('en', g, script, last).text).toBe('After 5 adjustments on this game, the mean gap between value and target went from 0.23 to 0.06.');
  });

  it('holds the adjustments longer than the climb, and never rushes a short game', () => {
    expect(climbMs(10)).toBe(2000);
    expect(climbMs(4)).toBe(2200);
    expect(climbMs(60)).toBe(900);
    expect(START_MS).toBeGreaterThanOrEqual(2500);
    expect(ADJUST_MS).toBeGreaterThan(RETARGET_MS);
    expect(RETARGET_MS).toBeGreaterThanOrEqual(2500);
  });

  it('under reduced motion shows the net after its last adjustment, every earlier line as a trace, and never moves by itself', async () => {
    setMedia(REDUCED_MOTION, true);
    vi.useFakeTimers();
    const el = await (async () => {
      const p = mount('fr');
      await vi.advanceTimersByTimeAsync(0);
      return p;
    })();
    expect(playState(el)).toBe('play');
    expect($$(el, '.mk.target.known')).toHaveLength(DEFAULT_GAME.length);
    expect($$(el, 'polyline.trace').filter((p) => p.getAttribute('points') !== '')).toHaveLength(TD_ROUNDS);
    expect(role(el, 'next').disabled).toBe(true);
    const text = said(el).textContent;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(said(el).textContent).toBe(text);
  });

  it('stepWords: the first words', () => {
    const g = tdGame(makeStore());
    const script = tdScript(tdRounds(g.states, td));
    expect(stepWords('en', g, script, 0).text).toBe('The game is over and the net has valued every position. The targets are computed from the end.');
  });
});
