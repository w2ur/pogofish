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
import { ADJUST_MS, CLIMB_READ_MS, CLIMB_READ_STEPS, PogoTdTargets, RETARGET_MS, START_MS, TICKS_MAX, climbHold, stepWords } from './pogo-td-targets';
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
const texts = (el: Element, s: string) => $$(el, s).map((x) => x.textContent);
const long = (): Triple[] => (JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/v5.json'), 'utf8')) as V5Data).programs.qtab.stages.at(-1)!.game;
const sheet = () => readFileSync(resolve(process.cwd(), 'src/elements/pogo-td-targets.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

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

  it('puts the transport right under the film it steps, then the legend, then the side everything is read from', async () => {
    const el = await mount('fr');
    expect($(el, '.film').nextElementSibling!.classList.contains('controls')).toBe(true);
    expect($(el, '.controls').nextElementSibling!.classList.contains('legend')).toBe(true);
    // The essay: « toutes les notes étant ici prises du point de vue des Blancs ».
    expect($(el, '.legend').nextElementSibling!.textContent).toBe('Toutes les notes sont prises du point de vue des Blancs\u202f: +1, ils gagnent\u202f; −1, ils perdent.');
    expect($(el, '.view').nextElementSibling!.classList.contains('sr')).toBe(true);
    expect(texts(el, '.legend li')).toEqual(['note du réseau', 'cible', 'résultat', 'notes avant réglage', 'écart entre une note et sa cible']);
  });

  // The owner, 2026-11-17 (round 4): the rows « note du réseau » and « cible » stood still while the curves moved,
  // and the table of values said again what the curves say. Round 5: « on ne comprend pas d'où sortent les chiffres
  // de la formule ». So no row of every value: only the two positions the step reads, under a glass.
  it('has no row of every value and no table: two positions under a glass carry the numbers the step uses', async () => {
    const el = await mount('fr');
    expect($$(el, '.cell.notes, .cell.targets, .row-name.notes, .row-name.targets')).toHaveLength(0);
    expect($$(el, 'details, table, .td-table')).toHaveLength(0);
    expect($$(el, '.zoom .zcol')).toHaveLength(2);
    expect($$(el, '.said .calc')).toHaveLength(0);
  });

  it('pogo-td-targets uses lastFinished when there is one, DEFAULT_GAME otherwise, and says which', async () => {
    const s = makeStore();
    use(s);
    const el = await mount('fr');
    expect($(el, '.where-from').textContent).toBe('Partie : l’erreur d’ouverture, 9 coups, victoire des Blancs.');
    expect($$(el, '.mk.note, .mk.result')).toHaveLength(DEFAULT_GAME.length + 1);
    expect($(el, '.hint').hasAttribute('data-off')).toBe(false);
    s.newGame('Red', 'easy');
    for (const m of [...LOOP, ...LOOP]) s.play(m);
    expect($(el, '.where-from').textContent).toBe('Partie : la dernière partie terminée du plateau, 8 coups, victoire des Blancs.');
    expect($$(el, '.mk.note, .mk.result')).toHaveLength(9);
    expect($(el, '.hint').hasAttribute('data-off')).toBe(true);
  });

  it('a game under way changes nothing: only a finished game is taken', async () => {
    const s = makeStore();
    use(s);
    const el = await mount('fr');
    const film = $(el, '.film');
    s.newGame('White', 'normal');
    s.play(DEFAULT_GAME[0]!);
    expect($(el, '.film')).toBe(film);
  });

  it('lays the chart’s marks and the positions’ numbers on one column per position, and no strip of boards', async () => {
    const el = await mount('fr');
    const n = DEFAULT_GAME.length + 1;
    expect(n).toBeLessThanOrEqual(TICKS_MAX);
    expect($(el, '.film').style.getPropertyValue('--n')).toBe(String(n));
    expect($$(el, '.cell.boards, .row.boards')).toHaveLength(0);
    expect(texts(el, '.cell.ticks')).toEqual(Array.from({ length: n }, (_, i) => String(i)));
    expect($$(el, '.mk.note')).toHaveLength(n - 1);
    expect($$(el, '.mk.result')).toHaveLength(1);
    expect($(el, '.axis-x').textContent).toBe('positions de la partie, dans l’ordre');
  });

  it('a long game keeps the chart, names only the ends of its axis, and the glass still shows its two positions', async () => {
    const s = makeStore();
    use(s);
    s.newGame('Red', 'easy');
    // A real 22-move game: the one the bench kept for Q-learning's last stage.
    const game = long();
    expect(game.length + 1).toBeGreaterThan(TICKS_MAX);
    for (const m of game) s.play(m);
    const el = await mount('fr');
    expect($(el, '.where-from').textContent).toContain(`${game.length} coups`);
    expect($$(el, '.mk.note')).toHaveLength(game.length);
    expect(texts(el, '.cell.ticks').filter(Boolean)).toEqual(['0', String(game.length)]);
    role(el, 'next').click();
    role(el, 'next').click();
    expect(texts(el, '.ztitle')).toEqual([`Position ${game.length - 2}`, `Position ${game.length - 1}`]);
    expect($$(el, '.zboard svg')).toHaveLength(2);
  });

  // The owner's decision (round 4): positive is ink, negative is red.
  it('a negative value is marked as one wherever it is written', async () => {
    const s = makeStore();
    use(s);
    s.newGame('Red', 'easy');
    for (const m of long()) s.play(m);
    const el = await mount('fr');
    let negatives = 0;
    while (!role(el, 'next').disabled) {
      role(el, 'next').click();
      for (const v of $$(el, '.zval, .sval')) {
        const negative = v.textContent!.startsWith('−');
        expect(v.dataset.sign === 'negative', v.textContent!).toBe(negative);
        if (negative) negatives++;
      }
    }
    expect(negatives).toBeGreaterThan(0);
    expect(sheet()).toMatch(/\[data-sign='negative'\] \{[^}]*color: var\(--_red-text\)/);
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
    expect(squares.map((sq) => Number(sq.dataset.target))).toEqual(w.white.targets);
  });

  it('starts on the end of the game: the last two positions under the glass, no target yet, nothing used', async () => {
    const el = await mount('fr');
    expect(said(el).textContent).toContain('Les cibles se calculent depuis la fin.');
    expect($$(el, '.mk.target.known')).toHaveLength(0);
    expect(texts(el, '.ztitle')).toEqual(['Position 8', 'Position 9']);
    // Which of the two is the next one is said under its name, so the two boards stay level.
    expect(texts(el, '.zsub')).toEqual(['', 'la suivante']);
    expect(texts(el, '.zcol.now .zrow[data-kind] .zlabel')).toEqual(['note du réseau', 'cible']);
    expect($(el, '.zcol.now .zrow[data-kind="target"] .zval').textContent).toBe('?');
    expect(texts(el, '.zcol.next .zrow[data-kind] .zlabel')).toEqual(['résultat']);
    expect($(el, '.zcol.next .zrow[data-kind="result"] .zval').textContent).toBe('+1,00');
    expect($$(el, '.zrow.used, .zrow.new, .srow')).toHaveLength(0);
    expect($$(el, '.gap-values')).toHaveLength(0);
  });

  it('walks backwards: the result first, then each target as a sum whose every term is framed where it is read', async () => {
    const el = await mount('fr');
    const w = tdWalk(tdGame(makeStore()).states, (s) => td.value(s));
    role(el, 'next').click();
    expect(said(el).querySelector('.step-head')!.textContent).toBe('Cible de la position 8');
    // The target is this position’s, not the next one’s.
    expect(said(el).querySelector('.step-text')!.textContent).toBe('La position suivante est la fin de la partie : la cible de cette position est le résultat.');
    expect($$(el, '.mk.target.known').map((x) => x.dataset.t)).toEqual(['8']);
    expect($$(el, '.zrow.used').map((r) => `${r.closest('.zcol')!.classList.contains('next') ? 'next' : 'now'} ${r.dataset.kind}`)).toEqual(['next result']);
    expect($$(el, '.zrow.new').map((r) => `${r.closest('.zcol')!.classList.contains('next') ? 'next' : 'now'} ${r.dataset.kind} ${r.querySelector('.zval')!.textContent}`)).toEqual(['now target +1,00']);
    expect($$(el, '.srow').map((r) => [...r.children].map((c) => c.textContent).filter(Boolean).join(' | '))).toEqual(['+1,00 | résultat de la partie', '= | +1,00 | cible de la position 8']);
    expect($(el, '[role="status"]').textContent).toBe('Cible de la position 8. La position suivante est la fin de la partie : la cible de cette position est le résultat. cible = résultat = +1,00.');

    role(el, 'next').click();
    const note = signedNote('fr', w.white.notes[8]!);
    const next = signedNote('fr', w.white.targets[8]!);
    const target = signedNote('fr', w.white.targets[7]!);
    expect(said(el).querySelector('.step-head')!.textContent).toBe('Cible de la position 7');
    // The essay's order: « 30 % de la note par le réseau de la position suivante + 70 % de la cible suivante ».
    expect(said(el).querySelector('.step-text')!.textContent).toBe('30 % de la note du réseau pour la position suivante, plus 70 % de la cible suivante.');
    expect(texts(el, '.ztitle')).toEqual(['Position 7', 'Position 8']);
    // Both terms are read in the next position's column, framed there, and the result is written in this position's.
    expect($$(el, '.zcol.next .zrow.used').map((r) => `${r.dataset.kind} ${r.querySelector('.zval')!.textContent}`)).toEqual([`note ${note}`, `target ${next}`]);
    expect($$(el, '.zcol.now .zrow.used')).toHaveLength(0);
    expect($$(el, '.zrow.new').map((r) => `${r.closest('.zcol')!.classList.contains('now')} ${r.dataset.kind} ${r.querySelector('.zval')!.textContent}`)).toEqual([`true target ${target}`]);
    // The position's own note is there, and is not a term.
    expect($(el, '.zcol.now .zrow[data-kind="note"] .zval').textContent).toBe(signedNote('fr', w.white.notes[7]!));
    expect($$(el, '.srow').map((r) => [...r.children].map((c) => c.textContent).filter(Boolean).join(' | '))).toEqual([
      `30 % × | ${note} | note du réseau pour la position 8`,
      `+ | 70 % × | ${next} | cible de la position 8`,
      `= | ${target} | cible de la position 7`,
    ]);
    // Each term carries the mark of what it is on the chart.
    expect($$(el, '.srow .swatch').map((x) => x.className)).toEqual(['swatch note', 'swatch target', 'swatch target']);
    expect($(el, '[role="status"]').textContent).toContain(`cible = 30 % × ${note} + 70 % × ${next} = ${target}`);
    // On the chart, the same three points, and the glass stands over the two positions.
    expect($$(el, '.mk.new').map((x) => x.dataset.t)).toEqual(['7']);
    expect($$(el, '.mk.src').map((x) => `${x.classList.contains('target') ? 'target' : 'note'} ${x.dataset.t}`).sort()).toEqual(['note 8', 'target 8']);
    expect($$(el, '.cell.ticks.on').map((x) => x.textContent)).toEqual(['7', '8']);
    expect($(el, '.film').style.getPropertyValue('--cl')).toBe('70.000%');
    expect($(el, '.film').style.getPropertyValue('--cr')).toBe('90.000%');
  });

  it('a move led to the next position: its board shows it, and only it', async () => {
    const el = await mount('fr');
    role(el, 'next').click();
    role(el, 'next').click();
    expect($$(el, '.zcol.now .zboard .from, .zcol.now .zboard .to')).toHaveLength(0);
    expect($$(el, '.zcol.next .zboard .from')).toHaveLength(1);
    expect($$(el, '.zcol.next .zboard .to')).toHaveLength(1);
  });

  // Round 5: a dashed edge means « where a move left from », and nothing else. The next position's frame was dashed.
  it('frames nothing with a dashed box: only the chart’s lines are dashed', () => {
    const dashed = [...sheet().matchAll(/([^{}]+)\{[^}]*(?:dashed|dotted)[^}]*\}/g)].map((m) => m[1]!.trim());
    expect(dashed).toEqual(['.swatch.gap']);
    const strokes = [...sheet().matchAll(/([^{}]+)\{[^}]*stroke-dasharray[^}]*\}/g)].map((m) => m[1]!.trim());
    expect(strokes.every((sel) => sel.startsWith('.td-chart '))).toBe(true);
  });

  it('carries the computed target into the next column: the glass slides one position, forwards only, never under reduced motion', async () => {
    const calls: Element[] = [];
    const proto = HTMLElement.prototype as unknown as { animate?: unknown };
    const before = proto.animate;
    proto.animate = function (this: Element) {
      calls.push(this);
      return {};
    };
    try {
      const el = await mount('fr');
      role(el, 'next').click();
      expect(calls).toHaveLength(0); // the glass has not moved: same two positions as at the start
      role(el, 'next').click();
      expect(calls.map((c) => c.className)).toEqual(['zcols']);
      role(el, 'previous').click();
      expect(calls).toHaveLength(1);
      setMedia(REDUCED_MOTION, true);
      role(el, 'next').click();
      expect(calls).toHaveLength(1);
    } finally {
      proto.animate = before;
    }
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

  it('once the targets are in, the glass rests on the position farthest from its target: its numbers move with each adjustment, the mean gap beside them', async () => {
    const el = await mount('fr');
    const g = tdGame(makeStore());
    const script = tdScript(tdRounds(g.states, td));
    const T = g.states.length - 1;
    const end = script[T]!;
    const far = end.targets.map((x, i) => Math.abs(x - end.notes[i]!));
    const p = far.indexOf(Math.max(...far));
    for (let i = 0; i <= T; i++) role(el, 'next').click();
    const values = (kind: string) => $$(el, `.zrow[data-kind="${kind}"] .zval`).map((v) => v.textContent);
    const adjust = script[T + 1]!;
    expect(said(el).querySelector('.step-head')!.textContent).toBe('Réglage 1 sur 5');
    expect(texts(el, '.ztitle')).toEqual([`Position ${p}`, `Position ${p + 1}`]);
    expect($(el, '.film').style.getPropertyValue('--cl')).toBe(`${((p / (T + 1)) * 100).toFixed(3)}%`);
    expect(values('note')).toEqual([p, p + 1].map((i) => signedNote('fr', adjust.notes[i]!)));
    expect(values('target')).toEqual([p, p + 1].map((i) => signedNote('fr', adjust.targets[i]!)));
    // An adjustment moves the notes; nothing is a term of a sum any more.
    expect($$(el, '.zrow.new').map((r) => r.dataset.kind)).toEqual(['note', 'note']);
    expect($$(el, '.zrow.used, .srow')).toHaveLength(0);
    expect($(el, '.sum .gap-label').textContent).toBe('écart moyen entre note et cible');
    expect($(el, '.sum .gap-values').textContent).toBe(`${noteText('fr', end.gap!)} → ${noteText('fr', adjust.gap!)}`);
    role(el, 'next').click();
    const retarget = script[T + 2]!;
    // Then the adjusted net values the game again: the targets move.
    expect($$(el, '.zrow.new').map((r) => r.dataset.kind)).toEqual(['target', 'target']);
    expect(values('target')).toEqual([p, p + 1].map((i) => signedNote('fr', retarget.targets[i]!)));
    expect($(el, '.sum .gap-values').textContent).toBe(noteText('fr', retarget.gap!));
    // Back in the climb, the sum returns.
    role(el, 'previous').click();
    role(el, 'previous').click();
    expect($$(el, '.srow')).toHaveLength(3);
    expect($$(el, '.gap-values')).toHaveLength(0);
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

  it('holds the first sums long enough to be read, then quickens, and holds the adjustments longer still', () => {
    expect(CLIMB_READ_MS).toBeGreaterThanOrEqual(3000);
    for (let n = 1; n <= CLIMB_READ_STEPS; n++) expect(climbHold(n, 10)).toBe(CLIMB_READ_MS);
    expect(climbHold(CLIMB_READ_STEPS + 1, 10)).toBe(2000);
    expect(climbHold(CLIMB_READ_STEPS + 1, 4)).toBe(2000);
    expect(climbHold(CLIMB_READ_STEPS + 1, 60)).toBe(1100);
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
    expect($$(el, '.sum .gap-values')).toHaveLength(1);
    const text = said(el).textContent;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(said(el).textContent).toBe(text);
  });

  it('says it in English too, in the essay’s order', async () => {
    const el = await mount('en');
    const w = tdWalk(tdGame(makeStore()).states, (s) => td.value(s));
    role(el, 'next').click();
    role(el, 'next').click();
    expect(texts(el, '.zsub')).toEqual(['', 'the next one']);
    expect(said(el).querySelector('.step-head')!.textContent).toBe('Target of position 7');
    expect(said(el).querySelector('.step-text')!.textContent).toBe('30% of the net’s value for the next position, plus 70% of the next target.');
    expect(texts(el, '.slabel')).toEqual(['net’s value for position 8', 'target of position 8', 'target of position 7']);
    expect($(el, '[role="status"]').textContent).toContain(`target = 30% × ${signedNote('en', w.white.notes[8]!)} + 70% × ${signedNote('en', w.white.targets[8]!)} = ${signedNote('en', w.white.targets[7]!)}`);
    expect($(el, '.view').textContent).toBe('Every value is taken from White’s point of view: +1, White wins; −1, White loses.');
  });

  it('stepWords: the first words', () => {
    const g = tdGame(makeStore());
    const script = tdScript(tdRounds(g.states, td));
    expect(stepWords('en', g, script, 0).text).toBe('The game is over and the net has valued every position. The targets are computed from the end.');
  });
});
