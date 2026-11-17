import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia, shownText } from '../test-dom';
import { FAN_FROM, fan, fanFrames, movePath } from './moves-demo';
import { MOVE_TEMPO_MS } from '../kit/tempo';
import { DEMO_REST, PogoMoves } from './pogo-moves';

if (!customElements.get('pogo-moves')) customElements.define('pogo-moves', PogoMoves);
PogoMoves.deps = { engine: () => Promise.resolve() };

async function mount(view: string, lang = 'fr'): Promise<PogoMoves> {
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-moves') as PogoMoves;
  el.setAttribute('view', view);
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

/** mount() under fake timers. */
async function mountFake(view: string, lang = 'fr'): Promise<PogoMoves> {
  const p = mount(view, lang);
  await vi.advanceTimersByTimeAsync(0);
  return p;
}

const $ = (el: PogoMoves, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const role = (el: PogoMoves, r: string) => $(el, `[data-role="${r}"]`) as HTMLButtonElement;
const groups = (el: PogoMoves) => [...el.shadowRoot!.querySelectorAll<HTMLElement>('.fan-group')];
const cellsOf = (g: HTMLElement, sel: string) => [...g.querySelectorAll(sel)].map((n) => Number(n.getAttribute('data-cell'))).sort((a, b) => a - b);
const carriedAt = (g: HTMLElement) => g.querySelector('.board .carried')?.getAttribute('data-cell');

afterEach(() => {
  vi.useRealTimers();
  resetMedia();
  document.body.innerHTML = '';
});

describe('<pogo-moves view="start">', () => {
  it('draws the start position with its description, and nothing else: no key to the two sides, nothing to press', async () => {
    const el = await mount('start');
    expect($(el, 'svg.board title').textContent).toContain('a1, b1 et c1');
    // The twelve pieces of the position, and no disc of a key beside them.
    expect(el.shadowRoot!.querySelectorAll('.disc')).toHaveLength(12);
    expect(el.shadowRoot!.querySelectorAll('button')).toHaveLength(0);
    expect(el.shadowRoot!.querySelector('.legend')).toBeNull();
    expect(el.shadowRoot!.querySelector('.moves')!.textContent).not.toMatch(/Blanc|Rouge/);
  });
});

describe('<pogo-moves view="moves">', () => {
  const f = fan();
  const frames = fanFrames(f);

  it('shows, at rest, every move from the stack, one board per count, each landing ringed, the stack lifted', async () => {
    const el = await mount('moves');
    expect($(el, '.lead').textContent).toBe(
      'Depuis la pile de a1 : une, deux ou trois pièces. Chaque cercle pointillé est une arrivée possible, jamais la case de départ.',
    );
    const gs = groups(el);
    expect(gs.map((g) => g.querySelector('.say')!.textContent)).toEqual([
      '1 pièce, 1 mouvement',
      '2 pièces, 2 mouvements, y compris la diagonale',
      '3 pièces, 3 mouvements, y compris une case voisine',
    ]);
    gs.forEach((g, k) => {
      expect(cellsOf(g, '.board .mark.target')).toEqual(f.groups[k]!.moves.map((m) => m[2]));
      expect(cellsOf(g, '.board .mark.picked')).toEqual([FAN_FROM]);
      expect(carriedAt(g)).toBeUndefined();
    });
    // Each board says its landings in words, for those who do not see the rings.
    expect(gs[1]!.querySelector('svg.board title')!.textContent).toBe('2 pièces, 2 mouvements, y compris la diagonale : c1, b2 ou a3.');
    // No move notation yet: the essay defines it after this figure.
    expect($(el, '.moves').textContent).not.toMatch(/[abc][123]-[123]-[abc][123]/);
  });

  it('plays one example per count on its own board, the other boards staying whole', async () => {
    const el = await mount('moves', 'en');
    expect($(el, '.lead').textContent).toBe('From the stack on a1: one, two or three pieces. Each dashed ring is a possible landing, never the square they left.');
    const three = 2;
    const g = f.groups[three]!;
    const start = frames.findIndex((x) => x.group === three);
    for (let k = 0; k < start; k++) role(el, 'next').click();
    const board = () => groups(el)[three]!;
    expect(carriedAt(board())).toBe(String(FAN_FROM));
    // Lifted, the stack's landings stay ringed; the other boards rest whole.
    expect(cellsOf(board(), '.board .mark.target')).toEqual(g.moves.map((m) => m[2]));
    for (const k of [0, 1]) expect(cellsOf(groups(el)[k]!, '.board .mark.target')).toEqual(f.groups[k]!.moves.map((m) => m[2]));
    const path: string[] = [];
    for (let k = 0; k < g.count; k++) {
      role(el, 'next').click();
      path.push(carriedAt(board())!);
    }
    expect(path).toEqual(movePath(...g.example).slice(1).map(String));
    role(el, 'next').click();
    // Landed: nothing in the air, the landing framed, the ring it left says how many pieces it lifted.
    expect(carriedAt(board())).toBeUndefined();
    expect(board().querySelector('.board .to')!.getAttribute('data-cell')).toBe(String(g.example[2]));
    expect(board().querySelector('.lifted')!.textContent).toBe('3');
  });

  it('each frame, lifted, carried, landed, is held the kit’s one tempo', async () => {
    vi.useFakeTimers();
    const el = await mountFake('moves');
    role(el, 'play').click();
    const at = (k: number) => String(frames[k]!.carry?.at ?? frames[k]!.phase);
    const shown = () => groups(el)[0]!.querySelector('.board .carried')?.getAttribute('data-cell') ?? (groups(el)[0]!.querySelector('.board .to') ? 'land' : 'rest');
    for (let k = 1; k < 4; k++) {
      vi.advanceTimersByTime(MOVE_TEMPO_MS - 1);
      expect(shown()).toBe(at(k - 1));
      vi.advanceTimersByTime(1);
      expect(shown()).toBe(at(k));
    }
  });

  it('starts by itself on screen, pauses off screen, and loops after a rest on the last landing', async () => {
    vi.useFakeTimers();
    const el = await mountFake('moves');
    expect(playState(el)).toBe('play');
    intersect(el);
    expect(playState(el)).toBe('pause');
    leave(el);
    expect(playState(el)).toBe('play');
    intersect(el);
    vi.advanceTimersByTime(MOVE_TEMPO_MS * (frames.length - 1));
    const last = () => groups(el)[2]!;
    expect(last().querySelector('.board .to')).not.toBeNull();
    vi.advanceTimersByTime(MOVE_TEMPO_MS + DEMO_REST - 1);
    expect(last().querySelector('.board .to')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(last().querySelector('.board .to')).toBeNull();
    expect(cellsOf(last(), '.board .mark.target')).toEqual(f.groups[2]!.moves.map((m) => m[2]));
    expect(playState(el)).toBe('pause');
  });

  it('under reduced motion rests with every move shown, with ▶, and never moves by itself', async () => {
    setMedia(REDUCED_MOTION, true);
    vi.useFakeTimers();
    const el = await mountFake('moves');
    intersect(el);
    expect(playState(el)).toBe('play');
    groups(el).forEach((g, k) => expect(cellsOf(g, '.board .mark.target')).toEqual(f.groups[k]!.moves.map((m) => m[2])));
    vi.advanceTimersByTime(60_000);
    expect(role(el, 'counter').textContent).toBe(`étape 1 sur ${frames.length}`);
  });

  it('says each example in words once it is lifted, and nothing at first', async () => {
    const el = await mount('moves');
    const live = $(el, '.sr[aria-live]');
    expect(live.textContent).toBe('');
    role(el, 'next').click();
    expect(live.textContent).toBe('De a1, 1 pièce, vers a2.');
    role(el, 'next').click();
    expect(live.textContent).toBe('De a1, 1 pièce, vers a2.');
  });
});

describe('<pogo-moves> transport', () => {
  it('names its step buttons by the step', async () => {
    const el = await mount('moves');
    const name = (r: string) => el.shadowRoot!.querySelector(`[data-role="${r}"]`)!.getAttribute('aria-label');
    expect([name('previous'), name('next')]).toEqual(['Revenir à l’étape précédente', 'Passer à l’étape suivante']);
  });
});
