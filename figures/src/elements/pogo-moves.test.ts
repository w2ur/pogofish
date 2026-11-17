import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, intersect, leave, playState, resetMedia, setMedia, shownText } from '../test-dom';
import { DEMO, demoFrames, movePath } from './moves-demo';
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
const line = (el: PogoMoves) => shownText($(el, '.line:not(.sizer)'));
const carriedAt = (el: PogoMoves) => el.shadowRoot!.querySelector('.board .carried')?.getAttribute('data-cell');

afterEach(() => {
  vi.useRealTimers();
  resetMedia();
  document.body.innerHTML = '';
});

describe('<pogo-moves view="start">', () => {
  it('draws the start position with its description, a key, and nothing to press', async () => {
    const el = await mount('start');
    expect($(el, 'svg.board title').textContent).toContain('a1, b1 et c1');
    expect(el.shadowRoot!.querySelectorAll('.board .disc')).toHaveLength(12 + 2);
    expect(el.shadowRoot!.querySelectorAll('button')).toHaveLength(0);
    expect($(el, '.legend').textContent).toBe('BlancRouge');
  });
});

describe('<pogo-moves view="moves">', () => {
  it('lets the computer play: no square to press, a transport, the first move announced before it is played', async () => {
    const el = await mount('moves');
    expect(el.shadowRoot!.querySelectorAll('.cell-button')).toHaveLength(0);
    expect(role(el, 'play')).not.toBeNull();
    expect(line(el)).toBe('Une pièce, un mouvement. Blanc joue a1-1-a2.');
    expect(role(el, 'counter').textContent).toBe(`coup 1 sur ${DEMO.length}`);
    // The move's name explains itself, as everywhere else.
    expect($(el, '.line .move-name [role="tooltip"]').textContent).toBe('De a1, 1 pièce, vers a2.');
    expect(carriedAt(el)).toBeUndefined();
  });

  it('shows each move as the pieces lifted, the path square by square, the landing', async () => {
    const el = await mount('moves', 'en');
    const three = DEMO.findIndex((d) => d.move[1] === 3);
    const start = demoFrames().findIndex((f) => f.move === three);
    for (let k = 0; k < start; k++) role(el, 'next').click();
    expect(line(el)).toBe('Three pieces, three steps: a neighbouring square. Both colours taken, the top one the mover’s. Red plays a1-3-b1.');
    expect(role(el, 'counter').textContent).toBe(`move ${three + 1} of ${DEMO.length}`);
    role(el, 'next').click();
    // Lifted: off the stack, over their own square, the stack ringed.
    const [from, , to] = DEMO[three]!.move;
    expect(carriedAt(el)).toBe(String(from));
    expect(el.shadowRoot!.querySelector('.board .mark.picked')!.getAttribute('data-cell')).toBe(String(from));
    const path: string[] = [];
    for (let k = 0; k < 3; k++) {
      role(el, 'next').click();
      path.push(carriedAt(el)!);
    }
    expect(path).toEqual(movePath(...DEMO[three]!.move).slice(1).map(String));
    role(el, 'next').click();
    // Landed: nothing in the air, the landing square framed.
    expect(carriedAt(el)).toBeUndefined();
    expect(el.shadowRoot!.querySelector('.board .to')!.getAttribute('data-cell')).toBe(String(to));
  });

  it('each frame of a move, lifted, carried, landed, is held the kit’s one tempo', async () => {
    vi.useFakeTimers();
    const el = await mountFake('moves');
    role(el, 'play').click();
    const frames = demoFrames();
    // The first frames: the announcement, the lift, the one square, the landing.
    for (let k = 1; k < 4; k++) {
      vi.advanceTimersByTime(MOVE_TEMPO_MS - 1);
      expect(el.shadowRoot!.querySelector('.board .carried')?.getAttribute('data-cell') ?? 'land').toBe(
        String(frames[k - 1]!.carry?.at ?? 'land'),
      );
      vi.advanceTimersByTime(1);
      expect(el.shadowRoot!.querySelector('.board .carried')?.getAttribute('data-cell') ?? 'land').toBe(
        String(frames[k]!.carry?.at ?? 'land'),
      );
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
    const frames = demoFrames();
    vi.advanceTimersByTime(MOVE_TEMPO_MS * (frames.length - 1));
    expect(role(el, 'counter').textContent).toBe(`coup ${DEMO.length} sur ${DEMO.length}`);
    expect(el.shadowRoot!.querySelector('.board .to')).not.toBeNull();
    vi.advanceTimersByTime(MOVE_TEMPO_MS + DEMO_REST - 1);
    expect(el.shadowRoot!.querySelector('.board .to')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(line(el)).toBe('Une pièce, un mouvement. Blanc joue a1-1-a2.');
    expect(el.shadowRoot!.querySelector('.board .to')).toBeNull();
    expect(playState(el)).toBe('pause');
  });

  it('under reduced motion shows the last landing still, with ▶, and never moves by itself', async () => {
    setMedia(REDUCED_MOTION, true);
    vi.useFakeTimers();
    const el = await mountFake('moves');
    intersect(el);
    expect(playState(el)).toBe('play');
    expect(role(el, 'next').disabled).toBe(true);
    expect(el.shadowRoot!.querySelector('.board .to')!.getAttribute('data-cell')).toBe(String(DEMO.at(-1)!.move[2]));
    vi.advanceTimersByTime(60_000);
    expect(role(el, 'next').disabled).toBe(true);
  });

  it('says each move once in its live region, when it is announced, and nothing at first: the line is there to read', async () => {
    const el = await mount('moves', 'en');
    const live = $(el, '.sr[aria-live]');
    expect(live.textContent).toBe('');
    const second = demoFrames().findIndex((f) => f.move === 1);
    for (let k = 0; k < second; k++) role(el, 'next').click();
    expect(live.textContent).toBe('Onto an occupied square: the pieces go on top. Red plays a3-2-a1.');
    role(el, 'next').click();
    expect(live.textContent).toBe('Onto an occupied square: the pieces go on top. Red plays a3-2-a1.');
  });
});

describe('<pogo-moves> transport', () => {
  it('names its step buttons by the move, since each step is a move of a game', async () => {
    const el = await mount('moves');
    const name = (r: string) => el.shadowRoot!.querySelector(`[data-role="${r}"]`)!.getAttribute('aria-label');
    expect([name('previous'), name('next')]).toEqual(['Revenir au coup précédent', 'Passer au coup suivant']);
  });
});
