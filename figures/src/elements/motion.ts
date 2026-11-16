// Motion that carries meaning in a figure, never decoration: a value that
// travels from where it is read to where it is written (`fly`), and a drawing
// that moves from one measured state to the next (`tween`). The caller checks
// reduced motion first; both end at once when cancelled, on their last state,
// so a figure stepped quickly is never left half-way.

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/**
 * Calls `draw(p)` with p from 0 to 1 over `ms`, eased, one call per animation
 * frame; returns a function that ends it now, on `draw(1)`.
 */
export function tween(ms: number, draw: (p: number) => void): () => void {
  if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
    draw(1);
    return () => {};
  }
  let frame = 0;
  let done = false;
  const start = performance.now();
  const tick = (now: number): void => {
    const p = Math.min(1, Math.max(0, (now - start) / ms));
    if (p >= 1) {
      done = true;
      draw(1);
      return;
    }
    draw(ease(p));
    frame = requestAnimationFrame(tick);
  };
  draw(0);
  frame = requestAnimationFrame(tick);
  return () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    draw(1);
  };
}

export interface Flight {
  /** The positioned element the chip is laid in (the figure's root). */
  layer: HTMLElement;
  from: Element;
  to: Element;
  /** What the chip says as it leaves, and, if it changes on the way (a sign), what it says as it lands. */
  text: string;
  flip?: string;
  ms?: number;
  /** Milliseconds before it leaves. */
  delay?: number;
  /** Called once, when the chip lands or the flight is cancelled: the destination then shows the value. */
  onLand: () => void;
}

/** Sends a chip saying `text` from `from` to `to`; returns a function that lands it now. */
export function fly(o: Flight): () => void {
  const chip = document.createElement('span');
  chip.className = 'flyer num';
  chip.setAttribute('aria-hidden', 'true');
  chip.textContent = o.text;
  let stop: (() => void) | undefined;
  let landed = false;
  const land = (): void => {
    if (landed) return;
    landed = true;
    chip.remove();
    o.onLand();
  };
  const timer = setTimeout(() => {
    const base = o.layer.getBoundingClientRect();
    const a = o.from.getBoundingClientRect();
    const b = o.to.getBoundingClientRect();
    const centre = (r: DOMRect): [number, number] => [r.left + r.width / 2 - base.left, r.top + r.height / 2 - base.top];
    const [x0, y0] = centre(a);
    const [x1, y1] = centre(b);
    o.layer.append(chip);
    stop = tween(o.ms ?? 900, (p) => {
      chip.style.left = `${x0 + (x1 - x0) * p}px`;
      chip.style.top = `${y0 + (y1 - y0) * p}px`;
      if (o.flip !== undefined && p >= 0.5) chip.textContent = o.flip;
      if (p >= 1) land();
    });
  }, o.delay ?? 0);
  return () => {
    clearTimeout(timer);
    stop?.();
    land();
  };
}
