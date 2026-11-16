// <pogo-openings>: one picture, no animation of games. The position after a
// first move of White's that keeps the draw, then every reply Red has there as
// a small board showing the reply played (where it left, where it landed), its
// name and the solved table's verdict: the replies that keep the draw framed
// and set apart, those that lose from the fastest loss to the slowest
// (openings-verdicts.ts). The only motion is the boards landing one after the
// other the first time the figure comes on screen; at rest everything is
// shown. A board offers « Jouer cette position contre l’ordinateur » when it
// is pointed at, focused or tapped; nothing else is interactive.
import { announceMove } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import type { TableData } from '../data';
import { moveName, ready } from '../engine';
import type { ObserverCtor } from '../follow-panel';
import { drawBoard } from '../kit/board-svg';
import { controlButton } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { moveTip } from '../kit/move-tip';
import { colon, t, type Lang } from '../kit/strings';
import { sharedTable } from '../table';
import { replyGrid, verdictText, type ReplyCard, type ReplyGrid } from './openings-verdicts';
import openingsCss from './pogo-openings.css?raw';

/** « Gardent la nulle : 2 réponses sur 16 ». */
export function keepHead(lang: Lang, g: ReplyGrid): string {
  const n = g.keeps.length;
  return `${t(lang, 'openingsKeep')}${colon(lang)} ${n} ${t(lang, n === 1 ? 'openingsReply' : 'openingsReplies')} ${t(lang, 'outOf')} ${g.total}`;
}

/** « Perdent : 14 réponses, du gain blanc le plus rapide au plus lent ». */
export function loseHead(lang: Lang, g: ReplyGrid): string {
  const n = g.loses.length;
  return `${t(lang, 'openingsLose')}${colon(lang)} ${n} ${t(lang, n === 1 ? 'openingsReply' : 'openingsReplies')}, ${t(lang, 'openingsOrder')}`;
}

export class PogoOpenings extends PogoFigure {
  static override styles = openingsCss;
  static override stageMinHeight = '720px';

  /** The engine, the table and the observer that sees the figure come on screen; a test swaps them. */
  static deps: { engine: () => Promise<void>; table: () => Promise<TableData>; Observer?: ObserverCtor } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    table: sharedTable,
  };

  protected async render(signal: AbortSignal): Promise<void> {
    const deps = (this.constructor as typeof PogoOpenings).deps;
    const [table] = await Promise.all([deps.table(), deps.engine()]);
    if (signal.aborted) return;
    const lang = this.lang;
    // Fails here, before anything is drawn, if the table disagrees with legal().
    const grid = replyGrid(table);
    const opening = moveName(grid.opening);

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const root = el('div', 'openings');
    const cards: HTMLElement[] = [];
    const close = (): void => cards.forEach((c) => c.removeAttribute('data-open'));

    // The position Red replies in, with White's first move marked on it.
    const start = el('figure', 'card start');
    const [from, moving, to] = grid.opening;
    const said = `${t(lang, 'openingsPlayed')} ${opening}${colon(lang)} ${t(lang, 'openingsRedToPlay')}.`;
    const startShot = el('div', 'shot');
    startShot.append(drawBoard(grid.position, { from, to, moving, title: said }));
    const startCaption = el('figcaption', 'caption');
    const played = el('span', 'name');
    played.append(`${t(lang, 'openingsPlayed')} `, moveTip(lang, grid.opening));
    startCaption.append(played, el('span', 'verdict', t(lang, 'openingsRedToPlay')));
    start.append(startShot, startCaption);
    cards.push(start);

    const card = (c: ReplyCard): HTMLElement => {
      const name = moveName(c.move);
      const verdict = verdictText(lang, c.verdict);
      const node = el('figure', 'card reply');
      node.dataset.move = name;
      node.dataset.verdict = c.verdict.kind === 'keeps-draw' ? 'keeps' : 'loses';
      const shot = el('div', 'shot');
      const [f, n, d] = c.move;
      shot.append(drawBoard(c.after, { from: f, to: d, moving: n, title: `${announceMove(lang, 'Red', c.move)}${colon(lang)} ${verdict}.` }));
      const offer = controlButton(t(lang, 'playFromHere'), () => {
        this.playFrom(c.after, `${t(lang, 'openingsName')}, ${opening} ${name}`);
        close();
      });
      offer.classList.add('offer');
      offer.dataset.role = 'play-from-here';
      shot.append(offer);
      // A tap neither hovers nor focuses a board: it opens this board's offer, and closes the others'.
      shot.addEventListener(
        'click',
        (e) => {
          if (e.target instanceof Node && offer.contains(e.target)) return;
          const open = node.hasAttribute('data-open');
          close();
          node.toggleAttribute('data-open', !open);
        },
        { signal },
      );
      const caption = el('figcaption', 'caption');
      const named = el('span', 'name');
      named.append(moveTip(lang, c.move));
      caption.append(named, el('span', 'verdict', verdict));
      node.append(shot, caption);
      cards.push(node);
      return node;
    };

    const block = (className: string, head: string, list: ReplyCard[]): HTMLElement => {
      const section = el('section', `block ${className}`);
      const id = `openings-${className}`;
      const title = el('p', 'say head', head);
      title.id = id;
      const boards = el('div', 'cards');
      boards.setAttribute('role', 'group');
      boards.setAttribute('aria-labelledby', id);
      boards.append(...list.map(card));
      section.append(title, boards);
      return section;
    };

    const top = el('div', 'top');
    top.append(start, block('keep', keepHead(lang, grid), grid.keeps));
    root.append(top, block('lose', loseHead(lang, grid), grid.loses));
    cards.forEach((c, k) => c.style.setProperty('--k', String(k)));
    this.stage.append(root);
    this.land(root, signal);
  }

  /**
   * The boards land one after the other, in reading order, the first time a part of the
   * figure is on screen. Never under reduced motion, and never without an observer:
   * then everything is simply shown.
   */
  private land(root: HTMLElement, signal: AbortSignal): void {
    const Ctor =
      (this.constructor as typeof PogoOpenings).deps.Observer ??
      (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined);
    if (!Ctor || this.reducedMotion()) return;
    root.toggleAttribute('data-wait', true);
    const io = new Ctor(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        root.removeAttribute('data-wait');
        root.toggleAttribute('data-land', true);
      },
      { threshold: [0, 0.1] },
    );
    io.observe(root);
    signal.addEventListener('abort', () => io.disconnect(), { once: true });
  }
}
