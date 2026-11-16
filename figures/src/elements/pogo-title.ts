// <pogo-title>: the page's signature, inside its <h1>. The light-DOM text is the
// title and stays its accessible name; the element draws the same text over it,
// aria-hidden: every O a piece that jumps (the first half White, the second Red,
// the two camps facing each other) and every « ! » in red. The drawing is the text itself,
// set in the inherited font with each O kept as a transparent glyph, so the
// box is the fallback's box at any size and wraps where it wraps: no layout is
// read, nothing shifts. Still under reduced motion, and still off screen.
import { PogoFigure } from '../kit/figure';
import titleCss from './pogo-title.css?raw';
import { titleGlyphs } from './title-glyphs';

export class PogoTitle extends PogoFigure {
  static override fidelity = 'illustrative' as const;
  static override styles = titleCss;

  protected render(signal: AbortSignal): void {
    const drawn = document.createElement('span');
    drawn.className = 'drawn';
    drawn.setAttribute('aria-hidden', 'true');
    for (const g of titleGlyphs(this.textContent ?? '')) {
      if ('bang' in g) {
        const bang = document.createElement('span');
        bang.className = 'bang';
        bang.textContent = g.text;
        drawn.append(bang);
        continue;
      }
      if (!('disc' in g)) {
        drawn.append(g.text);
        continue;
      }
      const o = document.createElement('span');
      o.className = 'o';
      o.textContent = g.text;
      const disc = document.createElement('span');
      disc.className = `disc ${g.disc.colour}`;
      disc.style.setProperty('--phase', g.disc.phase.toFixed(3));
      disc.style.setProperty('--lift', g.disc.lift.toFixed(3));
      o.append(disc);
      drawn.append(o);
    }
    this.stage.replaceChildren(drawn);

    // The discs jump only while the title is on screen; CSS keeps them still under reduced motion.
    const seen = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) this.toggleAttribute('data-moving', last.isIntersecting);
    });
    seen.observe(this);
    signal.addEventListener(
      'abort',
      () => {
        seen.disconnect();
        this.removeAttribute('data-moving');
      },
      { once: true },
    );
  }
}
