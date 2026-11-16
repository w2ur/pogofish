// <pogo-title>: the page's signature, inside its <h1>. The light-DOM text is the
// title and stays its accessible name; the element draws the same text over it,
// aria-hidden: every O a piece that jumps (the first half White, the second Red,
// the two camps facing each other), the letter that leads the Red camp and
// every « ! » in red, and the letters and the bangs rocking from side to side.
// The drawing is the text itself, set in the inherited font with each O kept as
// a transparent glyph carrying its disc and each rocking glyph as a transparent
// glyph carrying a copy of itself, so the box is the fallback's box at any size:
// no layout is read, nothing shifts. It breaks only between the title's groups
// (title-glyphs.ts), where a <wbr> stands, as the page's <wbr> in the light DOM
// lets the fallback break: a camp never splits, and the bangs only as a last
// resort.
//
// Free-running, it moves only while on screen, each disc at its own phase over
// one period (`beat`, else the period it always had). With `clock` (a selector
// for a media element of the page), `beat` and `beat-at`, the same CSS
// animations are paused and placed from one custom property, --clock, the
// media's currentTime, written in a requestAnimationFrame loop that runs only
// while the title is on screen and the media plays (title-clock.ts holds the
// formulas): the pieces stay on the beat when the clip loops, seeks or stalls,
// and freeze when it pauses. Still under reduced motion, with or without a clock.
import { PogoFigure } from '../kit/figure';
import titleCss from './pogo-title.css?raw';
import { freeRunning, ownDelay, parseBeat, parseBeatAt, SWAY_SPREAD } from './title-clock';
import { titleGroups, type Glyph } from './title-glyphs';

/** The golden ratio's fractional part: the bangs' own delays spread over ±SWAY_SPREAD. */
const SPREAD = 0.6180339887;
const frac = (x: number): number => x - Math.floor(x);

/** A glyph that rocks: transparent in the flow, its visible copy drawn and turned by CSS. */
function swaying(className: string, text: string, own: number, tilt: number): HTMLElement {
  const span = document.createElement('span');
  span.className = `${className} sway`;
  span.textContent = text;
  span.dataset.glyph = text;
  span.style.setProperty('--own', own.toFixed(3));
  span.style.setProperty('--tilt', `${tilt}deg`);
  return span;
}

/** One glyph as the drawing sets it: an O as a transparent letter carrying its disc, a letter or a bang rocking. */
function glyph(g: Glyph, bang: () => number): Node[] {
  if ('bang' in g) {
    const k = bang();
    return [swaying('bang', g.text, (frac((k + 1) * SPREAD) - 0.5) * 2 * SWAY_SPREAD, 5)];
  }
  if (!('disc' in g)) {
    // Each letter rocks on the beat; a space stays text.
    return [...g.text].map((ch) => (/\s/.test(ch) ? document.createTextNode(ch) : swaying(g.red ? 'letter red' : 'letter', ch, 0, 3)));
  }
  const o = document.createElement('span');
  o.className = 'o';
  o.textContent = g.text;
  const disc = document.createElement('span');
  disc.className = `disc ${g.disc.colour}`;
  disc.style.setProperty('--phase', g.disc.phase.toFixed(3));
  disc.style.setProperty('--lift', g.disc.lift.toFixed(3));
  disc.style.setProperty('--own', ownDelay(g.disc.phase).toFixed(3));
  o.append(disc);
  return [o];
}

export class PogoTitle extends PogoFigure {
  static override fidelity = 'illustrative' as const;
  static override styles = titleCss;

  protected render(signal: AbortSignal): void {
    const drawn = document.createElement('span');
    drawn.className = 'drawn';
    drawn.setAttribute('aria-hidden', 'true');
    let bangs = 0;
    // textContent skips the page's <wbr>: the groups are found from the text alone.
    titleGroups(this.textContent ?? '').forEach((group, k) => {
      if (k > 0) drawn.append(document.createElement('wbr'));
      const box = document.createElement('span');
      box.className = `part ${group.kind}`;
      for (const g of group.glyphs) box.append(...glyph(g, () => bangs++));
      drawn.append(box);
    });
    this.stage.replaceChildren(drawn);

    const beat = parseBeat(this.getAttribute('beat'));
    const beatAt = parseBeatAt(this.getAttribute('beat-at'));
    drawn.style.setProperty('--_period', String(freeRunning(beat).period));
    if (beat !== undefined) {
      drawn.style.setProperty('--_beat', String(beat));
      drawn.style.setProperty('--_at', String(beatAt));
    }

    let onScreen = false;
    let media: HTMLMediaElement | undefined;
    let frame = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const write = (): void => {
      if (media) drawn.style.setProperty('--clock', media.currentTime.toFixed(3));
    };
    const tick = (): void => {
      frame = 0;
      write();
      if (running()) frame = requestAnimationFrame(tick);
    };
    const running = (): boolean => media !== undefined && onScreen && !media.paused && !reduced.matches;
    /** Starts the loop when it should run, stops it when it should not; a paused clip still shows its moment. */
    const sync = (): void => {
      this.toggleAttribute('data-moving', onScreen && media === undefined);
      write();
      if (running()) {
        if (frame === 0) frame = requestAnimationFrame(tick);
      } else if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const seen = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      onScreen = last.isIntersecting;
      sync();
    });
    seen.observe(this);
    reduced.addEventListener('change', sync, { signal });

    // The clock: a media element the selector names, now or once the page adds it.
    const selector = beat === undefined ? null : this.getAttribute('clock');
    let watch: MutationObserver | undefined;
    const find = (): boolean => {
      if (!selector) return false;
      let found: Element | null = null;
      try {
        found = this.ownerDocument.querySelector(selector);
      } catch {
        return true; // Not a selector: nothing will ever match it; stay free-running.
      }
      if (!(found instanceof HTMLMediaElement)) return false;
      media = found;
      this.setAttribute('data-clock', '');
      for (const type of ['play', 'playing', 'pause', 'waiting', 'seeked', 'timeupdate', 'ended']) {
        media.addEventListener(type, sync, { signal });
      }
      sync();
      return true;
    };
    if (selector && !find()) {
      watch = new MutationObserver(() => {
        if (find()) watch?.disconnect();
      });
      watch.observe(this.ownerDocument.documentElement, { childList: true, subtree: true });
    }

    signal.addEventListener(
      'abort',
      () => {
        seen.disconnect();
        watch?.disconnect();
        if (frame !== 0) cancelAnimationFrame(frame);
        frame = 0;
        media = undefined;
        this.removeAttribute('data-moving');
        this.removeAttribute('data-clock');
      },
      { once: true },
    );
  }
}
