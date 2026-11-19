// The control row of a stepped figure. The kit owns it so every figure has the
// same hierarchy: previous, play/pause and next as three square icon buttons of
// one fixed size, the step counter beside them, then the caller's extra actions.
// Play, pause and replay are drawn, never set as text: the button keeps its
// width. Play/pause is the row's one primary, there under reduced motion too
// (nothing plays by itself then, but the reader may ask). Once a run has ended
// on its last state, the same square replays it. A press on pause is the
// reader's pause (Stepper.pauseByReader), which kit/autoplay.ts never undoes.
// Every icon button is named by a full verb phrase, shown on hover, focus and
// tap (move-tip.ts's labelTip), and the counter says the progress in words
// (« étape 2 sur 5 », « coup 3 sur 9 », progress()).
// « Jouer cette position » is an icon of the kit's too (playFromButton), named by
// its full sentence, shown in its tooltip; in a transport it is there only while
// the figure is at rest, paused or ended, and away (its place kept) while it
// plays.
// A figure puts this row right under the visual it drives.
import { offerSequence, stepperSequence } from './export';
import { keepCase } from './keep-case';
import { labelTip } from './move-tip';
import type { Stepper } from './stepper';
import { t, type Lang } from './strings';

const NS = 'http://www.w3.org/2000/svg';

export interface TransportAction {
  label: string;
  onClick: () => void;
  /** The control's description, when its label is the short form of a sentence: its title too. */
  title?: string;
  /** « Jouer cette position »: drawn as the kit's icon, `label` its name, there only while the figure is at rest. */
  playFrom?: boolean;
}

export interface TransportOptions {
  lang: Lang;
  actions?: TransportAction[];
  /** The counter's text for step `i` of `steps` (default « étape i + 1 sur steps », progress()). */
  counter?: (i: number, steps: number) => string;
  /** What a step is, for the previous and next buttons' names: 'step' (default), or 'move' when each step is a move of a game. */
  unit?: 'step' | 'move';
}

/** A button with the kit's control style; `secondary` is the outlined block. */
export function controlButton(label: string, onClick: () => void, secondary = false, title?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = secondary ? 'control secondary' : 'control';
  // The full sentence a short label stands for: the button's description, and its tooltip.
  if (title) b.title = title;
  // The control cut is uppercase: a symbol in the label keeps its case.
  b.append(...keepCase(label));
  b.addEventListener('click', onClick);
  return b;
}

/**
 * « Jouer cette position »: the action every figure offers to hand its position to the board, in a
 * transport. It is the kit's icon (playFromButton), there only while the figure is at rest, paused
 * or ended.
 */
export function playFromAction(lang: Lang, onClick: () => void): TransportAction {
  return { label: t(lang, 'playFromHereLong'), onClick, playFrom: true };
}

/** The tooltips of the « Jouer cette position » icons, to close when one goes out of sight. */
const playFromTips = new WeakMap<HTMLButtonElement, { hide(): void }>();

/**
 * The same action as an icon button of its own: a square holding a piece and an arrow leaving it, drawn by the kit.
 * Its full sentence, « Jouer cette position contre l’ordinateur », is its name and, on hover, focus
 * and tap, its tooltip. A caller outside a transport says when it is away (setAway).
 */
export function playFromButton(lang: Lang, onClick: () => void): HTMLButtonElement {
  return playFromIcon(t(lang, 'playFromHereLong'), onClick);
}

function playFromIcon(label: string, onClick: () => void): HTMLButtonElement {
  const b = controlButton('', onClick, true);
  b.classList.add('icon', 'play-from');
  b.setAttribute('aria-label', label);
  b.append(icon('board-out', PLAY_FROM));
  playFromTips.set(b, labelTip(b, label));
  return b;
}

/**
 * Takes a « Jouer cette position » icon out of sight while its figure plays, keeping its place, or
 * brings it back. Going away, it closes its tooltip and hands its focus to `focusTo`.
 */
export function setAway(b: HTMLButtonElement, away: boolean, focusTo?: HTMLElement): void {
  if (b.hasAttribute('data-away') === away) return;
  b.toggleAttribute('data-away', away);
  if (!away) return;
  playFromTips.get(b)?.hide();
  if ((b.getRootNode() as Document | ShadowRoot).activeElement === b) focusTo?.focus();
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
/** « Jouer cette position »: a square holding a piece, and an arrow leaving it for the board you play on. */
const PLAY_FROM = 'M1.5 4.5h10v10h-10zM6.5 7.5a2 2 0 1 0 0.01 0zM9 7l5.5-5.5M10 1.5h4.5V6';

/**
 * A square icon control of the kit's size: its `label`, a full verb phrase, is its
 * accessible name and its tooltip (labelTip). `d` is a 16-unit path, stroked.
 */
export function iconControl(label: string, d: string, onClick: () => void): HTMLButtonElement {
  const b = controlButton('', onClick, true);
  b.classList.add('icon');
  b.setAttribute('aria-label', label);
  b.append(icon('chevron', d));
  labelTip(b, label);
  return b;
}

function iconButton(direction: 'left' | 'right', label: string, onClick: () => void): HTMLButtonElement {
  return iconControl(label, CHEVRON[direction], onClick);
}

/**
 * The counter in words. `step` counts « étape 2 sur 5 » from 1; `fromStart` counts
 * from the position before anything happened, step 0 of steps − 1 (« coup 0 sur 9 »).
 */
export function progress(lang: Lang, unit: 'step' | 'move', fromStart = false): (i: number, steps: number) => string {
  const word = t(lang, unit === 'step' ? 'progressStep' : 'ply');
  return (i, steps) => (fromStart ? `${word} ${i} ${t(lang, 'outOf')} ${steps - 1}` : `${word} ${i + 1} ${t(lang, 'outOf')} ${steps}`);
}

/** Builds the row and keeps it in step with `stepper`, including reduced motion switched mid-read. */
export function transport(stepper: Stepper, o: TransportOptions): HTMLElement {
  const unit = o.unit ?? 'step';
  const format = o.counter ?? progress(o.lang, unit);
  const row = document.createElement('div');
  row.className = 'controls';

  const prev = iconButton('left', t(o.lang, unit === 'move' ? 'previousMove' : 'previous'), () => stepper.prev());
  prev.dataset.role = 'previous';
  const next = iconButton('right', t(o.lang, unit === 'move' ? 'nextMove' : 'next'), () => stepper.next());
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
  const playTip = labelTip(play, t(o.lang, 'play'));

  const extras = (o.actions ?? []).map((a) => {
    const b = a.playFrom ? playFromIcon(a.label, a.onClick) : controlButton(a.label, a.onClick, true, a.title);
    b.dataset.role = 'action';
    return b;
  });
  const restOnly = extras.filter((b) => b.classList.contains('play-from'));

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
    playTip.set(t(o.lang, state));
    playIcon.style.display = state === 'play' ? '' : 'none';
    pauseIcon.style.display = state === 'pause' ? '' : 'none';
    replayIcon.style.display = state === 'replay' ? '' : 'none';
    for (const b of restOnly) setAway(b, stepper.playing, play);
  };

  row.append(prev, play, next, counter, ...extras);
  // What a capture of the figure steps through (kit/export.ts): the row's own steps.
  offerSequence(row, stepperSequence(stepper));
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

/**
 * A run of like items, each holding the same kinds of control (a board's offer,
 * its move name): one tab stop per kind, on one current item, with roving
 * tabindex. The arrow keys (and Home, End) move every kind to the previous or
 * next item, in reading order, wrapping, and focus the same kind there; a focus
 * by any other means (a click, a tap) makes its item the current one.
 * `kinds[k][i]` is kind k's control in item i. Returns `go(i)`, which makes item
 * i current without moving focus.
 */
export function roving(container: HTMLElement, kinds: readonly (readonly HTMLElement[])[], signal?: AbortSignal): (i: number) => void {
  const n = kinds[0]?.length ?? 0;
  let current = 0;
  const go = (i: number): void => {
    current = i;
    for (const kind of kinds) kind.forEach((c, j) => (c.tabIndex = j === i ? 0 : -1));
  };
  const find = (target: EventTarget | null): [number, number] | null => {
    for (let k = 0; k < kinds.length; k++) {
      const i = kinds[k]!.findIndex((c) => c === target || (target instanceof Node && c.contains(target)));
      if (i >= 0) return [k, i];
    }
    return null;
  };
  container.addEventListener(
    'keydown',
    (e) => {
      const at = find(e.target);
      if (!at || n === 0) return;
      const [k, i] = at;
      const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      go((to + n) % n);
      kinds[k]![current]!.focus();
    },
    { signal },
  );
  container.addEventListener(
    'focusin',
    (e) => {
      const at = find(e.target);
      if (at && at[1] !== current) go(at[1]);
    },
    { signal },
  );
  go(0);
  return go;
}
