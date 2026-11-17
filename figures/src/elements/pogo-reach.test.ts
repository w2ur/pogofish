import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReachData } from '../data';
import { intersect, leave, playState, REDUCED_MOTION, resetMedia, setMedia } from '../test-dom';
import { LEVEL_MS, PogoReach, STOP_MS } from './pogo-reach';

if (!customElements.get('pogo-reach')) customElements.define('pogo-reach', PogoReach);
const reach = JSON.parse(readFileSync('public/data/reach.json', 'utf8')) as ReachData;
const NNBSP = '\u202f';

async function mount(lang: string, reduced = false): Promise<PogoReach> {
  resetMedia();
  setMedia(REDUCED_MOTION, reduced);
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-reach') as PogoReach;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

/** As mount, with fake timers already on: the render's one await is a resolved promise. */
async function mountFake(lang: string): Promise<PogoReach> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-reach') as PogoReach;
  section.append(el);
  document.body.append(section);
  intersect(el);
  await vi.advanceTimersByTimeAsync(0);
  return el;
}

const $ = (el: PogoReach, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoReach, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const landed = (el: PogoReach): number => $$(el, 'tr.level:not(.stop)').filter((r) => !r.hasAttribute('data-off')).length;
const last = (el: PogoReach): void => {
  for (let i = 0; i < 20; i++) $(el, '[data-role="next"]').click();
};

beforeEach(() => {
  PogoReach.deps = { reach: () => Promise.resolve(reach) };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-reach>', () => {
  it('is a table of the sixteen moves and the empty seventeenth, every number written as text in the reader’s language', async () => {
    const fr = await mount('fr');
    expect($$(fr, 'tbody th').map((n) => n.textContent)).toEqual([...Array(17).keys()].map(String));
    const values = $$(fr, 'tbody .value').map((n) => n.textContent);
    expect(values[0]).toBe('1');
    expect(values[10]).toBe(`68${NNBSP}847${NNBSP}740`);
    expect(values[15]).toBe(`2${NNBSP}460`);
    expect(values[16]).toBe('0');
    expect($(fr, 'thead .ply').textContent).toBe('Coup');
    expect($(fr, '.stop-words').textContent).toBe('Plus aucune position nouvelle\u202f: l’exploration s’arrête.');
    const en = await mount('en');
    expect($$(en, 'tbody .value').map((n) => n.textContent)[10]).toBe('68,847,740');
    expect($(en, 'caption').firstChild!.textContent).toBe('Positions first seen at each move');
    expect($(en, '.reached').textContent).toBe('230,015,628reachable positions of 232,792,560 possible');
    expect($(en, '.never').textContent).toBe('2,776,932 never reached');
    expect($(en, '.possible').textContent).toBe('232,792,560 possible positions');
  });

  it('draws each bar at its share of the largest, hidden from assistive tech', async () => {
    const el = await mount('en');
    const widths = $$(el, '.bar').map((b) => parseFloat(b.style.getPropertyValue('--share')));
    expect(widths[10]).toBe(100);
    expect(widths[9]).toBeCloseTo((50327416 / 68847740) * 100, 3);
    expect($$(el, 'tr:not(.stop) .track').every((t) => t.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect($(el, '.band').getAttribute('aria-hidden')).toBe('true');
  });

  it('starts on the first level alone, and lands one level per step, the band filling with the running sum', async () => {
    const el = await mount('fr');
    expect(landed(el)).toBe(1);
    expect($(el, 'tr.stop').hasAttribute('data-off')).toBe(true);
    expect($(el, '.total').hasAttribute('data-off')).toBe(true);
    expect($(el, '[data-role="counter"]').textContent).toBe('coup 0 sur 16');
    let sum = 1;
    for (let ply = 1; ply < 16; ply++) {
      $(el, '[data-role="next"]').click();
      sum += reach.firstSeenAtPly[ply]!;
      expect(landed(el)).toBe(ply + 1);
      expect($$(el, 'tr[data-front]').map((r) => r.querySelector('th')!.textContent)).toEqual([String(ply)]);
      // The band: what was seen before in ink, what this move sees for the first time in red, side by side.
      expect(parseFloat($(el, '.fresh').style.width)).toBeCloseTo((reach.firstSeenAtPly[ply]! / reach.positionsTotal) * 100, 3);
      expect(parseFloat($(el, '.fill').style.width) + parseFloat($(el, '.fresh').style.width)).toBeCloseTo((sum / reach.positionsTotal) * 100, 3);
    }
    $(el, '[data-role="next"]').click();
    expect($(el, 'tr.stop').hasAttribute('data-off')).toBe(false);
    // Nothing new: nothing red.
    expect(parseFloat($(el, '.fresh').style.width)).toBe(0);
    expect($$(el, 'tr[data-front]:not(.stop)')).toHaveLength(0);
    expect($(el, '[data-role="counter"]').textContent).toBe('coup 16 sur 16');
    expect($(el, '.total').hasAttribute('data-off')).toBe(true);
    $(el, '[data-role="next"]').click();
    expect($(el, '.total').hasAttribute('data-off')).toBe(false);
    expect($(el, '[data-role="counter"]').textContent).toBe('total');
    expect(parseFloat($(el, '.fill').style.width)).toBeCloseTo((reach.reachable / reach.positionsTotal) * 100, 3);
  });

  it('draws the positions never reached to scale, as the rest of the band', async () => {
    const el = await mount('fr');
    last(el);
    const sliver = parseFloat($(el, '.sliver').style.width);
    const fill = parseFloat($(el, '.fill').style.width);
    expect(sliver).toBeCloseTo(((reach.positionsTotal - reach.reachable) / reach.positionsTotal) * 100, 3);
    expect(sliver + fill).toBeCloseTo(100, 6);
  });

  it('plays by itself on screen, a level every LEVEL_MS, the stop and the total held longer, then ends', async () => {
    vi.useFakeTimers();
    const el = await mountFake('fr');
    intersect(el);
    expect(playState(el)).toBe('pause');
    vi.advanceTimersByTime(LEVEL_MS * 15);
    expect(landed(el)).toBe(16);
    expect($(el, 'tr.stop').hasAttribute('data-off')).toBe(true);
    vi.advanceTimersByTime(STOP_MS);
    expect($(el, 'tr.stop').hasAttribute('data-off')).toBe(false);
    vi.advanceTimersByTime(STOP_MS);
    expect($(el, '.total').hasAttribute('data-off')).toBe(false);
    expect(playState(el)).toBe('replay');
    // Slow enough to follow: a reader could not, at 900 ms a level (dummy-visitor read, 2026-11-17).
    expect(LEVEL_MS).toBeGreaterThanOrEqual(1800);
  });

  it('pauses when it leaves the screen, and a reader’s pause holds', async () => {
    const el = await mount('fr');
    intersect(el);
    expect(playState(el)).toBe('pause');
    leave(el);
    expect(playState(el)).toBe('play');
    intersect(el);
    $(el, '[data-role="play"]').click();
    leave(el);
    intersect(el);
    expect(playState(el)).toBe('play');
  });

  it('under reduced motion, shows the finished chart and waits', async () => {
    const el = await mount('fr', true);
    intersect(el);
    expect(landed(el)).toBe(16);
    expect($(el, '.total').hasAttribute('data-off')).toBe(false);
    expect(playState(el)).toBe('play');
  });

  it('paints in red the positions never seen before: the bar of the move just explored and its part of the band, with a key', async () => {
    const el = await mount('fr');
    expect($(el, '.key').textContent).toBe('En rouge, les positions jamais vues avant ce coup');
    const css = readFileSync('src/elements/pogo-reach.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.level\[data-front\] \.bar \{[^}]*background: var\(--_red\);/);
    expect(css).toMatch(/\.fresh \{[^}]*background: var\(--_red\);/);
    expect(css).toMatch(/\.key-swatch \{[^}]*background: var\(--_red\);/);
    // Bars of moves already explored stay ink: red is only what is new.
    expect(css).toMatch(/\n\.bar \{[^}]*background: var\(--_ink\);/);
    const en = await mount('en');
    expect($(en, '.key').textContent).toBe('In red, positions never seen before this move');
  });

  // Regression: '.what .sep' gave the summary's second number twice the room of the line above
  // the band (0.12em at 15px against 0.06em at 12.8px), so its digit groups stood visibly apart.
  it('groups the digits of every number alike: one separator, one spacing rule', async () => {
    const el = await mount('fr');
    expect($$(el, '.what .sep')).toHaveLength(2);
    expect(new Set($$(el, '.sep').map((s) => s.textContent))).toEqual(new Set([NNBSP]));
    const css = readFileSync('src/elements/pogo-reach.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = (css.match(/[^{}]*\.sep[^{}]*\{[^}]*\}/g) ?? []).map((r) => r.trim().replace(/\s+/g, ' '));
    expect(rules).toEqual(['.sep { padding-inline: 0.06em; }']);
  });

  // Regression: a landed level whose bar is under a pixel (moves 0 to 5 on the linear scale) read as
  // not landed. It gets a 2px tick; a level still to come keeps none.
  it('a landed level always shows a mark: its bar is never under 2px', () => {
    const css = readFileSync('src/elements/pogo-reach.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.level:not\(\[data-off\]\) \.bar \{[^}]*min-width: 2px;/);
    expect(css).toMatch(/\.level\[data-off\] \.bar \{[^}]*width: 0;/);
  });

  // Regression: the transport sat under the total, whose room is kept empty while the levels land,
  // so ~110px of blank stood between the chart and its controls, and the row was flush left.
  it('puts the transport right under the bars it lands, centred, the band and the total after it', async () => {
    const el = await mount('fr');
    const order = [...$(el, '.reach').children].map((c) => c.className);
    expect(order).toEqual(['bars', 'controls', 'whole']);
    expect($(el, '.whole').lastElementChild!.className).toBe('total');
    const css = readFileSync('src/elements/pogo-reach.css', 'utf8');
    expect(css).toMatch(/\.reach > \.controls \{[^}]*justify-content: center;/);
  });

  it('a file that does not add up shows the fallback, not a wrong chart', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    PogoReach.deps = { reach: () => Promise.resolve({ ...reach, reachable: 1 }) };
    const el = await mount('fr');
    expect(el.hasAttribute('data-failed')).toBe(true);
    expect(el.shadowRoot!.querySelector('slot')!.hidden).toBe(false);
    error.mockRestore();
  });
});
