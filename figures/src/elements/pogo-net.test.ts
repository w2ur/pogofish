import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { key, type State } from '../engine';
import { formatShare } from '../kit/score';
import { parseAz, parseTd, type TdNet } from '../nets';
import { createStore } from '../store';
import { intersect, resetMedia, shownText } from '../test-dom';
import { PogoNet } from './pogo-net';
import { signedNote } from './q-steps';

if (!customElements.get('pogo-net')) customElements.define('pogo-net', PogoNet);

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as {
  positions: { label: string; state: State; az: { value: number }; td: number; legal: number[][]; priors: number[] }[];
};
const bytes = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const az = parseAz(bytes('az-lc1-s1.pfw'));
const td = parseTd(bytes('td-s1.pfv'));
const flush = () => new Promise((r) => setTimeout(r, 0));
const makeStore = () => createStore({ storage: null, loadEngine: () => Promise.resolve() });
/** The default position: DEFAULT_GAME after three moves, in the fixture as « openingWin ply 3 ». */
const DEFAULT = fixture.positions.find((p) => p.label === 'openingWin ply 3')!;
const cell = (i: number) => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;

async function mount(kind: string, lang = 'fr'): Promise<PogoNet> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-net') as PogoNet;
  el.setAttribute('kind', kind);
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: Element, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const units = (el: Element) => $$(el, '.layer').map((l) => Number(l.dataset.units));

beforeEach(() => {
  resetMedia();
  PogoNet.deps = { store: makeStore(), az: () => Promise.resolve(az), td: () => Promise.resolve(td) };
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-net>', () => {
  it('says the preference bars’ scale under their table, in its own text, and never names a net by its code name', async () => {
    const td1 = await mount('td', 'en');
    expect(td1.shadowRoot!.textContent).not.toContain('v4-td-lc1-s1');
    expect(td1.shadowRoot!.querySelector('.policy')).toBeNull();
    const az1 = await mount('az', 'fr');
    const scale = $(az1, '.policy .scale-note');
    expect(scale.textContent).toBe('Chaque barre va de 0 à 100\u202f%.');
    expect(scale.previousElementSibling!.classList.contains('ranked')).toBe(true);
    expect(az1.shadowRoot!.textContent).not.toContain('az-lc1-s1');
  });

  it('layer sizes come from the header: TD 127 → 128 → 64 → 1, AZ 127 → 256 → 128 then 128 → 243 and 128 → 1', async () => {
    expect(units(await mount('td'))).toEqual([127, 128, 64, 1]);
    const a = await mount('az', 'en');
    expect(units(a)).toEqual([127, 256, 128, 128, 243, 128, 1]);
    expect($$(a, '.link').map((l) => l.textContent)).toContain('128 × 243 connections, each with its weight');
  });

  it('a doctored header changes the diagram', async () => {
    const doctored: TdNet = {
      value: () => 0.25,
      header: {
        features: 'mover-relative-repetition',
        layers: [
          { name: 'td_fc0', inputs: 127, outputs: 200 },
          { name: 'td_fc1', inputs: 200, outputs: 32 },
          { name: 'td_out', inputs: 32, outputs: 1 },
        ],
        weights: 31_891,
      },
    };
    PogoNet.deps = { ...PogoNet.deps, td: () => Promise.resolve(doctored) };
    const el = await mount('td', 'en');
    expect(units(el)).toEqual([127, 200, 32, 1]);
    // One scale: the widest layer fills its track.
    expect($$(el, '.layer .bar').map((b) => b.style.width)).toEqual(['63.500%', '100.000%', '16.000%', '0.500%']);
    expect($(el, '.value-number').textContent).toBe('+0.25');
  });

  it('pogo-net kind="az" shows the fixture’s priors and value for a fixture position', async () => {
    const el = await mount('az');
    expect($(el, '.net').dataset.position).toBe(key(DEFAULT.state));
    const rows = $$(el, '.policy tbody tr');
    expect(rows).toHaveLength(DEFAULT.legal.length);
    const shown = new Map(rows.map((r) => [r.dataset.move, r.querySelector('.value')!.textContent]));
    DEFAULT.legal.forEach(([a, n, b], i) => {
      expect(shown.get(`${cell(a!)}-${n}-${cell(b!)}`)).toBe(formatShare('fr', DEFAULT.priors[i]!));
    });
    expect($(el, '.value-number').textContent).toBe(signedNote('fr', DEFAULT.az.value));
    // Each move name explains itself and, explained, marks its stack and landing on the board.
    const name = rows[0]!.querySelector<HTMLElement>('th .move-name')!;
    // The row's move, read from its name: « a3-1-b3 ».
    const [from, n, to] = rows[0]!.dataset.move!.split('-');
    expect(name.querySelector('[role="tooltip"]')!.textContent).toBe(`De ${from}, ${n} ${n === '1' ? 'pièce' : 'pièces'}, vers ${to}.`);
    name.dispatchEvent(new PointerEvent('pointerenter'));
    const cellIndex = (c: string): string => String('abc'.indexOf(c[0]!) + 3 * (Number(c[1]) - 1));
    expect([...el.shadowRoot!.querySelectorAll('.board-slot .mark.picked')].map((m) => m.getAttribute('data-cell'))).toEqual([cellIndex(from!)]);
    expect([...el.shadowRoot!.querySelectorAll('.board-slot .mark.target')].map((m) => m.getAttribute('data-cell'))).toEqual([cellIndex(to!)]);
    name.dispatchEvent(new PointerEvent('pointerleave'));
    expect(el.shadowRoot!.querySelectorAll('.board-slot .mark')).toHaveLength(0);
    expect($(el, '.policy .note').textContent).toBe(
      `Les ${DEFAULT.legal.length} coups légaux se partagent 100 % ; les ${243 - DEFAULT.legal.length} autres sorties, des coups illégaux ici, comptent pour 0.`,
    );
  });

  it('pogo-net kind="td" shows the TD net’s value for the position, on its scale, never as a share of games', async () => {
    const el = await mount('td');
    expect($(el, '.value-number').textContent).toBe(signedNote('fr', DEFAULT.td));
    const words = $(el, '.value-view .note').textContent!;
    expect(words).toContain('De −1, la défaite, à +1, la victoire, pour le joueur au trait (Rouge).');
    expect($(el, '.value-view').textContent).not.toMatch(/%/);
    expect($(el, '.where-from').textContent).toBe('Position : l’erreur d’ouverture, après 3 coups.');
  });

  it('follows the store: a move on the board changes the position, the value and the words', async () => {
    const s = makeStore();
    PogoNet.deps = { ...PogoNet.deps, store: s };
    const el = await mount('td', 'en');
    const before = $(el, '.net').dataset.position;
    s.newGame('White', 'normal');
    s.play(DEFAULT_GAME[0]!);
    expect($(el, '.net').dataset.position).not.toBe(before);
    expect($(el, '.where-from').textContent).toBe('Position: the game on the board, after 1 move.');
    expect($(el, '.value-number').textContent).toBe(signedNote('en', td.value(s.current()!.states[1]!)));
    expect($(el, '.hint').hasAttribute('data-off')).toBe(true);
  });

  it('kind="az" with a net that fails reserves no room: one line and its fallback', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      PogoNet.deps = { ...PogoNet.deps, az: () => Promise.reject(new Error('pogo-figures: nets/az-lc1-s1.pfw did not load in 30000 ms')) };
      const el = await mount('az', 'en');
      expect(el.hasAttribute('data-failed')).toBe(true);
      const stage = $(el, '.stage');
      expect(stage.textContent).toBe('This figure could not be computed.');
      expect(stage.style.getPropertyValue('--_stage-min')).toBe('0px');
      // net.css's own reserve for kind="az" is a :host rule on .stage, which the kit overrides when failed.
      const css = readFileSync(resolve(process.cwd(), 'src/elements/net.css'), 'utf8');
      expect(css).toMatch(/:host\(pogo-net\[kind='az'\]\) \.stage \{\s*min-height: \d+px;/);
      expect(css).not.toMatch(/min-height: \d+px !important/);
    } finally {
      error.mockRestore();
    }
  });

  it('stops following the store once disconnected', async () => {
    const s = makeStore();
    const on = vi.spyOn(s, 'on');
    PogoNet.deps = { ...PogoNet.deps, store: s };
    const el = await mount('td');
    const off = on.mock.results[0]!.value as () => boolean;
    el.parentElement!.removeChild(el);
    // Already unsubscribed by the figure: a second unsubscribe finds nothing.
    expect(off()).toBe(false);
  });
});

describe('<pogo-net kind="az">, ten moves at most', () => {
  /** A position with three legal moves, Red to move. */
  const FEW: State = {
    cells: [[], ['Red'], [], ['White', 'White', 'Red', 'White', 'Red', 'Red', 'White', 'White', 'Red', 'Red', 'White'], [], [], [], [], []],
    to_move: 'Red',
    move_count: 0,
    history: [],
  };
  const shown = (el: Element) => $$(el, '.ranked > table > tbody > tr');

  it('16 legal moves: ten rows, the six others behind « Les 6 autres coups » with their share', async () => {
    const s = makeStore();
    PogoNet.deps = { ...PogoNet.deps, store: s };
    s.newGame('White', 'normal');
    const el = await mount('az');
    expect(shown(el)).toHaveLength(10);
    expect(shown(el).every((r) => !r.classList.contains('blank'))).toBe(true);
    expect($$(el, '.others tbody tr')).toHaveLength(6);
    // The hidden moves' share, from the net itself.
    const { priors } = az.evaluate(s.current()!.states[0]!);
    const sorted = [...priors.values()].sort((a, b) => b - a);
    const share = sorted.slice(10).reduce((a, b) => a + b, 0);
    expect($(el, '.others-summary').textContent).toBe(`Les 6 autres coups, ${formatShare('fr', share)} de la préférence du réseau`);
    expect(($(el, '.others') as HTMLDetailsElement).open).toBe(false);
  });

  it('3 legal moves: three rows and seven blank ones, the disclosure kept but unseen', async () => {
    const s = makeStore();
    PogoNet.deps = { ...PogoNet.deps, store: s };
    s.playFrom(FEW, 'test');
    const el = await mount('az');
    expect(shown(el)).toHaveLength(10);
    expect(shown(el).filter((r) => r.classList.contains('blank'))).toHaveLength(7);
    // A blank row holds no move name and no number, should its stylesheet not load.
    for (const r of shown(el).filter((x) => x.classList.contains('blank'))) expect(r.textContent!.trim()).toBe('');
    expect($(el, '.others').hasAttribute('data-none')).toBe(true);
  });
});
