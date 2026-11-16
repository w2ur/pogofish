// The base of every <pogo-…> element. It owns what all figures share: the
// shadow frame, the theme sheet, rendering once on first approach, the
// no-JavaScript fallback, the fidelity label, and clean-up at disconnect.
//
// Every figure ends with its fidelity label. Two exceptions, deliberate:
// <pogo-board mode="follow"> hides it (pogo-board.css), because it is a
// compact second view of the game the inline board shows, and the inline
// board carries the label; and <pogo-title> hides it (pogo-title.css),
// because it is the page's <h1>, where a label would be read as part of the
// title and the drawing is its signature, not a figure of the essay. A new
// figure does not drop the label: only a second view of a figure already
// labelled on the same page may.
import type { State } from '../engine';
import { fidelityLabel, t, type Fidelity, type Lang } from './strings';
import themeCss from './theme.css?raw';

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
  /** File named under a `measured` label. */
  static source?: string;
  /** The game a figure is computed in, named in its fidelity label. */
  static game?: 'gameA' | 'gameLc12';
  /** Height the stage keeps before rendering, so the figure does not shift the page. */
  static stageMinHeight = '0px';
  /** The element's own CSS, adopted after the kit sheet. */
  static styles?: string;

  /** Where `render()` draws. */
  protected stage!: HTMLDivElement;
  private fallback!: HTMLSlotElement;
  private label!: HTMLParagraphElement;
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
   * The game the fidelity label names: the class's by default. A figure whose game
   * depends on an attribute overrides it; it is read when the frame is built, and again by refreshLabel().
   */
  protected game(): 'gameA' | 'gameLc12' | undefined {
    return (this.constructor as typeof PogoFigure).game;
  }

  /**
   * What the label says the figure is, and its source file when measured: the class's
   * by default. A figure whose kind depends on an attribute overrides both; they are
   * read with game() when the frame is built, and again by refreshLabel().
   */
  protected fidelityKind(): Fidelity {
    return (this.constructor as typeof PogoFigure).fidelity;
  }

  protected sourceFile(): string | undefined {
    return (this.constructor as typeof PogoFigure).source;
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

    this.label = document.createElement('p');
    this.label.className = 'fidelity';
    this.writeLabel();
    root.append(frame, this.label);
  }

  /**
   * Rewrites the fidelity label from fidelityKind(), sourceFile() and game(). For a
   * figure whose source is a string of its data, known only once the data is loaded:
   * call it from render() after the load.
   */
  protected refreshLabel(): void {
    this.writeLabel();
  }

  private writeLabel(): void {
    const label = this.label;
    const kind = this.fidelityKind();
    const text = fidelityLabel(this.lang, kind, this.sourceFile(), this.game());
    const source = kind === 'measured' ? this.sourceFile() : undefined;
    label.replaceChildren();
    if (source) {
      label.append(text.slice(0, -source.length));
      const file = document.createElement('span');
      file.className = 'source';
      // Each path segment keeps its line; a long path may break after a slash, and only there.
      // Several sources are joined by « · », where the line may break too.
      source.split(SOURCES).forEach((path, k) => {
        if (k > 0) file.append(SOURCES);
        for (const part of path.match(/[^/]*\/|[^/]+$/g) ?? [path]) {
          const segment = document.createElement('span');
          segment.className = 'segment';
          segment.textContent = part;
          file.append(segment);
        }
      });
      label.append(file);
    } else {
      label.textContent = text;
    }
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
