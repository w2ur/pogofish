import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { features, key, type Triple } from '../engine';
import { parseAz, parseTd } from '../nets';
import { createStore, type Store } from '../store';
import { intersect, resetMedia } from '../test-dom';
import { PogoEncoding, inputText } from './pogo-encoding';
import { PogoNet } from './pogo-net';

if (!customElements.get('pogo-encoding')) customElements.define('pogo-encoding', PogoEncoding);
if (!customElements.get('pogo-net')) customElements.define('pogo-net', PogoNet);

const bytes = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const az = parseAz(bytes('az-lc1-s1.pfw'));
const td = parseTd(bytes('td-s1.pfv'));
const flush = () => new Promise((r) => setTimeout(r, 0));
const makeStore = () => createStore({ storage: null, loadEngine: () => Promise.resolve() });
const LOOP: Triple[] = [
  [0, 1, 1],
  [6, 1, 3],
  [1, 1, 0],
  [3, 1, 6],
];

function use(s: Store): void {
  PogoEncoding.deps = { store: s };
  PogoNet.deps = { store: s, az: () => Promise.resolve(az), td: () => Promise.resolve(td) };
}

async function mount(tag: string, lang = 'fr', attrs: Record<string, string> = {}): Promise<HTMLElement> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await flush();
  return el;
}

const $ = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: Element, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const rowValues = (el: Element, i: number) => {
  const row = $(el, `.enc-row[data-row="${i}"]`);
  return [...row.querySelectorAll('.slot, .c-top, .c-height')].map((c) => c.textContent);
};

beforeEach(() => {
  resetMedia();
  use(makeStore());
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-encoding>', () => {
  it('is computed live under lc1-2', async () => {
    const el = await mount('pogo-encoding', 'en');
    expect($(el, '.fidelity').textContent).toBe('Computed live · repetition rule (lc1-2)');
    expect($(el, '.total').textContent).toBe('9 cells × 14 + 1 = 127 numbers');
  });

  it('shows the 127 inputs of features(): nine rows of 14, in the order of the cells', async () => {
    const el = await mount('pogo-encoding');
    const s = makeStore();
    const x = Array.from(features(JSON.parse(JSON.stringify((await import('./net-position')).netPosition(s).state))));
    for (let i = 0; i < 9; i++) {
      expect($(el, `.enc-row[data-row="${i}"] .cell-name`).textContent).toBe(`${'abc'[i % 3]}${Math.floor(i / 3) + 1}`);
      expect(rowValues(el, i)).toEqual(x.slice(i * 14, i * 14 + 14).map((v) => inputText('fr', v)));
    }
    expect($(el, '.key').textContent).toBe('Rouge au trait : +1 = pièce rouge, −1 = pièce blanche, 0 = pas de pièce.');
  });

  it('encoding row 9 is the repetition count: earlier occurrences of the position, ÷ 2', async () => {
    const s = makeStore();
    use(s);
    const el = await mount('pogo-encoding', 'fr');
    const rep = () => $(el, '[data-row="9"] .rep-value');
    expect(rep().textContent).toBe('0');
    s.newGame('White', 'normal');
    // The loop: four moves back to the starting position, seen once before.
    for (const m of LOOP) s.play(m);
    expect(features(s.current()!.states[4]!)[126]).toBe(0.5);
    expect(rep().textContent).toBe('0,5');
    expect(rep().title).toBe('1 ÷ 2');
  });

  it('a slot holding a piece takes that piece’s colour; an empty slot is none', async () => {
    const el = await mount('pogo-encoding');
    // The default position, Red to move: b1 holds White, White, Red… read from the state.
    const s = (await import('./net-position')).netPosition(makeStore()).state;
    s.cells.forEach((stack, i) => {
      const slots = $$(el, `.enc-row[data-row="${i}"] .slot`);
      stack.forEach((piece, k) => expect(slots[k]!.classList.contains(piece === 'Red' ? 'red' : 'white')).toBe(true));
      slots.slice(stack.length).forEach((x) => expect(x.classList.contains('none')).toBe(true));
    });
  });

  it('the colours are the pieces’ with White to move too, where +1 is a White piece', async () => {
    const st = makeStore();
    use(st);
    st.newGame('White', 'normal');
    const el = await mount('pogo-encoding');
    const s = st.current()!.states[0]!;
    expect(s.to_move).toBe('White');
    s.cells.forEach((stack, i) => {
      const slots = $$(el, `.enc-row[data-row="${i}"] .slot`);
      stack.forEach((piece, k) => {
        expect(slots[k]!.classList.contains(piece === 'Red' ? 'red' : 'white')).toBe(true);
        // The mover's piece is +1: a White piece here.
        expect(slots[k]!.textContent).toBe(piece === 'White' ? '+1' : '−1');
      });
    });
    expect($(el, '.key').textContent).toBe('Blanc au trait : +1 = pièce blanche, −1 = pièce rouge, 0 = pas de pièce.');
  });

  it('a tap on a cell marks its row, and a tap on a row marks its cell', async () => {
    const el = await mount('pogo-encoding');
    const cellButton = (i: number) => $(el, `.cell-button[data-cell="${i}"]`) as HTMLButtonElement;
    cellButton(4).click();
    expect($(el, '.enc-row[data-row="4"]').classList.contains('on')).toBe(true);
    expect($(el, '.board .mark.picked').getAttribute('data-cell')).toBe('4');
    ($(el, '.enc-row[data-row="7"] .cell-name') as HTMLButtonElement).click();
    expect($(el, '.enc-row[data-row="4"]').classList.contains('on')).toBe(false);
    expect(cellButton(7).getAttribute('aria-pressed')).toBe('true');
    expect($$(el, '.board .mark.picked').map((m) => m.getAttribute('data-cell'))).toEqual(['7']);
    // A second tap clears it.
    cellButton(7).click();
    expect($$(el, '.enc-row.on')).toHaveLength(0);
  });

  it('pogo-net kind="td" and pogo-encoding show the same position, and both change when the store’s game changes', async () => {
    const s = makeStore();
    use(s);
    const net = await mount('pogo-net', 'fr', { kind: 'td' });
    const enc = await mount('pogo-encoding', 'fr');
    const shown = () => [$(net, '.net').dataset.position, $(enc, '.encoding').dataset.position];
    const [a, b] = shown();
    expect(a).toBe(b);
    expect($(net, '.where-from').textContent).toBe($(enc, '.where-from').textContent);
    s.newGame('White', 'normal');
    s.play(DEFAULT_GAME[0]!);
    const [c, d] = shown();
    expect(c).toBe(d);
    expect(c).not.toBe(a);
    expect(c).toBe(key(s.current()!.states[1]!));
    expect($(enc, '.where-from').textContent).toBe('Position : votre partie, après 1 coup.');
  });
});

describe('inputText', () => {
  it('writes the inputs as the essay names them', () => {
    expect([1, -1, 0, 0.25, 1 / 12, 0.5, 1].map((x) => inputText('fr', Math.fround(x)))).toEqual(['+1', '−1', '0', '0,25', '0,08', '0,5', '+1']);
    expect(inputText('en', 0.25)).toBe('0.25');
  });
});
