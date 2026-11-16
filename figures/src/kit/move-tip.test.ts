import { afterEach, describe, expect, it, vi } from 'vitest';
import { labelTip, moveText, moveTip, moveWords, tipControl } from './move-tip';
import { controlButton } from './controls';

afterEach(() => {
  document.body.innerHTML = '';
});

const tipOf = (holder: Element): HTMLElement => {
  const id = holder.getAttribute('aria-describedby')!.split(' ').at(-1)!;
  return holder.querySelector<HTMLElement>(`#${id}`)!;
};
const shown = (holder: Element): boolean => tipOf(holder).hasAttribute('data-open');
const focusables = (el: Element): Element[] => [...el.querySelectorAll('[tabindex], button, a[href], input, select, textarea')];

describe('moveWords', () => {
  it('says the move in words, one piece or several, in both languages', () => {
    expect(moveWords('fr', [6, 1, 7])).toBe('De a3, 1 pièce, vers b3.');
    expect(moveWords('fr', [4, 2, 1])).toBe('De b2, 2 pièces, vers b1.');
    expect(moveWords('fr', [4, 3, 1])).toBe('De b2, 3 pièces, vers b1.');
    expect(moveWords('en', [6, 1, 7])).toBe('From a3, 1 piece, to b3.');
    expect(moveWords('en', [0, 2, 2])).toBe('From a1, 2 pieces, to c1.');
    expect(moveWords('en', [0, 3, 8])).toBe('From a1, 3 pieces, to c3.');
  });
});

describe('moveTip', () => {
  it('is a tab stop showing the name, described by a role="tooltip" holding the words', () => {
    const name = moveTip('fr', [6, 1, 7]);
    document.body.append(name);
    expect(name.tabIndex).toBe(0);
    expect(name.childNodes[0]!.textContent).toBe('a3-1-b3');
    const tip = tipOf(name);
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.textContent).toBe('De a3, 1 pièce, vers b3.');
    // Hidden from a live region's reading, described all the same.
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    expect(shown(name)).toBe(false);
  });

  it('shows on hover and on focus, hides on leave and blur, calling the figure’s hooks', () => {
    const hooks = { show: vi.fn(), hide: vi.fn() };
    const name = moveTip('en', [0, 2, 2], hooks);
    document.body.append(name);
    name.dispatchEvent(new PointerEvent('pointerenter'));
    expect(shown(name)).toBe(true);
    expect(hooks.show).toHaveBeenCalledTimes(1);
    name.dispatchEvent(new PointerEvent('pointerleave'));
    expect(shown(name)).toBe(false);
    expect(hooks.hide).toHaveBeenCalledTimes(1);
    name.focus();
    expect(shown(name)).toBe(true);
    name.blur();
    expect(shown(name)).toBe(false);
    expect(hooks.show).toHaveBeenCalledTimes(2);
  });

  it('Escape dismisses it, keeps focus, and is not passed on; a second Escape is', () => {
    const outer = vi.fn();
    const wrap = document.createElement('div');
    wrap.addEventListener('keydown', outer);
    const name = moveTip('fr', [4, 3, 1]);
    wrap.append(name);
    document.body.append(wrap);
    name.focus();
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shown(name)).toBe(false);
    expect(document.activeElement).toBe(name);
    expect(outer).not.toHaveBeenCalled();
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('places the tooltip with fixed coordinates, without moving the name', () => {
    const name = moveTip('fr', [6, 1, 7]);
    document.body.append(name);
    name.focus();
    const tip = tipOf(name);
    expect(tip.style.left).toMatch(/px$/);
    expect(tip.style.top).toMatch(/px$/);
  });
});

describe('tipControl', () => {
  it('makes the control itself described, with nothing focusable nested', () => {
    const b = controlButton('', () => {}, true);
    b.setAttribute('aria-describedby', 'other');
    b.append('b1-2-b3');
    tipControl(b, 'fr', [1, 2, 7]);
    document.body.append(b);
    expect(b.getAttribute('aria-describedby')).toMatch(/^other move-tip-\d+$/);
    expect(tipOf(b).textContent).toBe('De b1, 2 pièces, vers b3.');
    expect(focusables(b)).toEqual([]);
    b.focus();
    expect(shown(b)).toBe(true);
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shown(b)).toBe(false);
  });
});

describe('labelTip', () => {
  const tipIn = (b: Element): HTMLElement => b.querySelector<HTMLElement>('[role="tooltip"]')!;

  it('shows the control’s own name on hover and focus, without describing it a second time', () => {
    const b = controlButton('', () => {}, true);
    b.setAttribute('aria-label', 'Passer à l’étape suivante');
    const tip = labelTip(b, 'Passer à l’étape suivante');
    document.body.append(b);
    expect(tipIn(b).textContent).toBe('Passer à l’étape suivante');
    expect(b.hasAttribute('aria-describedby')).toBe(false);
    expect(tipIn(b).getAttribute('aria-hidden')).toBe('true');
    b.dispatchEvent(new PointerEvent('pointerenter'));
    expect(tipIn(b).hasAttribute('data-open')).toBe(true);
    b.dispatchEvent(new PointerEvent('pointerleave'));
    expect(tipIn(b).hasAttribute('data-open')).toBe(false);
    b.focus();
    expect(tipIn(b).hasAttribute('data-open')).toBe(true);
    tip.set('Revenir à l’étape précédente');
    expect(tipIn(b).textContent).toBe('Revenir à l’étape précédente');
  });

  it('shows on a tap too, and goes by itself after a moment', () => {
    vi.useFakeTimers();
    try {
      const b = controlButton('', () => {}, true);
      labelTip(b, 'Mettre l’animation en pause');
      document.body.append(b);
      b.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
      expect(tipIn(b).hasAttribute('data-open')).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(tipIn(b).hasAttribute('data-open')).toBe(false);
      // A mouse press is not a tap: hover has already shown it.
      b.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' }));
      expect(tipIn(b).hasAttribute('data-open')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('moveText', () => {
  it('wraps every move name of a sentence, and keeps the rest as text', () => {
    const parts = moveText('en', 'White plays a1-2-b1. The net prefers c3-1-c2.');
    const p = document.createElement('p');
    p.append(...parts);
    expect(p.querySelectorAll('.move-name')).toHaveLength(2);
    // The words read as before: the explanations are aria-hidden.
    const visible = [...p.childNodes].map((n) => (n instanceof HTMLElement ? n.firstChild!.textContent : n.textContent)).join('');
    expect(visible).toBe('White plays a1-2-b1. The net prefers c3-1-c2.');
    expect(moveText('fr', 'Position de départ')).toEqual(['Position de départ']);
  });
});
