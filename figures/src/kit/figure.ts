// The base of every <pogo-…> element. It owns what all figures share: the
// shadow frame, the theme sheet, rendering once on first approach, the
// no-JavaScript fallback, the « Précisions » that end the figure, and clean-up
// at disconnect.
//
// Every figure ends with « Précisions », a disclosure closed by default: how the
// figure is made (computed live, measured before publication with its date, or a
// drawing), the game it is played in when that matters, then the figure's own
// notes (precisions()). Nothing in it is a file path or a code name: the data
// source a figure cites is an attribute of the host, data-source, for tests and
// for anyone reading the page's markup. Two exceptions, deliberate:
// <pogo-board mode="follow"> hides it (pogo-board.css), because it is a compact
// second view of the game the inline board shows, and the inline board carries
// it; and <pogo-title> hides it (pogo-title.css), because it is the page's <h1>,
// where a disclosure would be read as part of the title and the drawing is its
// signature, not a figure of the essay. A new figure does not drop it: only a
// second view of a figure already explained on the same page may.
import type { State } from '../engine';
import { formatDate } from './date';
import { precisionLines, t, type Fidelity, type Lang } from './strings';
import themeCss from './theme.css?raw';
// The store listens for `pogo:playfrom` on the document. Each element is its own
// chunk, loaded on approach: a figure that hands a position over may be on the page
// before any board is, so the store comes with the kit, never after the event.
import '../store';

/** How a figure that cites more than one source joins them in its sourceFile(). */
export const SOURCES = ' · ';

let sheet: CSSStyleSheet | undefined;
const elementSheets = new Map<string, CSSStyleSheet>();

/** The kit's stylesheet, built once and adopted by every shadow root. */
export function kitSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(themeCss);
  }
  return sheet;
}

/** An element's own stylesheet, built once per text and shared by every instance. */
function elementSheet(css: string): CSSStyleSheet {
  let s = elementSheets.get(css);
  if (!s) {
    s = new CSSStyleSheet();
    s.replaceSync(css);
    elementSheets.set(css, s);
  }
  return s;
}

/** Detail of the `pogo:playfrom` event a figure dispatches; the store listens for it. */
export interface PlayFromDetail {
  state: State;
  label: string;
}

export abstract class PogoFigure extends HTMLElement {
  static fidelity: Fidelity = 'illustrative';
  /** The data file the figure is drawn from, given as the host's `data-source`. */
  static source?: string;
  /** The game a figure is played in, said in its « Précisions ». */
  static game?: 'gameA' | 'gameLc12';
  /** Height the stage keeps before rendering, so the figure does not shift the page. */
  static stageMinHeight = '0px';
  /** The element's own CSS, adopted after the kit sheet. */
  static styles?: string;

  /** Where `render()` draws. */
  protected stage!: HTMLDivElement;
  private fallback!: HTMLSlotElement;
  private precisionsBox!: HTMLDetailsElement;
  private precisionsSummary!: HTMLElement;
  private precisionsBody!: HTMLDivElement;
  private observer: IntersectionObserver | undefined;
  private controller = new AbortController();
  private rendered = false;
  /** The run in flight, if any: a new run waits for it, so two never write the stage at once. */
  private pending: Promise<void> = Promise.resolve();

  /** Aborted at disconnect: pass it to listeners and steppers. */
  protected get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** `fr` when the closest non-empty `[lang]` starts with it, else `en`. */
  override get lang(): Lang {
    const tag = this.closest('[lang]:not([lang=""])')?.getAttribute('lang') ?? '';
    return tag.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }

  override set lang(value: string) {
    this.setAttribute('lang', value);
  }

  /**
   * The game « Précisions » names: the class's by default. A figure whose game
   * depends on an attribute overrides it; it is read when the frame is built, and again by refreshPrecisions().
   */
  protected game(): 'gameA' | 'gameLc12' | undefined {
    return (this.constructor as typeof PogoFigure).game;
  }

  /**
   * What « Précisions » says the figure is, and the data file it is drawn from: the
   * class's by default. A figure whose kind depends on an attribute overrides both; they
   * are read with game() when the frame is built, and again by refreshPrecisions().
   */
  protected fidelityKind(): Fidelity {
    return (this.constructor as typeof PogoFigure).fidelity;
  }

  protected sourceFile(): string | undefined {
    return (this.constructor as typeof PogoFigure).source;
  }

  /** The date the measured data was taken, as an ISO day (`2026-11-11`), once known; « Précisions » prints it. */
  protected dataDate(): string | undefined {
    return undefined;
  }

  /**
   * How the figure is made, when the kit's sentence for its kind would not say it
   * truly (a live board quoting a measured strength, a figure read from the solved
   * table): replaces that first sentence. Undefined keeps the kit's.
   */
  protected made(): string | undefined {
    return undefined;
  }

  /**
   * The figure's own sentences in « Précisions », after the kit's (how it is made, its
   * game): the notes a reader does not need to read the figure. Plain sentences, in
   * the page's language; read when the frame is built and by refreshPrecisions().
   */
  protected precisions(): string[] {
    return [];
  }

  protected reducedMotion(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Called once, when the figure first comes within half a viewport. May be async:
   * `signal` aborts at disconnect, so pass it to fetches, and check it after an await
   * before writing to the stage.
   */
  protected abstract render(signal: AbortSignal): void | Promise<void>;

  /** Hands a position to the playable board (Task 7's store listens for the event). */
  protected playFrom(state: State, label: string): void {
    this.dispatchEvent(
      new CustomEvent<PlayFromDetail>('pogo:playfrom', { detail: { state, label }, bubbles: true, composed: true }),
    );
  }

  connectedCallback(): void {
    if (!this.shadowRoot) this.buildFrame();
    this.controller = new AbortController();
    if (this.rendered) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (this.rendered || !entries.some((e) => e.isIntersecting)) return;
        this.observer?.disconnect();
        this.observer = undefined;
        this.rendered = true;
        const signal = this.signal;
        this.pending = this.pending.then(() => this.run(signal));
      },
      { rootMargin: '50%' },
    );
    this.observer.observe(this);
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.controller.abort();
    // A figure moved in the page renders afresh: its listeners went with the signal.
    // Until then its fallback stands in, so there is no blank gap.
    this.rendered = false;
    this.stage.replaceChildren();
    this.fallback.hidden = false;
    this.removeAttribute('data-failed');
    this.precisionsBox.hidden = false;
    // It renders afresh when it comes back: its reserve with it.
    this.stage.style.setProperty('--_stage-min', (this.constructor as typeof PogoFigure).stageMinHeight);
  }

  private buildFrame(): void {
    const ctor = this.constructor as typeof PogoFigure;
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = ctor.styles ? [kitSheet(), elementSheet(ctor.styles)] : [kitSheet()];

    const frame = document.createElement('div');
    frame.className = 'frame';
    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    this.stage.style.setProperty('--_stage-min', ctor.stageMinHeight);
    this.fallback = document.createElement('slot');
    frame.append(this.stage, this.fallback);

    // « Précisions »: closed by default, after everything the figure shows.
    this.precisionsBox = document.createElement('details');
    this.precisionsBox.className = 'precisions';
    this.precisionsSummary = document.createElement('summary');
    this.precisionsBody = document.createElement('div');
    this.precisionsBody.className = 'precisions-body';
    this.precisionsBox.append(this.precisionsSummary, this.precisionsBody);
    this.writePrecisions();
    root.append(frame, this.precisionsBox);
  }

  /**
   * Rewrites « Précisions » and the host's data attributes from fidelityKind(),
   * dataDate(), game(), sourceFile() and precisions(). For a figure whose notes
   * depend on its data or on the reader's choice: call it once they are known.
   * The disclosure stays open or closed as the reader left it.
   */
  protected refreshPrecisions(): void {
    this.writePrecisions();
  }

  private writePrecisions(): void {
    const lang = this.lang;
    const kind = this.fidelityKind();
    const game = this.game();
    const source = this.sourceFile();
    const iso = kind === 'measured' ? this.dataDate() : undefined;
    this.dataset.fidelity = kind;
    if (game) this.dataset.game = game;
    else delete this.dataset.game;
    if (source) this.dataset.source = source;
    else delete this.dataset.source;
    this.precisionsSummary.textContent = t(lang, 'precisions');
    const kit = precisionLines(lang, kind, game, iso ? formatDate(lang, iso) : undefined);
    const made = this.made();
    if (made !== undefined) kit[0] = made;
    const lines = [...kit, ...this.precisions()];
    this.precisionsBody.replaceChildren(
      ...lines.map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
    );
  }

  private async run(signal: AbortSignal): Promise<void> {
    // Disconnected while an earlier run was in flight: this run is already stale.
    if (signal.aborted) return;
    try {
      await this.render(signal);
      if (signal.aborted) {
        // A stale run: what it drew belongs to no live figure.
        this.stage.replaceChildren();
        return;
      }
      this.fallback.hidden = true;
      this.removeAttribute('data-failed');
    } catch (error) {
      if (signal.aborted) return;
      console.error(`${this.localName}: render failed`, error);
      this.setAttribute('data-failed', '');
      // A failed figure shows nothing it could not make: no « Précisions » over its fallback.
      this.precisionsBox.hidden = true;
      // A failed figure reserves no room: one line and its fallback, never a blank band.
      // theme.css overrides every element's own reserve for this state.
      this.stage.style.setProperty('--_stage-min', '0px');
      const message = document.createElement('p');
      message.className = 'failed';
      message.textContent = t(this.lang, 'failed');
      this.stage.replaceChildren(message);
      this.fallback.hidden = false;
    }
  }
}
