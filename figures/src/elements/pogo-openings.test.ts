import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableData } from '../data';
import { initial, key, play, replay, parseMoveName, type Colour } from '../engine';
import type { PlayFromDetail } from '../kit/figure';
import { intersect, resetMedia, shownText } from '../test-dom';
import { PogoOpenings } from './pogo-openings';

if (!customElements.get('pogo-openings')) customElements.define('pogo-openings', PogoOpenings);
const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
const NNBSP = ' ';

async function mount(lang = 'fr'): Promise<PogoOpenings> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-openings') as PogoOpenings;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const $ = (el: PogoOpenings, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoOpenings, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const cell = (el: PogoOpenings, i: number) => $(el, `.cell-button[data-cell="${i}"]`) as HTMLButtonElement;
const actionable = (el: PogoOpenings) =>
  $$(el, '.cell-button[data-actionable]')
    .map((b) => Number(b.dataset.cell))
    .sort((a, b) => a - b);
const ask = (el: PogoOpenings) => $(el, '.ask').textContent;
const verdicts = (el: PogoOpenings) => $$(el, '.played li').map((li) => [shownText(li.querySelector('.move')!), li.querySelector('.verdict')!.textContent]);
/** The stacks drawn, read back from the board, each bottom first. */
const drawnCells = (el: PogoOpenings): Colour[][] =>
  Array.from({ length: 9 }, (_, i) => [...el.shadowRoot!.querySelectorAll<SVGElement>(`.board .stack[data-cell="${i}"] .disc`)].map((d) => d.dataset.colour as Colour));

/** Plays `name` on the board as a reader does: the stack, its count, the landing. */
function playMove(el: PogoOpenings, name: string): void {
  const [from, n, to] = parseMoveName(name);
  cell(el, from).click();
  $(el, `.counts [data-value="${n}"]`).click();
  cell(el, to).click();
}

const ASK_WHITE = `Jouez un premier coup des Blancs${NNBSP}: soulevez une pile, puis choisissez où la poser.`;

beforeEach(() => {
  PogoOpenings.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(table) };
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('<pogo-openings>: a tester of the first two moves', () => {
  it('opens on the start position and invites the reader to play White’s first move', async () => {
    const el = await mount();
    expect(ask(el)).toBe(ASK_WHITE);
    expect(actionable(el)).toEqual([0, 1, 2]);
    expect($$(el, '.played li')).toHaveLength(0);
    expect(drawnCells(el)).toEqual(initial().cells);
    expect(($(el, '[data-role="restart"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says what a losing first move leads to, from the solved table, then asks for Red’s reply', async () => {
    const el = await mount();
    playMove(el, 'a1-2-b2');
    expect(verdicts(el)).toEqual([['Blanc a1-2-b2', `Perd${NNBSP}: les Rouges forcent la victoire en 11 coups.`]]);
    expect(ask(el)).toBe('Jouez maintenant une réponse des Rouges.');
    // The move played stays framed on the board; Red's stacks are now the ones to lift.
    expect($(el, '.board .to').getAttribute('data-cell')).toBe('4');
    expect(actionable(el)).toEqual([6, 7, 8]);
    expect(($(el, '[data-role="restart"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('judges Red’s reply the same way, and then the board is done', async () => {
    const el = await mount();
    playMove(el, 'a1-2-b2');
    playMove(el, 'a3-2-b2');
    expect(verdicts(el)).toEqual([
      ['Blanc a1-2-b2', `Perd${NNBSP}: les Rouges forcent la victoire en 11 coups.`],
      ['Rouge a3-2-b2', `Gagne${NNBSP}: les Rouges forcent la victoire en 10 coups.`],
    ]);
    expect(ask(el)).toBe('Recommencez pour essayer d’autres coups.');
    expect(actionable(el)).toEqual([]);
    expect(drawnCells(el)).toEqual(replay([parseMoveName('a1-2-b2'), parseMoveName('a3-2-b2')]).at(-1)!.cells);
  });

  it('a first move on White’s own row avoids defeat: the game can go on without end', async () => {
    const el = await mount('en');
    playMove(el, 'c1-1-b1');
    expect(verdicts(el)).toEqual([['White c1-1-b1', 'Avoids defeat: the game can go on without end.']]);
    playMove(el, 'b3-2-b1');
    // The count is the table's, less the reply itself.
    const v = table.replies['c1-1-b1']!.find((m) => m.move.join() === parseMoveName('b3-2-b1').join())!.verdict;
    expect(v.kind).toBe('loses-in');
    expect(verdicts(el)[1]).toEqual(['Red b3-2-b1', `Loses: White forces the win in ${v.kind === 'loses-in' ? v.plies - 1 : NaN} moves.`]);
  });

  it('starts again from the start position', async () => {
    const el = await mount();
    playMove(el, 'a1-2-b2');
    playMove(el, 'a3-2-b2');
    $(el, '[data-role="restart"]').click();
    expect($$(el, '.played li')).toHaveLength(0);
    expect(ask(el)).toBe(ASK_WHITE);
    expect(actionable(el)).toEqual([0, 1, 2]);
    expect(drawnCells(el)).toEqual(initial().cells);
    expect(el.shadowRoot!.querySelector('.board .to')).toBeNull();
  });

  it('every move name carries its explanation', async () => {
    const el = await mount();
    playMove(el, 'c1-1-b1');
    expect($(el, '.played .move-name [role="tooltip"]').textContent).toBe('De c1, 1 pièce, vers b1.');
  });

  it('hands the position on the board to the playable board, with the moves played', async () => {
    const el = await mount();
    playMove(el, 'c1-1-b1');
    const seen: PlayFromDetail[] = [];
    document.addEventListener('pogo:playfrom', (e) => seen.push((e as CustomEvent<PlayFromDetail>).detail), { once: true });
    const offer = $(el, '.play-from') as HTMLButtonElement;
    expect(offer.getAttribute('aria-label')).toBe('Jouer cette position contre l’ordinateur');
    offer.click();
    expect(seen).toHaveLength(1);
    expect(key(seen[0]!.state)).toBe(key(play(initial(), parseMoveName('c1-1-b1'))));
    expect(seen[0]!.label).toBe('les premiers coups, c1-1-b1');
  });

  it('never says « nulle »: the essay speaks of a game without end', async () => {
    const el = await mount();
    playMove(el, 'c1-1-b1');
    playMove(el, 'a3-1-b3');
    expect($(el, '.openings').textContent).toContain('sans fin');
    expect($(el, '.openings').textContent).not.toMatch(/nulle/);
  });

  it('a table whose replies disagree with legal() shows the fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = JSON.parse(JSON.stringify(table)) as TableData;
    broken.replies['b1-1-b2']!.pop();
    PogoOpenings.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(broken) };
    const el = await mount();
    expect(el.hasAttribute('data-failed')).toBe(true);
  });
});
