// The base of every <pogo-…> element. It owns what all figures share: the
// shadow frame, the theme sheet, rendering once on first approach, the
// no-JavaScript fallback, the fidelity label, and clean-up at disconnect.
import type { State } from '../engine';
import { fidelityLabel, t, type Fidelity, type Lang } from './strings';
import themeCss from './theme.css?raw';

let sheet: CSSStyleSheet | undefined;

/** The kit's stylesheet, built once and adopted by every shadow root. */
export function kitSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(themeCss);
  }
  return sheet;
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
  /** Height the stage keeps before rendering, so the figure does not shift the page. */
  static stageMinHeight = '0px';

  /** Where `render()` draws. */
  protected stage!: HTMLDivElement;
  private fallback!: HTMLSlotElement;
  private observer: IntersectionObserver | undefined;
  private controller = new AbortController();
  private rendered = false;

  /** Aborted at disconnect: pass it to listeners and steppers. */
  protected get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** `fr` when the closest `[lang]` starts with it, else `en`. */
  override get lang(): Lang {
    const tag = this.closest('[lang]')?.getAttribute('lang') ?? '';
    return tag.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }

  override set lang(value: string) {
    this.setAttribute('lang', value);
  }

  protected reducedMotion(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Called once, when the figure first comes within half a viewport. May be async. */
  protected abstract render(): void | Promise<void>;

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
        if (!entries.some((e) => e.isIntersecting)) return;
        this.observer?.disconnect();
        this.observer = undefined;
        void this.run();
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
    this.rendered = false;
    this.stage.replaceChildren();
  }

  private buildFrame(): void {
    const ctor = this.constructor as typeof PogoFigure;
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [kitSheet()];

    const frame = document.createElement('div');
    frame.className = 'frame';
    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    this.stage.style.setProperty('--_stage-min', ctor.stageMinHeight);
    this.fallback = document.createElement('slot');
    frame.append(this.stage, this.fallback);

    const label = document.createElement('p');
    label.className = 'fidelity';
    const text = fidelityLabel(this.lang, ctor.fidelity, ctor.source);
    const source = ctor.fidelity === 'measured' ? ctor.source : undefined;
    if (source) {
      label.append(text.slice(0, -source.length));
      const file = document.createElement('span');
      file.className = 'source';
      file.textContent = source;
      label.append(file);
    } else {
      label.textContent = text;
    }
    root.append(frame, label);
  }

  private async run(): Promise<void> {
    this.rendered = true;
    try {
      await this.render();
      this.fallback.hidden = true;
      this.removeAttribute('data-failed');
    } catch (error) {
      console.error(`${this.localName}: render failed`, error);
      this.setAttribute('data-failed', '');
      const message = document.createElement('p');
      message.className = 'failed';
      message.textContent = t(this.lang, 'failed');
      this.stage.replaceChildren(message);
      this.fallback.hidden = false;
    }
  }
}
