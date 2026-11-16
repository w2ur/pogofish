import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableData } from '../data';
import { key, replay } from '../engine';
import type { PlayFromDetail } from '../kit/figure';
import { intersect, resetMedia } from '../test-dom';
import { PogoLine } from './pogo-line';

if (!customElements.get('pogo-line')) customElements.define('pogo-line', PogoLine);
const table = JSON.parse(readFileSync('public/data/table.json', 'utf8')) as TableData;
PogoLine.deps = { engine: () => Promise.resolve(), table: () => Promise.resolve(table) };

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(line: string, rules: string, lang = 'fr'): Promise<PogoLine> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-line') as PogoLine;
  el.setAttribute('line', line);
  el.setAttribute('rules', rules);
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: PogoLine, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const role = (el: PogoLine, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
const current = (el: PogoLine) => el.shadowRoot!.querySelector('.said:not([data-off])')!.textContent;
const counter = (el: PogoLine) => role(el, 'counter').textContent;

beforeEach(() => resetMedia());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-line>', () => {
  it('labels the engine’s lines as computed live, under the game of its rules', async () => {
    for (const line of ['shortestWin', 'loop']) {
      expect($(await mount(line, 'A', 'en'), '.fidelity').textContent).toBe('Computed live · game with no stopping rule');
      expect($(await mount(line, 'lc1-2', 'en'), '.fidelity').textContent).toBe('Computed live · repetition rule (lc1-2)');
    }
  });

  it('labels the table’s lines as measured under game A only: the table says nothing of lc1-2', async () => {
    for (const line of ['centreLoss', 'openingWin']) {
      const a = await mount(line, 'A', 'en');
      expect($(a, '.fidelity').textContent).toBe('Measured data · game with no stopping rule · source: v3-solve/table.bin');
      expect($(a, '.fidelity .source').textContent).toBe('v3-solve/table.bin');
      expect($(await mount(line, 'lc1-2', 'en'), '.fidelity').textContent).toBe('Computed live · repetition rule (lc1-2)');
    }
  });

  it('a bad rules attribute shows the fallback rather than the wrong game', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await mount('loop', 'B');
    expect(el.hasAttribute('data-failed')).toBe(true);
    expect(el.shadowRoot!.querySelector('slot')!.hidden).toBe(false);
    error.mockRestore();
  });

  it('steps through centreLoss to Red’s win', async () => {
    const el = await mount('centreLoss', 'A');
    expect(current(el)).toBe('Position de départ');
    expect(counter(el)).toBe('0 / 12');
    role(el, 'next').click();
    expect(current(el)).toBe('Blanc joue a1-2-b2');
    for (let i = 0; i < 11; i++) role(el, 'next').click();
    expect(current(el)).toContain('Rouge gagne');
    expect(current(el)).toContain('Toutes les piles ont un sommet rouge.');
    expect(role(el, 'action').disabled).toBe(true);
  });

  it('the loop’s wrap, last frame to first move, moves its piece like any step forward', async () => {
    const proto = Element.prototype as unknown as { animate?: unknown };
    const had = proto.animate;
    const animate = vi.fn();
    proto.animate = animate;
    try {
      const el = await mount('loop', 'A');
      for (let i = 0; i < 4; i++) role(el, 'next').click();
      const forward = animate.mock.calls.length;
      expect(forward).toBeGreaterThan(0);
      vi.useFakeTimers();
      role(el, 'play').click();
      vi.advanceTimersByTime(1100);
      expect(counter(el)).toBe('1 / 4');
      // One disc moved: its cut-out, the disc and its ring, as on any forward step.
      expect(animate.mock.calls.length).toBe(forward + 3);
    } finally {
      proto.animate = had;
    }
  });

  it('under game A the loop plays on without end and counts nothing', async () => {
    const el = await mount('loop', 'A');
    vi.useFakeTimers();
    role(el, 'play').click();
    vi.advanceTimersByTime(1100 * 4);
    expect(counter(el)).toBe('4 / 4');
    expect(current(el)).toContain('De retour à la position de départ');
    vi.advanceTimersByTime(1100 * 3);
    expect(counter(el)).toBe('3 / 4');
    expect(role(el, 'play').textContent).toBe('Pause');
    expect(el.shadowRoot!.textContent).not.toContain('Cette position pour la');
  });

  it('under lc1-2 the loop counts repetitions and Red loses at the third', async () => {
    const el = await mount('loop', 'lc1-2', 'en');
    for (let i = 0; i < 4; i++) role(el, 'next').click();
    expect(current(el)).toContain('This position for the 2nd time');
    for (let i = 0; i < 4; i++) role(el, 'next').click();
    expect(counter(el)).toBe('8 / 8');
    expect(current(el)).toContain('This position for the 3rd time');
    expect(current(el)).toContain('White wins');
    expect(current(el)).toContain('Red produced a position for the third time');
  });

  it('« Jouer d’ici » hands the shown position to the board, named by line and ply', async () => {
    const el = await mount('openingWin', 'A');
    const got: PlayFromDetail[] = [];
    document.addEventListener('pogo:playfrom', (e) => got.push((e as CustomEvent<PlayFromDetail>).detail), { once: true });
    role(el, 'next').click();
    role(el, 'next').click();
    role(el, 'action').click();
    expect(got).toHaveLength(1);
    expect(got[0]!.label).toBe('l’erreur d’ouverture, coup 2');
    expect(key(got[0]!.state)).toBe(key(replay(table.lines.openingWin.slice(0, 2)).at(-1)!));
  });

  it('an aborted signal stops a running line', async () => {
    const el = await mount('loop', 'A');
    vi.useFakeTimers();
    role(el, 'play').click();
    vi.advanceTimersByTime(1100);
    const shown = $(el, '.counter');
    expect(shown.textContent).toBe('1 / 4');
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(1100 * 10);
    expect(shown.textContent).toBe('1 / 4');
    expect(vi.getTimerCount()).toBe(0);
  });
});
