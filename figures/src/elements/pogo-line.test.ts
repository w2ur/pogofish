import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { intersect, leave, playState, resetMedia, shownText } from '../test-dom';
import type { TableData } from '../data';
import { key, replay } from '../engine';
import type { PlayFromDetail } from '../kit/figure';
import { LOOP_REST, PogoLine } from './pogo-line';

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
const current = (el: PogoLine) => shownText(el.shadowRoot!.querySelector('.said:not([data-off])')!);
const counter = (el: PogoLine) => role(el, 'counter').textContent;

beforeEach(() => resetMedia());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-line>', () => {
  it('starts by itself once half of it is on screen, pauses when it leaves, and resumes when it comes back', async () => {
    const el = await mount('shortestWin', 'A');
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
    const el = await mount('shortestWin', 'A');
    intersect(el);
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-role="play"]')!.click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
    el.remove();
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
    expect(el.shadowRoot!.querySelector('.said:not([data-off]) .move-name [role="tooltip"]')!.textContent).toBe('De a1, 2 pièces, vers b2.');
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
      // The loop rests on its last position before it goes round again.
      vi.advanceTimersByTime(1100 + LOOP_REST - 1);
      expect(counter(el)).toBe('4 / 4');
      vi.advanceTimersByTime(1);
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
    expect(current(el)).toContain('Retour au départ');
    vi.advanceTimersByTime(1100 * 3 + LOOP_REST);
    expect(counter(el)).toBe('3 / 4');
    expect(role(el, 'play').getAttribute('aria-label')).toBe('Pause');
    expect(el.shadowRoot!.textContent).not.toContain('Cette position pour la');
  });

  it('under lc1-2 the loop counts repetitions and Red loses at the third', async () => {
    const el = await mount('loop', 'lc1-2', 'en');
    for (let i = 0; i < 4; i++) role(el, 'next').click();
    expect(current(el)).toContain('This position for the 2nd time');
    for (let i = 0; i < 4; i++) role(el, 'next').click();
    expect(counter(el)).toBe('8 / 8');
    // The end says two lines over the board: the stamp, and how; the live region says the move and the count too.
    expect(current(el)).toBe('White winsRed repeated a position three times.');
    expect(el.shadowRoot!.querySelector('[role="status"]')!.textContent).toContain('This position for the 3rd time');
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
