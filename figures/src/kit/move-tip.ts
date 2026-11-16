// A move's name (« a3-1-b3 ») with its explanation in words (« De a3, 1 pièce,
// vers b3. »): shown in a small tooltip on hover and on focus (a tap focuses),
// dismissed by Escape, and the name's accessible description. Two forms:
//
// - moveTip(): the name as its own element, a tab stop (it is the only way a
//   keyboard reaches the explanation), and moveText(), which wraps every move
//   name a sentence holds;
// - tipControl(): a name that sits inside an existing control (a row of the
//   openings list): nothing nested is focusable, the explanation is the
//   control's own tooltip and part of its description.
//
// The tooltip is aria-hidden: a live region holding a move name says what it
// said before, never the explanation at every move; aria-describedby still
// reads it, since a directly referenced node counts even when hidden. It sits
// in the top layer (popover) where the browser has one, so no figure's
// overflow clips it, and its place is read once on show: above the name,
// below when there is no room, kept inside the figure and the viewport.
import { moveName, parseMoveName, type Move, type Triple } from '../engine';
import { t, type Lang } from './strings';

/** What a figure does while a move is explained: marks its cells on the figure's board. */
export interface TipHooks {
  show?(): void;
  hide?(): void;
}

const cellName = (i: number): string => `${'abc'[i % 3]}${Math.floor(i / 3) + 1}`;
/** A move as the engine lists it, or as a triple: [from, pieces, to]. */
export const asTriple = (m: Move | Triple): Triple => (Array.isArray(m) ? m : [m.from_cell, m.num_pieces, m.to_cell]);

/** « De a3, 1 pièce, vers b3. » / "From a3, 1 piece, to b3." */
export function moveWords(lang: Lang, m: Triple): string {
  const [from, n, to] = m;
  return `${t(lang, 'moveFrom')} ${cellName(from)}, ${n} ${t(lang, n === 1 ? 'movePiece' : 'movePieces')}, ${t(lang, 'moveTo')} ${cellName(to)}.`;
}

const MOVE_NAME = /([abc][123]-[123]-[abc][123])/;
const WHOLE_NAME = /^[abc][123]-[123]-[abc][123]$/;

let seq = 0;

/** Room kept between the tooltip and the name, and the edges it never crosses. */
const GAP = 4;
const EDGE = 4;

function tooltip(lang: Lang, m: Triple): HTMLElement {
  const tip = document.createElement('span');
  tip.className = 'move-tip';
  tip.id = `move-tip-${++seq}`;
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.textContent = moveWords(lang, m);
  return tip;
}

/** The figure the name belongs to (the shadow host), or the page: the tooltip stays inside it. */
function bounds(holder: Element): DOMRect {
  const root = holder.getRootNode();
  const host = root instanceof ShadowRoot ? root.host : document.documentElement;
  return host.getBoundingClientRect();
}

/** Places `tip` (position: fixed) by `holder`: three reads, once, on show. */
function place(holder: Element, tip: HTMLElement): void {
  const box = bounds(holder);
  const left = Math.max(box.left, EDGE);
  const right = Math.min(box.right, (globalThis.innerWidth || box.right) - EDGE);
  tip.style.maxWidth = `${Math.max(0, right - left)}px`;
  const name = holder.getBoundingClientRect();
  const size = tip.getBoundingClientRect();
  const x = Math.min(Math.max(name.left, left), Math.max(left, right - size.width));
  const above = name.top - GAP - size.height;
  const y = above >= EDGE ? above : name.bottom + GAP;
  // Floored: a rounded-up pixel would cross the figure's edge.
  tip.style.left = `${Math.floor(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}

/** Shows `tip` for `holder` on hover and focus, hides it on leave, blur, Escape and scroll. */
function wire(holder: HTMLElement, tip: HTMLElement, hooks: TipHooks = {}): void {
  const described = holder.getAttribute('aria-describedby');
  holder.setAttribute('aria-describedby', described ? `${described} ${tip.id}` : tip.id);
  holder.classList.add('has-move-tip');
  holder.append(tip);
  const popover = typeof tip.showPopover === 'function';
  if (popover) tip.setAttribute('popover', 'manual');

  let open = false;
  let hovered = false;
  const onScroll = (): void => hide();
  const show = (): void => {
    if (open || !holder.isConnected) return;
    open = true;
    tip.toggleAttribute('data-open', true);
    if (popover) tip.showPopover();
    place(holder, tip);
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    hooks.show?.();
  };
  function hide(): void {
    if (!open) return;
    open = false;
    tip.removeAttribute('data-open');
    if (popover && tip.matches(':popover-open')) tip.hidePopover();
    removeEventListener('scroll', onScroll, { capture: true });
    hooks.hide?.();
  }
  holder.addEventListener('pointerenter', () => {
    hovered = true;
    show();
  });
  holder.addEventListener('pointerleave', () => {
    hovered = false;
    if (!holder.matches(':focus')) hide();
  });
  holder.addEventListener('focus', show);
  holder.addEventListener('blur', () => {
    if (!hovered) hide();
  });
  holder.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open) return;
    // The explanation goes; the figure's own Escape (a lifted stack, a folded board) waits for the next press.
    e.preventDefault();
    e.stopPropagation();
    hide();
  });
}

/** A move's name as its own element: a tab stop carrying its explanation. */
export function moveTip(lang: Lang, move: Move | Triple, hooks?: TipHooks): HTMLElement {
  const m = asTriple(move);
  const name = document.createElement('span');
  name.className = 'move-name';
  name.tabIndex = 0;
  name.textContent = moveName(m);
  wire(name, tooltip(lang, m), hooks);
  return name;
}

/** A move's name inside an existing control: the control carries the explanation; nothing nested is focusable. */
export function tipControl(control: HTMLElement, lang: Lang, m: Move | Triple, hooks?: TipHooks): void {
  wire(control, tooltip(lang, asTriple(m)), hooks);
}

/** `text` with every move name in it as a moveTip(); `hooks` gives each its own. */
export function moveText(lang: Lang, text: string, hooks?: (m: Triple) => TipHooks): (string | HTMLElement)[] {
  return text
    .split(MOVE_NAME)
    .filter((part) => part !== '')
    .map((part) => {
      if (!WHOLE_NAME.test(part)) return part;
      const m = parseMoveName(part);
      return moveTip(lang, m, hooks?.(m));
    });
}
