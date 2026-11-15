// The control row of a stepped figure. The kit owns it so every figure has the
// same hierarchy: previous and next as square icon buttons around the step
// counter, then one primary play/pause, then the caller's extra actions.
// At most one primary per row: play/pause when it is shown, otherwise the
// action the caller marks `primary`.
import type { Stepper } from './stepper';
import { t, type Lang } from './strings';

const NS = 'http://www.w3.org/2000/svg';

export interface TransportAction {
  label: string;
  onClick: () => void;
  /** The row's primary when play/pause is absent (reduced motion). */
  primary?: boolean;
}

export interface TransportOptions {
  lang: Lang;
  actions?: TransportAction[];
  /** The counter's text for step `i` of `steps` (default `i + 1 / steps`). */
  counter?: (i: number, steps: number) => string;
}

/** A button with the kit's control style; `secondary` is the outlined block. */
export function controlButton(label: string, onClick: () => void, secondary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = secondary ? 'control secondary' : 'control';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function chevron(direction: 'left' | 'right'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', direction === 'left' ? 'M10.5 2.5 5 8l5.5 5.5' : 'M5.5 2.5 11 8l-5.5 5.5');
  path.setAttribute('class', 'chevron');
  svg.append(path);
  return svg;
}

function iconButton(direction: 'left' | 'right', label: string, onClick: () => void): HTMLButtonElement {
  const b = controlButton('', onClick, true);
  b.classList.add('icon');
  b.setAttribute('aria-label', label);
  b.append(chevron(direction));
  return b;
}

/** Builds the row and keeps it in step with `stepper`, including reduced motion switched mid-read. */
export function transport(stepper: Stepper, o: TransportOptions): HTMLElement {
  const format = o.counter ?? ((i: number, n: number) => `${i + 1} / ${n}`);
  const row = document.createElement('div');
  row.className = 'controls';

  const prev = iconButton('left', t(o.lang, 'previous'), () => stepper.prev());
  prev.dataset.role = 'previous';
  const next = iconButton('right', t(o.lang, 'next'), () => stepper.next());
  next.dataset.role = 'next';
  const counter = document.createElement('span');
  counter.className = 'label num counter';
  counter.dataset.role = 'counter';
  counter.setAttribute('aria-live', 'polite');
  const play = controlButton('', () => (stepper.playing ? stepper.pause() : stepper.play()));
  play.dataset.role = 'play';

  const extras = (o.actions ?? []).map((a) => {
    const b = controlButton(a.label, a.onClick, true);
    b.dataset.role = 'action';
    return { b, primary: a.primary === true };
  });

  const sync = (): void => {
    const last = stepper.steps - 1;
    prev.disabled = stepper.index === 0;
    next.disabled = stepper.index >= last;
    counter.textContent = format(stepper.index, stepper.steps);
    play.hidden = !stepper.auto;
    play.textContent = t(o.lang, stepper.playing ? 'pause' : 'play');
    for (const { b, primary } of extras) b.classList.toggle('secondary', !(primary && play.hidden));
  };

  row.append(prev, counter, next, play, ...extras.map((e) => e.b));
  stepper.onChange(sync);
  sync();
  return row;
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** A muted note after the label (« mesuré »). */
  note?: string;
}

export interface ChoiceGroup<T extends string> {
  element: HTMLElement;
  buttons: HTMLButtonElement[];
  /** Checks `value` (or nothing), keeping the group's one tab stop on it. */
  set(value: T | null): void;
}

/**
 * One exclusive choice: a `radiogroup` of `radio` buttons, the checked one drawn as
 * the filled block. One tab stop; the arrow keys move and choose, skipping hidden
 * options, as the radio pattern expects.
 */
export function choiceGroup<T extends string>(o: {
  label: string;
  /** Id of the visible label, unique within the shadow root. */
  id: string;
  choices: Choice<T>[];
  onChoose: (value: T) => void;
}): ChoiceGroup<T> {
  const element = document.createElement('div');
  element.className = 'group';
  element.setAttribute('role', 'radiogroup');
  element.setAttribute('aria-labelledby', o.id);
  const label = document.createElement('span');
  label.className = 'label';
  label.id = o.id;
  label.textContent = o.label;

  const buttons = o.choices.map((c) => {
    const b = controlButton(c.label, () => o.onChoose(c.value), true);
    b.classList.add('choice');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.dataset.value = c.value;
    if (c.note) {
      const note = document.createElement('span');
      note.className = 'tag';
      note.textContent = ` · ${c.note}`;
      b.append(note);
    }
    return b;
  });

  element.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step === undefined) return;
    const shown = buttons.filter((b) => !b.hidden);
    const from = shown.indexOf(e.target as HTMLButtonElement);
    if (from < 0) return;
    e.preventDefault();
    const next = shown[(from + step + shown.length) % shown.length]!;
    next.focus();
    o.onChoose(next.dataset.value as T);
  });

  const set = (value: T | null): void => {
    const shown = buttons.filter((b) => !b.hidden);
    const stop = shown.find((b) => b.dataset.value === value) ?? shown[0];
    for (const b of buttons) {
      b.setAttribute('aria-checked', String(b.dataset.value === value));
      b.tabIndex = b === stop ? 0 : -1;
    }
  };

  element.append(label, ...buttons);
  set(null);
  return { element, buttons, set };
}
