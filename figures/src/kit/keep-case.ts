// Text for the uppercase cuts (labels, controls) with the characters that must
// keep their case left out of the transform: a lowercase Greek letter is a
// symbol (the λ of TD(λ)), and uppercased it becomes another (Λ). Each run of
// them is wrapped in a `.keep-case` span, which theme.css sets to
// `text-transform: none`; the text content, and so what is read aloud, is
// unchanged.

/** Lowercase Greek letters: symbols that an uppercase cut must not reach. */
const KEEP = /([α-ω]+)/u;

export function keepCase(text: string): (string | HTMLElement)[] {
  return text
    .split(KEEP)
    .filter((part) => part !== '')
    .map((part) => {
      if (!KEEP.test(part)) return part;
      const span = document.createElement('span');
      span.className = 'keep-case';
      span.textContent = part;
      return span;
    });
}
