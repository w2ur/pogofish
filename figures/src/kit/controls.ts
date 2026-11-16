// The control row of a stepped figure. The kit owns it so every figure has the
// same hierarchy: previous, play/pause and next as three square icon buttons of
// one fixed size, the step counter beside them, then the caller's extra actions.
// Play, pause and replay are drawn, never set as text: the button keeps its
// width. Play/pause is the row's one primary, there under reduced motion too
// (nothing plays by itself then, but the reader may ask). Once a run has ended
// on its last state, the same square replays it. A press on pause is the
// reader's pause (Stepper.pauseByReader), which kit/autoplay.ts never undoes.
// A figure puts this row right under the visual it drives.
import { keepCase } from './keep-case';
import type { Stepper } from './stepper';
import { t, type Lang } from './strings';

const NS = 'http://www.w3.org/2000/svg';

export interface TransportAction {
  label: string;
  onClick: () => void;
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
  // The control cut is uppercase: a symbol in the label keeps its case.
  b.append(...keepCase(label));
  b.addEventListener('click', onClick);
  return b;
}

/** A 16px icon, drawn in the button's own colour, hidden from assistive tech: the button's label names it. */
function icon(className: string, d: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', className);
  svg.append(path);
  return svg;
}

const CHEVRON = { left: 'M10.5 2.5 5 8l5.5 5.5', right: 'M5.5 2.5 11 8l-5.5 5.5' } as const;
/** ▶ and ⏸, as the kit draws them: a triangle, two bars. */
const PLAY = 'M4 2.5v11L13.5 8z';
const PAUSE = 'M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z';
/** Replay: an open circle and its arrowhead, stroked like the chevrons. */
const REPLAY = 'M12.5 8a4.5 4.5 0 1 1-1.32-3.18M11.5 1.5v3.5H8';

function iconButton(direction: 'left' | 'right', label: string, onClick: () => void): HTMLButtonElement {
  const b = controlButton('', onClick, true);
  b.classList.add('icon');
  b.setAttribute('aria-label', label);
  b.append(icon('chevron', CHEVRON[direction]));
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
  const play = controlButton('', () => (stepper.playing ? stepper.pauseByReader() : stepper.playByReader()));
  play.classList.add('icon');
  play.dataset.role = 'play';
  const playIcon = icon('glyph', PLAY);
  const pauseIcon = icon('glyph', PAUSE);
  const replayIcon = icon('replay', REPLAY);
  play.append(playIcon, pauseIcon, replayIcon);

  const extras = (o.actions ?? []).map((a) => {
    const b = controlButton(a.label, a.onClick, true);
    b.dataset.role = 'action';
    return b;
  });

  const sync = (): void => {
    const last = stepper.steps - 1;
    // A disabled button drops focus to the page: hand it to the opposite one instead.
    const focused = (row.getRootNode() as Document | ShadowRoot).activeElement;
    prev.disabled = stepper.index === 0;
    next.disabled = stepper.index >= last;
    if (focused === prev && prev.disabled && !next.disabled) next.focus();
    if (focused === next && next.disabled && !prev.disabled) prev.focus();
    counter.textContent = format(stepper.index, stepper.steps);
    const state = stepper.playing ? 'pause' : stepper.ended ? 'replay' : 'play';
    play.dataset.state = state;
    play.setAttribute('aria-label', t(o.lang, state));
    playIcon.style.display = state === 'play' ? '' : 'none';
    pauseIcon.style.display = state === 'pause' ? '' : 'none';
    replayIcon.style.display = state === 'replay' ? '' : 'none';
  };

  row.append(prev, play, next, counter, ...extras);
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
