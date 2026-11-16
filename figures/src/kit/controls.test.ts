import { REDUCED_MOTION, resetMedia, setMedia } from '../test-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { choiceGroup, transport } from './controls';
import { Stepper } from './stepper';

beforeEach(() => {
  resetMedia();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const parts = (row: HTMLElement) => ({
  prev: row.querySelector<HTMLButtonElement>('[data-role="previous"]')!,
  next: row.querySelector<HTMLButtonElement>('[data-role="next"]')!,
  play: row.querySelector<HTMLButtonElement>('[data-role="play"]')!,
  counter: row.querySelector<HTMLElement>('[data-role="counter"]')!,
});

describe('transport', () => {
  it('lays out previous, counter, next as icon buttons, then play/pause, then the extra actions', () => {
    const s = new Stepper(8, () => {});
    const restart = vi.fn();
    const row = transport(s, { lang: 'fr', actions: [{ label: 'Recommencer', onClick: restart }] });
    const { prev, next, play, counter } = parts(row);
    expect([...row.children].map((c) => (c as HTMLElement).dataset.role)).toEqual([
      'previous',
      'counter',
      'next',
      'play',
      'action',
    ]);
    expect(prev.getAttribute('aria-label')).toBe('Étape précédente');
    expect(next.getAttribute('aria-label')).toBe('Étape suivante');
    expect(prev.textContent).toBe('');
    expect(prev.querySelector('svg')).not.toBeNull();
    expect(prev.classList.contains('secondary')).toBe(true);
    expect(play.classList.contains('secondary')).toBe(false);
    expect(counter.getAttribute('aria-live')).toBe('polite');
    expect(counter.textContent).toBe('1 / 8');
    (row.querySelector('[data-role="action"]') as HTMLButtonElement).click();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('disables previous at the first step and next at the last', () => {
    const s = new Stepper(3, () => {});
    const { prev, next, counter } = parts(transport(s, { lang: 'en' }));
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    next.click();
    next.click();
    expect(s.index).toBe(2);
    expect(counter.textContent).toBe('3 / 3');
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('hands focus to the opposite step button when the focused one becomes disabled', () => {
    const s = new Stepper(3, () => {});
    const row = transport(s, { lang: 'en' });
    document.body.replaceChildren(row);
    const { prev, next } = parts(row);
    next.focus();
    next.click();
    next.click();
    expect(next.disabled).toBe(true);
    expect(document.activeElement).toBe(prev);
    prev.click();
    prev.click();
    expect(prev.disabled).toBe(true);
    expect(document.activeElement).toBe(next);
    // A step taken from elsewhere (a timer, a keyboard shortcut) leaves an unfocused row alone.
    next.blur();
    s.go(2);
    expect(document.activeElement).not.toBe(prev);
    document.body.replaceChildren();
  });

  it('formats the counter as the caller asks', () => {
    const s = new Stepper(9, () => {});
    const { counter } = parts(transport(s, { lang: 'en', counter: (i, n) => `${i} / ${n - 1}` }));
    expect(counter.textContent).toBe('0 / 8');
  });

  it('keeps the play label true to the real state, including at the end of a run', () => {
    const s = new Stepper(3, () => {});
    const { play } = parts(transport(s, { lang: 'en' }));
    expect(play.textContent).toBe('Play');
    play.click();
    expect(play.textContent).toBe('Pause');
    vi.advanceTimersByTime(2000);
    expect(s.playing).toBe(false);
    expect(play.textContent).toBe('Play');
  });

  it('hides play when reduced motion switches on mid-run and brings it back when it switches off', () => {
    const s = new Stepper(10, () => {});
    const action = { label: 'Play from here', onClick: () => {}, primary: true };
    const row = transport(s, { lang: 'en', actions: [action] });
    const { play, next } = parts(row);
    const extra = row.querySelector<HTMLButtonElement>('[data-role="action"]')!;
    expect(extra.classList.contains('secondary')).toBe(true);
    play.click();
    setMedia(REDUCED_MOTION, true);
    expect(play.hidden).toBe(true);
    expect(play.textContent).toBe('Play');
    // With play gone, the caller's main action becomes the row's one primary.
    expect(extra.classList.contains('secondary')).toBe(false);
    next.click();
    expect(s.index).toBe(1);
    setMedia(REDUCED_MOTION, false);
    expect(play.hidden).toBe(false);
    expect(extra.classList.contains('secondary')).toBe(true);
  });

  it('starts with play hidden under reduced motion', () => {
    setMedia(REDUCED_MOTION, true);
    const { play } = parts(transport(new Stepper(4, () => {}), { lang: 'fr' }));
    expect(play.hidden).toBe(true);
  });
});

describe('choiceGroup', () => {
  const make = () => {
    const chosen: string[] = [];
    const g = choiceGroup({
      label: 'Niveau',
      id: 'level-label',
      choices: [
        { value: 'easy', label: 'Facile' },
        { value: 'normal', label: 'Normal', note: 'mesuré' },
        { value: 'hard', label: 'Difficile' },
      ],
      onChoose: (v) => {
        chosen.push(v);
        g.set(v);
      },
    });
    document.body.replaceChildren(g.element);
    return { g, chosen };
  };
  const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('is a labelled radiogroup of radios, the checked one the only tab stop', () => {
    const { g } = make();
    expect(g.element.getAttribute('role')).toBe('radiogroup');
    expect(g.element.getAttribute('aria-labelledby')).toBe('level-label');
    expect(g.buttons.map((b) => b.getAttribute('role'))).toEqual(['radio', 'radio', 'radio']);
    expect(g.buttons[1]!.textContent).toBe('Normal · mesuré');
    g.set('normal');
    expect(g.buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(g.buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('a click chooses; the arrows move, choose and wrap, skipping hidden options', () => {
    const { g, chosen } = make();
    g.buttons[0]!.click();
    expect(chosen).toEqual(['easy']);
    g.buttons[1]!.hidden = true;
    g.buttons[0]!.focus();
    key(g.buttons[0]!, 'ArrowRight');
    expect(chosen.at(-1)).toBe('hard');
    expect(document.activeElement).toBe(g.buttons[2]);
    key(g.buttons[2]!, 'ArrowRight');
    expect(chosen.at(-1)).toBe('easy');
    key(g.buttons[0]!, 'ArrowLeft');
    expect(chosen.at(-1)).toBe('hard');
  });

  it('the theme draws a checked choice as the filled block', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/kit/theme.css'), 'utf8');
    const rule = /\.choice\[aria-checked='true'\] \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain('background: var(--_action)');
    expect(rule).toContain('color: var(--_ground)');
  });
});
