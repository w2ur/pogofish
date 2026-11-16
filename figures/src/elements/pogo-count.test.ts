import { afterEach, describe, expect, it, vi } from 'vitest';
import { intersect, resetMedia, leave, playState } from '../test-dom';
import { PogoCount } from './pogo-count';

if (!customElements.get('pogo-count')) customElements.define('pogo-count', PogoCount);

async function mount(lang: string): Promise<PogoCount> {
  resetMedia();
  const section = document.createElement('section');
  section.setAttribute('lang', lang);
  const el = document.createElement('pogo-count') as PogoCount;
  el.innerHTML = '<p>fallback</p>';
  section.append(el);
  document.body.append(section);
  intersect(el);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const $ = (el: PogoCount, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;
const $$ = (el: PogoCount, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)];

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('<pogo-count>', () => {
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

  it('shows one factor per step with the running product, the rest keeping their room', async () => {
    const el = await mount('fr');
    expect($$(el, '.factor .value').map((n) => n.textContent)).toEqual(['924', '× 125 970', '× 2']);
    expect($$(el, '.factor').map((r) => r.hasAttribute('data-off'))).toEqual([false, true, true]);
    expect($(el, '.product').textContent).toBe('= 924');
    $(el, '[data-role="next"]').click();
    expect($(el, '.product').textContent).toBe('= 116 396 280');
    $(el, '[data-role="next"]').click();
    expect($(el, '.product').textContent).toBe('= 232 792 560');
    expect($$(el, '.factor').every((r) => !r.hasAttribute('data-off'))).toBe(true);
    expect($(el, '.total .what').hasAttribute('data-off')).toBe(false);
  });

  it('writes each combination the French way, C with n below and k above, read as « 6 parmi 12 »', async () => {
    const fr = await mount('fr');
    const b = $$(fr, '.binomial');
    expect(b.map((x) => [x.querySelector('sub')!.textContent, x.querySelector('sup')!.textContent])).toEqual([
      ['12', '6'],
      ['20', '8'],
    ]);
    // Drawn for the eye, said in words for the ear.
    for (const x of b) expect(x.querySelector('.notation')!.getAttribute('aria-hidden')).toBe('true');
    expect(b.map((x) => x.querySelector('.sr')!.textContent)).toEqual(['6 parmi 12', '8 parmi 20']);
    expect(b[0]!.textContent).not.toContain('C(');
    const en = await mount('en');
    expect($$(en, '.binomial .sr').map((x) => x.textContent)).toEqual(['12 choose 6', '20 choose 8']);
  });

  it('writes English numbers with commas', async () => {
    const el = await mount('en');
    $(el, '[data-role="next"]').click();
    $(el, '[data-role="next"]').click();
    expect($(el, '.product').textContent).toBe('= 232,792,560');
  });

  it('stops playing once disconnected', async () => {
    const el = await mount('en');
    vi.useFakeTimers();
    $(el, '[data-role="play"]').click();
    const product = $(el, '.product');
    el.parentElement!.removeChild(el);
    vi.advanceTimersByTime(10_000);
    expect(product.textContent).toBe('= 924');
  });
});
