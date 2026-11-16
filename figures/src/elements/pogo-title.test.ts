import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { intersect, observersOf, resetMedia } from '../test-dom';
import { PogoTitle } from './pogo-title';

if (!customElements.get('pogo-title')) customElements.define('pogo-title', PogoTitle);

const FR = 'POOOOOOGOOOOOO' + '\u00a0!'.repeat(8);
const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(text = FR): Promise<PogoTitle> {
  resetMedia();
  const h1 = document.createElement('h1');
  h1.setAttribute('lang', 'fr');
  const el = document.createElement('pogo-title') as PogoTitle;
  el.textContent = text;
  h1.append(el);
  document.body.append(h1);
  intersect(el);
  await flush();
  return el;
}

/** Delivers an entry saying whether `el` is on screen, to every observer watching it. */
function onScreen(el: Element, isIntersecting: boolean): void {
  for (const o of observersOf(el)) {
    (o as unknown as { callback: IntersectionObserverCallback }).callback(
      [{ target: el, isIntersecting } as IntersectionObserverEntry],
      o as unknown as IntersectionObserver,
    );
  }
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<pogo-title>', () => {
  it('draws the same text, aria-hidden, and keeps the light-DOM text as the name', async () => {
    const el = await mount();
    const drawn = el.shadowRoot!.querySelector('.drawn')!;
    expect(drawn.getAttribute('aria-hidden')).toBe('true');
    expect(drawn.textContent).toBe(FR);
    expect(el.textContent).toBe(FR);
    expect(el.shadowRoot!.querySelectorAll('.o .disc')).toHaveLength(12);
    expect(el.shadowRoot!.querySelectorAll('.o .disc.white')).toHaveLength(6);
    expect(el.shadowRoot!.querySelectorAll('.o .disc.red')).toHaveLength(6);
    expect([...el.shadowRoot!.querySelectorAll('.bang')].map((b) => b.textContent).join('')).toBe('!'.repeat(8));
  });

  it('tolerates the page’s <wbr> in its light DOM, and draws its groups with a <wbr> between them', async () => {
    resetMedia();
    const h1 = document.createElement('h1');
    const el = document.createElement('pogo-title') as PogoTitle;
    // The page's markup: the no-break space stays with the camp, before the <wbr>.
    el.append('POOOOOO', document.createElement('wbr'), 'GOOOOOO\u00a0', document.createElement('wbr'), '!' + '\u00a0!'.repeat(7));
    h1.append(el);
    document.body.append(h1);
    intersect(el);
    await flush();
    const text = 'POOOOOOGOOOOOO' + '\u00a0!'.repeat(8);
    expect(el.textContent).toBe(text);
    expect(el.querySelectorAll('wbr')).toHaveLength(2);
    const drawn = el.shadowRoot!.querySelector('.drawn')!;
    expect(drawn.textContent).toBe(text);
    expect([...drawn.children].map((c) => c.localName + (c.className ? '.' + c.className.replace(' ', '.') : ''))).toEqual([
      'span.part.camp',
      'wbr',
      'span.part.camp',
      'wbr',
      'span.part.bangs',
    ]);
    // Each drawn group ends where the page's <wbr> stands: the line of bangs starts on a bang.
    expect([...drawn.querySelectorAll('.part')].map((p) => p.textContent)).toEqual([
      'POOOOOO',
      'GOOOOOO\u00a0',
      '!' + '\u00a0!'.repeat(7),
    ]);
    expect([...el.shadowRoot!.querySelectorAll('.letter.red')].map((x) => x.textContent)).toEqual(['G']);
  });

  it('jumps only while on screen, and stops for good at disconnect', async () => {
    const el = await mount();
    onScreen(el, true);
    expect(el.hasAttribute('data-moving')).toBe(true);
    onScreen(el, false);
    expect(el.hasAttribute('data-moving')).toBe(false);
    onScreen(el, true);
    el.remove();
    expect(el.hasAttribute('data-moving')).toBe(false);
    expect(observersOf(el)).toHaveLength(0);
  });

  it('its sheet keeps the discs still under reduced motion and drops « Précisions »', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-title.css'), 'utf8');
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(reduced).toContain('animation: none');
    // A camp never breaks.
    expect(css).toMatch(/\.part\.camp \{\s*white-space: nowrap;/);
    expect(css).toMatch(/\.precisions,\s*\.failed \{\s*display: none;/);
    // Animation only under the attribute the visibility observer sets.
    expect(css).toMatch(/:host\(\[data-moving\]\) \.disc \{\s*animation: pogo/);
  });
});
