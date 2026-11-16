import { afterEach, describe, expect, it, vi } from 'vitest';
import { intersect, resetMedia } from '../test-dom';
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
