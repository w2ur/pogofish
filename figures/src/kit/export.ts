// Export mode: a figure drawn for a picture rather than for a reader (the
// article's stills and GIFs, tools/article-visuals/figures-export.mjs). It is
// opt-in, by the `export` attribute on the element; without it nothing here
// changes what the page does.
//
// Under it the figure renders at once, without waiting to near the screen;
// nothing plays by itself (autoplay and a toy's introduction never start); and
// the theme leaves out what is for a reader's hand: the transport and its
// counter, « Jouer cette position », a toy's invitation (theme.css). What the
// figure draws, its legend and its own lines, stay.
//
// The figure then offers its sequence (`PogoFigure.exportSequence()`): how many
// steps, how to show step i, how long step i is held, and the beats inside a
// step — offsets at which the figure changes by itself while the step is held
// (a greedy move told in four beats). A capture shows the steps in order, from
// 0, and takes one frame per beat, each held until the next beat or the end of
// the step. A film offers its Stepper's steps (transport()); a toy offers its
// introduction (toy()).
import type { Stepper } from './stepper';

export const EXPORT_ATTRIBUTE = 'export';

/** What a figure offers a capture: see the header. */
export interface ExportSequence {
  readonly steps: number;
  /** Whether the figure goes on from its last step by itself; else it rests there, as long as the reader looks. */
  readonly loops: boolean;
  /** Shows step `i`. Call it in order, from 0: a step may build on the one before. */
  go(i: number): void;
  /** How long step `i` is held, in ms, as the figure plays it. */
  hold(i: number): number;
  /** When, in ms after step `i` is shown, the figure changes by itself: always starts at 0. */
  beats(i: number): number[];
}

/** Whether `host`, a figure's element, is drawn for a picture. */
export function exporting(host: Element): boolean {
  return host.hasAttribute(EXPORT_ATTRIBUTE);
}

const offered = new WeakMap<Element, ExportSequence>();

/** Ties a sequence to the element that drives it (a transport row, a toy's root). */
export function offerSequence(at: Element, sequence: ExportSequence): void {
  offered.set(at, sequence);
}

/** The first sequence offered under `root`, in tree order; none before the figure has one. */
export function findSequence(root: ParentNode): ExportSequence | undefined {
  for (const el of root.querySelectorAll('*')) {
    const s = offered.get(el);
    if (s) return s;
  }
  return undefined;
}

/** A Stepper's steps, as it plays them. */
export function stepperSequence(stepper: Stepper): ExportSequence {
  return {
    steps: stepper.steps,
    loops: stepper.loops,
    go: (i) => stepper.go(i),
    hold: (i) => stepper.hold(i),
    beats: (i) => stepper.beats(i),
  };
}
