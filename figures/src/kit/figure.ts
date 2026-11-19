// The base of every <pogo-…> element. It owns what all figures share: the
// shadow frame, the theme sheet, rendering once on first approach, the
// no-JavaScript fallback, and clean-up at disconnect.
//
// A figure carries no notes of its own beside what it draws: the essay says
// everything the owner wants said about how a figure is made. A sentence the
// figure needs to be read (an axis, a legend) is part of what it draws.

import type { State } from '../engine';
import { exporting, findSequence, type ExportSequence } from './export';
import { t, type Lang } from './strings';
import themeCss from './theme.css?raw';
// The store listens for `pogo:playfrom` on the document. Each element is its own
// chunk, loaded on approach: a figure that hands a position over may be on the page
// before any board is, so the store comes with the kit, never after the event.
import '../store';

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
  /** Height the stage keeps before rendering, so the figure does not shift the page. */
  static stageMinHeight = '0px';
  /** The element's own CSS, adopted after the kit sheet. */
  static styles?: string;
  /**
   * The fallback is for a page without script only: once the element is defined it stays
   * hidden, while the render is pending too, and only a failure shows it. For a fallback
   * that would read wrongly beside the figure (<pogo-stages>' video link).
   */
  static quietFallback = false;

  /** Where `render()` draws. */
  protected stage!: HTMLDivElement;
  private fallback!: HTMLSlotElement;
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
    // Drawn for a picture (kit/export.ts): at once, wherever it is.
    if (exporting(this)) {
      this.startRender();
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (this.rendered || !entries.some((e) => e.isIntersecting)) return;
        this.observer?.disconnect();
        this.observer = undefined;
        this.startRender();
      },
      { rootMargin: '50%' },
    );
    this.observer.observe(this);
  }

  /** Settles once the render under way, if any, has finished, drawn or failed. */
  whenRendered(): Promise<void> {
    return this.pending;
  }

  /** Under export mode, what a capture steps through (kit/export.ts); none before the figure offers one. */
  exportSequence(): ExportSequence | undefined {
    return this.shadowRoot ? findSequence(this.shadowRoot) : undefined;
  }

  private startRender(): void {
    this.rendered = true;
    const signal = this.signal;
    this.pending = this.pending.then(() => this.run(signal));
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.controller.abort();
    // A figure moved in the page renders afresh: its listeners went with the signal.
    // Until then its fallback stands in, so there is no blank gap.
    this.rendered = false;
    this.stage.replaceChildren();
    this.fallback.hidden = (this.constructor as typeof PogoFigure).quietFallback;
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
    this.fallback.hidden = ctor.quietFallback;
    frame.append(this.stage, this.fallback);
    root.append(frame);
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
