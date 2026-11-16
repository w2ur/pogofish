import { REDUCED_MOTION, resetMedia, setMedia } from '../test-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { choiceGroup, progress, transport } from './controls';
import { Stepper } from './stepper';

beforeEach(() => {
  resetMedia();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

/** A button's own text, without its name's tooltip. */
const drawn = (b: HTMLElement) => [...b.childNodes].filter((n) => !(n instanceof HTMLElement && n.getAttribute('role') === 'tooltip')).map((n) => n.textContent).join('');

const parts = (row: HTMLElement) => ({
  prev: row.querySelector<HTMLButtonElement>('[data-role="previous"]')!,
  next: row.querySelector<HTMLButtonElement>('[data-role="next"]')!,
  play: row.querySelector<HTMLButtonElement>('[data-role="play"]')!,
  counter: row.querySelector<HTMLElement>('[data-role="counter"]')!,
});

describe('transport', () => {
  it('lays out previous, play/pause and next as icon buttons, the counter beside them, then the extra actions', () => {
    const s = new Stepper(8, () => {});
    const restart = vi.fn();
    const row = transport(s, { lang: 'fr', actions: [{ label: 'Recommencer', onClick: restart }] });
    const { prev, next, play, counter } = parts(row);
    expect([...row.children].map((c) => (c as HTMLElement).dataset.role)).toEqual([
      'previous',
      'play',
      'next',
      'counter',
      'action',
    ]);
    expect(prev.getAttribute('aria-label')).toBe('Revenir à l’étape précédente');
    expect(next.getAttribute('aria-label')).toBe('Passer à l’étape suivante');
    expect(drawn(prev)).toBe('');
    expect(prev.querySelector('svg')).not.toBeNull();
    expect(prev.classList.contains('secondary')).toBe(true);
    expect(play.classList.contains('secondary')).toBe(false);
    // Play is an icon button too, the same square: no text, so its width never changes.
    expect(play.classList.contains('icon')).toBe(true);
    expect(drawn(play)).toBe('');
    expect(play.getAttribute('aria-label')).toBe('Lancer l’animation');
    expect(play.querySelectorAll('svg path.glyph')).toHaveLength(2);
    expect(counter.getAttribute('aria-live')).toBe('polite');
    expect(counter.textContent).toBe('étape 1 sur 8');
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
    expect(counter.textContent).toBe('step 3 of 3');
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

  it('says progress in words: « étape 2 sur 5 », or « coup 3 sur 9 » counted from the start position', () => {
    expect(progress('fr', 'step')(1, 5)).toBe('étape 2 sur 5');
    expect(progress('en', 'step')(1, 5)).toBe('step 2 of 5');
    // From the start: step 0 is the position before anything happened.
    expect(progress('fr', 'move', true)(3, 10)).toBe('coup 3 sur 9');
    expect(progress('en', 'move', true)(0, 10)).toBe('move 0 of 9');
    expect(progress('fr', 'step', true)(0, 6)).toBe('étape 0 sur 5');
  });

  it('every icon button shows its name on hover and focus, and the play square follows its state', () => {
    const s = new Stepper(3, () => {});
    const { prev, next, play } = parts(transport(s, { lang: 'en' }));
    const tip = (b: HTMLElement) => b.querySelector<HTMLElement>('[role="tooltip"]')!.textContent;
    expect(tip(prev)).toBe('Go back one step');
    expect(tip(next)).toBe('Go forward one step');
    expect(tip(play)).toBe('Play the animation');
    play.click();
    expect(play.getAttribute('aria-label')).toBe('Pause the animation');
    expect(tip(play)).toBe('Pause the animation');
    for (const b of [prev, next, play]) expect(b.classList.contains('icon')).toBe(true);
  });

  it('keeps the play label and icon true to the real state, including at the end of a run', () => {
    const s = new Stepper(3, () => {});
    const { play } = parts(transport(s, { lang: 'en' }));
    const shown = () => [...play.querySelectorAll<SVGSVGElement>('svg')].filter((svg) => svg.style.display !== 'none');
    expect(play.getAttribute('aria-label')).toBe('Play the animation');
    expect(shown().map((svg) => svg.querySelector('path')!.getAttribute('d'))).toEqual(['M4 2.5v11L13.5 8z']);
    play.click();
    expect(play.getAttribute('aria-label')).toBe('Pause the animation');
    expect(shown()).toHaveLength(1);
    expect(shown()[0]!.querySelector('path')!.getAttribute('d')).toMatch(/h3v11h-3z.*h3v11h-3z/);
    vi.advanceTimersByTime(2000);
    expect(s.playing).toBe(false);
    // Ended on its last state: the same square now replays it, drawn as a replay arrow.
    expect(play.getAttribute('aria-label')).toBe('Replay from the start');
    expect(shown()).toHaveLength(1);
    expect(shown()[0]!.querySelector('path')!.classList.contains('replay')).toBe(true);
    play.click();
    expect(s.index).toBe(0);
    expect(s.playing).toBe(true);
  });

  it('a press on pause is the reader’s pause, which the screen does not undo; a press on play lifts it', () => {
    const s = new Stepper(5, () => {});
    const { play } = parts(transport(s, { lang: 'en' }));
    s.play();
    play.click();
    expect(s.playing).toBe(false);
    expect(s.readerPaused).toBe(true);
    play.click();
    expect(s.readerPaused).toBe(false);
    expect(s.playing).toBe(true);
  });

  it('keeps ▶ under reduced motion: nothing plays by itself, but the reader may play', () => {
    setMedia(REDUCED_MOTION, true);
    const s = new Stepper(4, () => {});
    const { play } = parts(transport(s, { lang: 'fr' }));
    expect(play.hidden).toBe(false);
    s.play();
    expect(s.playing).toBe(false);
    play.click();
    expect(s.playing).toBe(true);
    // Switched on mid-run, reduced motion stops the run and leaves ▶ there.
    setMedia(REDUCED_MOTION, false);
    s.play();
    setMedia(REDUCED_MOTION, true);
    expect(s.playing).toBe(false);
    expect(play.hidden).toBe(false);
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
