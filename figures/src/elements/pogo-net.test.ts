import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME } from '../default-game';
import { key, legal, play, replay, type State, type Triple } from '../engine';
import { formatShare } from '../kit/score';
import { t } from '../kit/strings';
import { parseAz, parseTd, policyIndex } from '../nets';
import { createStore, type Store } from '../store';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia } from '../test-dom';
import { LINK_ALPHA, LINK_WIDTH, flowEnd } from './net-canvas';
import { netGraph, signal } from './net-graph';
import { DEFAULT_PLY, defaultPosition } from './net-position';
import { PER_NODE, PogoNet, STEP_MS, TOP_MOVES, drawnWords, inputWords, netNumber, outputMove, positionMs, probeWords } from './pogo-net';
import { PogoEncoding } from './pogo-encoding';

if (!customElements.get('pogo-net')) customElements.define('pogo-net', PogoNet);
if (!customElements.get('pogo-encoding')) customElements.define('pogo-encoding', PogoEncoding);

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/reference.json'), 'utf8')) as {
  positions: { label: string; state: State; az: { value: number }; td: number }[];
};
const sheet = readFileSync(resolve(process.cwd(), 'src/elements/pogo-net.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const bytes = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const az = parseAz(bytes('az-lc1-s1.pfw'));
const td = parseTd(bytes('td-s1.pfv'));
const flush = () => new Promise((r) => setTimeout(r, 0));
const makeStore = () => createStore({ storage: null, loadEngine: () => Promise.resolve() });
/** The essay's position: DEFAULT_GAME after three moves, in the Rust fixture as « openingWin ply 3 ». */
const DEFAULT = fixture.positions.find((p) => p.label === 'openingWin ply 3')!;
const GAME = replay(DEFAULT_GAME as Triple[]);

function mountSync(kind: string, lang = 'fr'): PogoNet {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-net') as PogoNet;
  el.setAttribute('kind', kind);
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  return el;
}

async function mount(kind: string, lang = 'fr'): Promise<PogoNet> {
  const el = mountSync(kind, lang);
  await flush();
  return el;
}

const $ = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: Element, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];
const net = (el: Element) => $(el, '.net');
const cellButton = (el: Element, i: number) => $(el, `.cell-button[data-cell="${i}"]`) as HTMLButtonElement;
/** Plays `m` on the figure's board as a reader does: the stack, the count, the landing. */
function playByHand(el: Element, [from, n, to]: Triple): void {
  cellButton(el, from).click();
  if (n > 1) ($(el, `.counts [data-value="${n}"]`) as HTMLButtonElement).click();
  cellButton(el, to).click();
}
const press = (el: Element, k: string) => $(el, '.canvas-wrap').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

/** A canvas context that draws nothing and counts its strokes: happy-dom has none. */
function fakeCanvas(): { strokes: () => number; restore: () => void } {
  let strokes = 0;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => (prop in target ? target[prop as string] : prop === 'stroke' ? () => void strokes++ : () => {}),
    set: (target, prop, value) => ((target[prop as string] = value), true),
  });
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  const before = proto.getContext;
  proto.getContext = () => ctx;
  // happy-dom lays nothing out: the canvas is told its box at once, as a browser's ResizeObserver does.
  const g = globalThis as { ResizeObserver?: unknown };
  const observerBefore = g.ResizeObserver;
  g.ResizeObserver = class {
    constructor(private readonly cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
    observe(): void {
      this.cb([{ contentRect: { width: 600, height: 440 } }]);
    }
    disconnect(): void {}
  };
  return {
    strokes: () => strokes,
    restore: () => {
      proto.getContext = before;
      g.ResizeObserver = observerBefore;
    },
  };
}

let st: Store;
beforeEach(() => {
  resetMedia();
  st = makeStore();
  PogoNet.deps = { store: st, az: () => Promise.resolve(az), td: () => Promise.resolve(td) };
  PogoEncoding.deps = { store: st };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-net>', () => {
  it('draws every layer as a column of nodes, its size read from the header: TD 127 → 128 → 64 → 1', async () => {
    const el = await mount('td');
    expect($$(el, '.col-label').map((l) => l.textContent)).toEqual(['127entrées', '128neurones', '64neurones', '1note']);
    expect($$(el, '.col-label').map((l) => l.dataset.units)).toEqual(['127', '128', '64', '1']);
    // No head: no labels above the canvas.
    expect($(el, '.col-labels.top')).toBeNull();
    expect($(el, 'canvas')).not.toBeNull();
  });

  it('AlphaZero: the trunk, then the preference head above (128 → 243) and the value head below (128 → 1)', async () => {
    const el = await mount('az', 'en');
    expect($$(el, '.col-labels.top .col-label').map((l) => l.textContent)).toEqual(['128neurons', '243preferences']);
    expect($$(el, '.col-labels.bottom .col-label').map((l) => l.textContent)).toEqual(['127inputs', '256neurons', '128neurons', '128neurons', '1value']);
  });

  it('a doctored header draws other sizes', async () => {
    const doctored = {
      ...td,
      header: { features: td.header.features, weights: 0, layers: [{ name: 'td_fc0', inputs: 127, outputs: 128 }, { name: 'td_fc1', inputs: 128, outputs: 64 }, { name: 'td_out', inputs: 64, outputs: 1 }].slice(0, 3) },
    };
    doctored.header.layers[1] = { name: 'td_fc1', inputs: 128, outputs: 64 };
    PogoNet.deps = { ...PogoNet.deps, td: () => Promise.resolve({ ...doctored, header: { ...doctored.header, layers: [{ name: 'td_fc0', inputs: 127, outputs: 128 }, { name: 'td_out', inputs: 128, outputs: 1 }] }, layers: [td.layers[0]!, { ...td.layers[2]!, inputs: 128, weight: new Float32Array(128) }], forward: (s: State) => [td.forward(s)[0]!, td.forward(s)[1]!, Float32Array.of(0.25)] }) };
    const el = await mount('td');
    expect($$(el, '.col-label').map((l) => l.dataset.units)).toEqual(['127', '128', '1']);
    expect($(el, '.note-number').textContent).toBe('+0,25');
  });

  it('opens on the essay’s position, the one <pogo-encoding> opens on, and shows the net’s own value for it (the Rust fixture’s)', async () => {
    const el = await mount('td');
    const enc = document.createElement('pogo-encoding');
    document.body.append(enc);
    intersect(enc);
    await flush();
    expect(net(el).dataset.position).toBe(key(defaultPosition()));
    expect(net(el).dataset.position).toBe($(enc, '.encoding').dataset.position);
    expect(Number(net(el).dataset.value)).toBeCloseTo(DEFAULT.td, 5);
    expect($(el, '.note-number').textContent).toBe(netNumber('fr', DEFAULT.td, true));
    expect($(el, '.note-for').textContent).toBe('pour Rouge, à qui c’est le tour');
    expect($(el, '.scale-ends').textContent).toBe('−1 défaite+1 victoire');
    expect($(el, '.marker').style.left).toBe(`${(((DEFAULT.td + 1) / 2) * 100).toFixed(3)}%`);
    expect($(el, '[data-role="counter"]').textContent).toBe(`coup ${DEFAULT_PLY} sur 8`);
    const a = await mount('az');
    expect(Number(net(a).dataset.value)).toBeCloseTo(DEFAULT.az.value, 5);
  });

  it('says how many of all the links it draws, counted from the signal', async () => {
    const el = await mount('td');
    const g = netGraph(td.header);
    const sig = signal(td, g, td.forward(defaultPosition()), PER_NODE);
    expect($(el, '.drawn').textContent).toBe(drawnWords('fr', sig.drawn, g.links));
    expect(drawnWords('fr', 1158, 24512)).toBe('1 158 liaisons dessinées sur 24 512 : les 6 plus fortes de chaque neurone, pour cette position.');
    expect(g.links).toBe(24512);
    expect($(el, '.legend').textContent).toContain('positif');
    expect($(el, '.legend').textContent).toContain('négatif');
  });

  // The owner could not tell magnitudes apart (« plus c'est vif, on ne distingue pas »), and red stood for
  // positive: positive is now ink and negative red, the usual sign colours, and the legend draws the
  // canvas's own three strengths.
  it('positive is ink and negative red, in the legend, the note and its marker', () => {
    expect(sheet).toMatch(/\.dot\.positive \{\s*background: var\(--_ink\);/);
    expect(sheet).toMatch(/\.dot\.negative \{\s*background: var\(--_red\);/);
    expect(sheet).toMatch(/\.note\[data-sign='negative'\] \.note-number \{\s*color: var\(--_red-text\);/);
    expect(sheet).toMatch(/\.note\[data-sign='negative'\] \.marker \{\s*background: var\(--_red\);/);
    expect(sheet).not.toMatch(/data-sign='positive'\] \.(note-number|marker) \{\s*(color|background): var\(--_red/);
  });

  it('the legend draws the three strengths the canvas uses, from weak to strong', async () => {
    const el = await mount('td');
    const weights = $$(el, '.legend .weight');
    expect(weights.map((w) => w.style.height)).toEqual(LINK_WIDTH.map((w) => `${w}px`));
    expect(weights.map((w) => Number(w.style.opacity))).toEqual([...LINK_ALPHA]);
    expect($(el, '.legend .strengths').textContent).toBe('faiblefort');
    expect($(await mount('td', 'en'), '.legend .strengths').textContent).toBe('weakstrong');
    expect(el.shadowRoot!.textContent).not.toContain('vif');
  });

  it('AlphaZero lists its preferred moves with their shares, the rest summed: all the legal moves share 100 %', async () => {
    const el = await mount('az');
    const s = defaultPosition();
    const out = az.evaluate(s);
    const ranked = legal(s)
      .map((m) => ({ m, p: out.priors.get(policyIndex(m))! }))
      .sort((a, b) => b.p - a.p);
    const rows = $$(el, '.move-row');
    expect(rows).toHaveLength(TOP_MOVES);
    rows.forEach((row, i) => {
      expect(row.querySelector('.share')!.textContent).toBe(formatShare('fr', ranked[i]!.p));
      expect(Number((row.querySelector('.bar') as HTMLElement).style.getPropertyValue('--share'))).toBeCloseTo(ranked[i]!.p, 3);
    });
    const rest = ranked.slice(TOP_MOVES);
    expect($(el, '.others').textContent).toBe(`${rest.length} autres coups : ${formatShare('fr', rest.reduce((a, r) => a + r.p, 0))}`);
    expect($(await mount('td'), '.moves')).toBeNull();
  });

  it('walks through the essay’s game by itself once on screen, position after position, and loops', async () => {
    vi.useFakeTimers();
    const el = mountSync('td');
    await vi.advanceTimersByTimeAsync(0);
    const every = positionMs(netGraph(td.header));
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    const seen = [net(el).dataset.position];
    for (let i = 0; i < 9; i++) {
      await vi.advanceTimersByTimeAsync(every);
      seen.push(net(el).dataset.position);
    }
    // From move 3 to move 8, then again from the start: the nine positions that have a move to play.
    expect(seen).toEqual([3, 4, 5, 6, 7, 8, 0, 1, 2, 3].map((i) => key(GAME[i]!)));
    // Another position, another value.
    expect(new Set(seen.map((k) => td.value(GAME.find((s) => key(s) === k)!))).size).toBeGreaterThan(5);
  });

  it('pauses off screen, resumes on screen, and a reader’s pause holds', async () => {
    vi.useFakeTimers();
    const el = mountSync('td');
    await vi.advanceTimersByTimeAsync(0);
    const every = positionMs(netGraph(td.header));
    intersect(el);
    leave(el);
    await vi.advanceTimersByTimeAsync(every * 2);
    expect(net(el).dataset.position).toBe(key(GAME[3]!));
    intersect(el);
    await vi.advanceTimersByTimeAsync(every);
    expect(net(el).dataset.position).toBe(key(GAME[4]!));
    $(el, '[data-role="play"]').click();
    leave(el);
    intersect(el);
    await vi.advanceTimersByTimeAsync(every * 2);
    expect(net(el).dataset.position).toBe(key(GAME[4]!));
    // By hand: the previous and the next position.
    $(el, '[data-role="previous"]').click();
    expect(net(el).dataset.position).toBe(key(GAME[3]!));
  });

  it('the signal crosses the net in time: the output is held back until it arrives, and one canvas is drawn per frame', async () => {
    const canvas = fakeCanvas();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    try {
      const el = mountSync('td');
      await vi.advanceTimersByTimeAsync(0);
      // Drawn lit before it is seen.
      expect(net(el).dataset.flow).toBe('arrived');
      intersect(el);
      expect(net(el).dataset.flow).toBe('running');
      const crossing = flowEnd(netGraph(td.header).ranks) * STEP_MS;
      await vi.advanceTimersByTimeAsync(crossing / 2);
      expect(net(el).dataset.flow).toBe('running');
      const midway = canvas.strokes();
      expect(midway).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(crossing / 2 + 50);
      expect(net(el).dataset.flow).toBe('arrived');
      const done = canvas.strokes();
      // Nothing is drawn once the signal has arrived: no loop keeps running.
      await vi.advanceTimersByTimeAsync(1000);
      expect(canvas.strokes()).toBe(done);
      expect(sheet).toMatch(/\.net\[data-flow='running'\] \.late \{\s*visibility: hidden/);
      expect($(el, '.note-number').classList.contains('late')).toBe(true);
    } finally {
      canvas.restore();
    }
  });

  // Regression: between two positions the note vanished and every link turned grey for the length of
  // a crossing (the audit's frame, dark, step 4). The previous pass now stays drawn, its outputs written,
  // until the new signal has crossed; then they swap.
  it('between two positions the previous pass stays drawn, its note written, until the new one arrives', async () => {
    const canvas = fakeCanvas();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    try {
      const el = mountSync('az');
      await vi.advanceTimersByTimeAsync(0);
      intersect(el);
      const crossing = flowEnd(netGraph(az.header).ranks) * STEP_MS;
      await vi.advanceTimersByTimeAsync(crossing + 50);
      expect(net(el).dataset.flow).toBe('arrived');
      const before = $(el, '.note-number').textContent;
      const movesBefore = $$(el, '.move-row').map((r) => r.dataset.move);
      $(el, '[data-role="pause"], [data-role="play"]').click();
      $(el, '[data-role="next"]').click();
      expect(net(el).dataset.position).toBe(key(GAME[4]!));
      // Crossing: the old note and moves are still written, and shown (no « running » hiding them).
      expect(net(el).dataset.flow).toBe('swapping');
      expect($(el, '.note-number').textContent).toBe(before);
      expect($$(el, '.move-row').map((r) => r.dataset.move)).toEqual(movesBefore);
      await vi.advanceTimersByTimeAsync(crossing / 2);
      expect($(el, '.note-number').textContent).toBe(before);
      await vi.advanceTimersByTimeAsync(crossing / 2 + 50);
      expect(net(el).dataset.flow).toBe('arrived');
      expect($(el, '.note-number').textContent).toBe(netNumber('fr', Number(net(el).dataset.value), true));
      expect($(el, '.note-number').textContent).not.toBe(before);
    } finally {
      canvas.restore();
    }
  });

  it('under reduced motion nothing moves: each position is drawn lit, and nothing plays by itself', async () => {
    const canvas = fakeCanvas();
    setMedia(REDUCED_MOTION, true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    try {
      const el = mountSync('az');
      await vi.advanceTimersByTimeAsync(0);
      intersect(el);
      expect(net(el).dataset.flow).toBe('arrived');
      await vi.advanceTimersByTimeAsync(positionMs(netGraph(az.header)) * 2);
      expect(net(el).dataset.position).toBe(key(GAME[3]!));
      expect(playState(el)).toBe('play');
      $(el, '[data-role="next"]').click();
      expect(net(el).dataset.position).toBe(key(GAME[4]!));
      expect(net(el).dataset.flow).toBe('arrived');
    } finally {
      canvas.restore();
    }
  });

  it('takes the reader’s game when there is one: its latest position, and each move after it', async () => {
    const el = await mount('td');
    expect(net(el).dataset.game).toBe('default');
    st.newGame('White', 'normal');
    expect(net(el).dataset.game).toBe('reader');
    expect(net(el).dataset.position).toBe(key(st.current()!.states[0]!));
    expect($(el, '[data-role="counter"]').textContent).toBe('position 1 sur 1');
    st.play([0, 1, 3]);
    expect(net(el).dataset.position).toBe(key(st.current()!.states[1]!));
    expect(Number(net(el).dataset.value)).toBe(td.value(st.current()!.states[1]!));
    expect($(el, '[data-role="counter"]').textContent).toBe('coup 1 sur 1');
    // Its earlier positions stay within reach.
    $(el, '[data-role="previous"]').click();
    expect(net(el).dataset.position).toBe(key(st.current()!.states[0]!));
    st.abandon();
    expect(net(el).dataset.game).toBe('default');
    expect(net(el).dataset.position).toBe(key(defaultPosition()));
  });

  it('hands the position shown to the board', async () => {
    const el = await mount('td');
    const heard: string[] = [];
    el.addEventListener('pogo:playfrom', (e) => heard.push(key((e as CustomEvent<{ state: State }>).detail.state)));
    const action = $(el, '[data-role="action"]');
    expect(action.classList.contains('play-from')).toBe(true);
    expect(action.getAttribute('aria-label')).toBe('Jouer cette position contre l’ordinateur');
    action.click();
    expect(heard).toEqual([key(defaultPosition())]);
  });

  it('a node says what it is and what it holds: with the arrow keys, column by column', async () => {
    const el = await mount('td');
    const probe = () => $(el, '.probe').textContent;
    expect(probe()).toBe('Pointez un neurone pour lire sa valeur.');
    const s = defaultPosition();
    const acts = td.forward(s);
    press(el, 'ArrowDown');
    expect(probe()).toBe(`Entrée 1 sur 127 (a1, étage 1) : ${acts[0]![0] === -1 ? '−1' : acts[0]![0] === 1 ? '+1' : '0'}`);
    press(el, 'ArrowDown');
    expect(probe()).toContain('Entrée 2 sur 127 (a1, étage 2)');
    press(el, 'ArrowRight');
    expect(probe()).toBe(`Couche 1, neurone 2 sur 128 : ${netNumber('fr', acts[1]![1]!)}`);
    press(el, 'ArrowRight');
    press(el, 'ArrowRight');
    expect(probe()).toBe(`Note : ${netNumber('fr', td.value(s), true)}`);
    press(el, 'Escape');
    expect(probe()).toBe('Pointez un neurone pour lire sa valeur.');
    expect($(el, '.canvas-wrap').tabIndex).toBe(0);
  });

  it('names the inputs as the encoding does, and a preference by its move', () => {
    expect([0, 11, 12, 13, 14 + 1, 126].map((i) => inputWords('fr', i))).toEqual(['a1, étage 1', 'a1, étage 12', 'a1, sommet', `a1, ${t('fr', 'encHeight')}`, 'b1, étage 2', 'répétitions ÷ 2']);
    for (const m of legal(defaultPosition())) expect(outputMove(policyIndex(m))).toEqual([m.from_cell, m.num_pieces, m.to_cell]);
    const s = defaultPosition();
    const g = netGraph(az.header);
    const out = az.evaluate(s);
    const sig = signal(az, g, az.forward(s), PER_NODE, out.priors);
    const legalMove = legal(s)[0]!;
    const index = policyIndex(legalMove);
    expect(probeWords('fr', g, sig, { column: 4, node: index })).toBe(`Préférence pour ${'abc'[legalMove.from_cell % 3]}${Math.floor(legalMove.from_cell / 3) + 1}-${legalMove.num_pieces}-${'abc'[legalMove.to_cell % 3]}${Math.floor(legalMove.to_cell / 3) + 1} : ${formatShare('fr', out.priors.get(index)!)}`);
    const illegal = Array.from({ length: 243 }, (_, i) => i).find((i) => !out.priors.has(i))!;
    expect(probeWords('fr', g, sig, { column: 4, node: illegal })).toMatch(/: coup illégal ici, 0$/);
    expect(probeWords('fr', g, sig, { column: 3, node: 0 })).toMatch(/^Couche des préférences, neurone 1 sur 128/);
    expect(probeWords('fr', g, sig, { column: 5, node: 0 })).toMatch(/^Couche de la note, neurone 1 sur 128/);
  });

  it('writes the net’s numbers with two decimals, a real minus, and the language’s decimal mark', () => {
    expect([0.4321, -0.255, 0, -0.001, 1].map((x) => netNumber('fr', x, true))).toEqual(['+0,43', '−0,26', '0,00', '0,00', '+1,00']);
    expect(netNumber('en', 0.82)).toBe('0.82');
  });

  it('never names a net by its code name, and refuses a kind it does not know', async () => {
    const el = await mount('az');
    expect(el.shadowRoot!.textContent).not.toMatch(/az-lc1|v4-td|td-s1/);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = await mount('dqn');
    expect(bad.hasAttribute('data-failed')).toBe(true);
    error.mockRestore();
  });

  it('wide: the position, the arrow into the net, the net, then the output where the signal arrives; stacked in that order when narrow', async () => {
    const el = await mount('td');
    expect([...$(el, '.net-body').children].map((c) => c.className)).toEqual(['board-slot', 'enter', 'net-draw', 'net-out']);
    expect($(el, '.net-body').nextElementSibling!.classList.contains('controls-slot')).toBe(true);
    const wide = sheet.slice(sheet.indexOf('@container (min-width: 900px)'));
    expect(wide).toMatch(/\.net-body \{[^}]*grid-template-columns: 220px 32px minmax\(0, 1fr\) 210px/);
    const mid = sheet.slice(sheet.indexOf('@container (min-width: 560px)', sheet.indexOf('.sr {')));
    expect(mid).toMatch(/\.net-body \{[^}]*grid-template-columns: 190px 32px minmax\(0, 1fr\)/);
  });

  // The owner: « il manque une flèche pour dire que la position entre dans le réseau ».
  it('an arrow goes from the position into the net: across when they stand side by side, down when stacked', async () => {
    const el = await mount('td');
    const enter = $(el, '.enter');
    expect(enter.getAttribute('aria-hidden')).toBe('true');
    expect(enter.querySelector('svg .shaft')).not.toBeNull();
    expect(enter.querySelector('svg .head')).not.toBeNull();
    // Narrow the arrow points down; from 560px, where the board stands beside the net, it points right.
    const narrow = sheet.slice(0, sheet.indexOf('@container (min-width: 560px)', sheet.indexOf('.sr {')));
    expect(narrow).toMatch(/\.enter svg \{[^}]*transform: rotate\(90deg\)/);
    const mid = sheet.slice(sheet.indexOf('@container (min-width: 560px)', sheet.indexOf('.sr {')));
    expect(mid).toMatch(/\.enter svg \{[^}]*transform: none/);
  });

  it('invites the reader to play on its board, in one line under it', async () => {
    const el = await mount('td');
    expect($(el, '.invite').textContent).toBe('Jouez un coup sur le plateau\u202f: le réseau note la nouvelle position.');
    expect($(el, '.invite').previousElementSibling!.classList.contains('play')).toBe(true);
    expect($(await mount('az', 'en'), '.invite').textContent).toBe('Play a move on the board: the net scores the new position.');
  });

  it('the reader plays any move on the net’s board, either colour in turn: the net computes the new position, its note follows', async () => {
    const el = await mount('td');
    let s = defaultPosition();
    const line = [s];
    for (let n = 0; n < 3; n++) {
      const m = legal(s)[(n * 7) % legal(s).length]!;
      playByHand(el, [m.from_cell, m.num_pieces, m.to_cell]);
      s = play(s, [m.from_cell, m.num_pieces, m.to_cell]);
      line.push(s);
      expect(net(el).dataset.game).toBe('own');
      expect(net(el).dataset.position).toBe(key(s));
      expect(Number(net(el).dataset.value)).toBeCloseTo(td.value(s), 5);
      expect($(el, '.note-number').textContent).toBe(netNumber('fr', td.value(s), true));
      expect($(el, '.note-for').textContent).toBe(`pour ${s.to_move === 'Red' ? 'Rouge' : 'Blanc'}, à qui c’est le tour`);
      expect($(el, '[data-role="counter"]').textContent).toBe(`coup ${DEFAULT_PLY + n + 1} sur ${DEFAULT_PLY + n + 1}`);
    }
    // The board shows the move played: its origin ring.
    expect($(el, '.board .from')).not.toBeNull();
    // The reader's line can be walked back, and a move from an earlier position replaces what followed.
    $(el, '[data-role="previous"]').click();
    expect(net(el).dataset.position).toBe(key(line[2]!));
    const m = legal(line[2]!).find((x) => key(play(line[2]!, [x.from_cell, x.num_pieces, x.to_cell])) !== key(line[3]!))!;
    playByHand(el, [m.from_cell, m.num_pieces, m.to_cell]);
    expect(net(el).dataset.position).toBe(key(play(line[2]!, [m.from_cell, m.num_pieces, m.to_cell])));
    expect($(el, '[data-role="counter"]').textContent).toBe(`coup ${DEFAULT_PLY + 3} sur ${DEFAULT_PLY + 3}`);
  });

  it('AlphaZero: a move played on its board lists the new position’s preferred moves', async () => {
    const el = await mount('az');
    const m = legal(defaultPosition())[0]!;
    const s = play(defaultPosition(), [m.from_cell, m.num_pieces, m.to_cell]);
    playByHand(el, [m.from_cell, m.num_pieces, m.to_cell]);
    const out = az.evaluate(s);
    const best = legal(s).map((x) => ({ x, p: out.priors.get(policyIndex(x))! })).sort((a, b) => b.p - a.p)[0]!;
    expect($(el, '.move-row .share').textContent).toBe(formatShare('fr', best.p));
    expect(Number(net(el).dataset.value)).toBeCloseTo(out.value, 5);
  });

  it('the reader’s first touch on the board stops the walk; « Revenir à la partie de l’article » takes the essay’s game back', async () => {
    vi.useFakeTimers();
    const el = mountSync('td');
    await vi.advanceTimersByTimeAsync(0);
    const every = positionMs(netGraph(td.header));
    const back = $(el, '[data-role="resume"]') as HTMLButtonElement;
    expect(back.hidden).toBe(true);
    intersect(el);
    expect(playState(el)).toBe('pause');
    // A stack lifted is enough to stop the walk.
    const m = legal(defaultPosition())[0]!;
    cellButton(el, m.from_cell).click();
    await vi.advanceTimersByTimeAsync(every * 2);
    expect(net(el).dataset.position).toBe(key(defaultPosition()));
    expect(playState(el)).toBe('play');
    cellButton(el, m.from_cell).click();
    playByHand(el, [m.from_cell, m.num_pieces, m.to_cell]);
    await vi.advanceTimersByTimeAsync(every * 2);
    expect(net(el).dataset.game).toBe('own');
    expect(back.hidden).toBe(false);
    expect(back.textContent).toBe('Revenir à la partie de l’article');
    back.click();
    expect(net(el).dataset.game).toBe('default');
    expect(net(el).dataset.position).toBe(key(defaultPosition()));
    expect(back.hidden).toBe(true);
    // With a game on the page's board, the way back is to that game.
    st.newGame('White', 'normal');
    playByHand(el, [0, 1, 3]);
    expect(net(el).dataset.game).toBe('own');
    expect(back.textContent).toBe('Revenir à ma partie');
    back.click();
    expect(net(el).dataset.game).toBe('reader');
    expect(net(el).dataset.position).toBe(key(st.current()!.states[0]!));
  });
});

describe('<pogo-net> transport', () => {
  it('names its step buttons by the move, since each step is a move of a game', async () => {
    const el = await mount('td');
    const name = (r: string) => el.shadowRoot!.querySelector(`[data-role="${r}"]`)!.getAttribute('aria-label');
    expect([name('previous'), name('next')]).toEqual(['Revenir au coup précédent', 'Passer au coup suivant']);
  });
});
