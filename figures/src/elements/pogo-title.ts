// <pogo-title>: the page's signature, inside its <h1>. The light-DOM text is the
// title and stays its accessible name; the element draws the same text over it,
// aria-hidden: every O a piece that jumps (the first half White, the second Red,
// the two camps facing each other), the letter that leads the Red camp and
// every « ! » in red. The drawing is the text itself, set in the inherited font
// with each O kept as a transparent glyph, so the box is the fallback's box at
// any size: no layout is read, nothing shifts. It breaks only between the
// title's groups (title-glyphs.ts), where a <wbr> stands, as the page's <wbr>
// in the light DOM lets the fallback break: a camp never splits, and the
// bangs only as a last resort. Still under reduced motion, and still off screen.
import { PogoFigure } from '../kit/figure';
import titleCss from './pogo-title.css?raw';
import { titleGroups, type Glyph } from './title-glyphs';

/** One glyph as the drawing sets it: an O as a transparent letter carrying its disc, a bang or a red letter in red. */
function glyph(g: Glyph): Node {
  if ('bang' in g) {
    const bang = document.createElement('span');
    bang.className = 'bang';
    bang.textContent = g.text;
    return bang;
  }
  if (!('disc' in g)) {
    if (!g.red) return document.createTextNode(g.text);
    const letter = document.createElement('span');
    letter.className = 'letter red';
    letter.textContent = g.text;
    return letter;
  }
  const o = document.createElement('span');
  o.className = 'o';
  o.textContent = g.text;
  const disc = document.createElement('span');
  disc.className = `disc ${g.disc.colour}`;
  disc.style.setProperty('--phase', g.disc.phase.toFixed(3));
  disc.style.setProperty('--lift', g.disc.lift.toFixed(3));
  o.append(disc);
  return o;
}

export class PogoTitle extends PogoFigure {
  static override fidelity = 'illustrative' as const;
  static override styles = titleCss;

  protected render(signal: AbortSignal): void {
    const drawn = document.createElement('span');
    drawn.className = 'drawn';
    drawn.setAttribute('aria-hidden', 'true');
    // textContent skips the page's <wbr>: the groups are found from the text alone.
    titleGroups(this.textContent ?? '').forEach((group, k) => {
      if (k > 0) drawn.append(document.createElement('wbr'));
      const box = document.createElement('span');
      box.className = `part ${group.kind}`;
      for (const g of group.glyphs) box.append(glyph(g));
      drawn.append(box);
    });
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
