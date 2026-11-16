// One loader per tag, each a dynamic import: every element module becomes its
// own chunk, fetched when the first instance of its tag nears the screen
// (lazy-define.ts). The Record over `Tag` makes a tag without a loader, or a
// loader without a tag, a `tsc` error.
import type { Tag } from './manifest';

export type Loader = () => Promise<CustomElementConstructor>;

export const LOADERS: Record<Tag, Loader> = {
  'pogo-board': () => import('./elements/pogo-board').then((m) => m.PogoBoard),
  'pogo-title': () => import('./elements/pogo-title').then((m) => m.PogoTitle),
  'pogo-moves': () => import('./elements/pogo-moves').then((m) => m.PogoMoves),
  'pogo-line': () => import('./elements/pogo-line').then((m) => m.PogoLine),
  'pogo-count': () => import('./elements/pogo-count').then((m) => m.PogoCount),
  'pogo-reach': () => import('./elements/pogo-reach').then((m) => m.PogoReach),
  'pogo-retrograde': () => import('./elements/pogo-retrograde').then((m) => m.PogoRetrograde),
  'pogo-openings': () => import('./elements/pogo-openings').then((m) => m.PogoOpenings),
  'pogo-greedy': () => import('./elements/pogo-greedy').then((m) => m.PogoGreedy),
  'pogo-qsteps': () => import('./elements/pogo-qsteps').then((m) => m.PogoQsteps),
  'pogo-stages': () => import('./elements/pogo-stages').then((m) => m.PogoStages),
  'pogo-race': () => import('./elements/pogo-race').then((m) => m.PogoRace),
  'pogo-mosaic': () => import('./elements/pogo-mosaic').then((m) => m.PogoMosaic),
  'pogo-net': () => import('./elements/pogo-net').then((m) => m.PogoNet),
  'pogo-encoding': () => import('./elements/pogo-encoding').then((m) => m.PogoEncoding),
  'pogo-td-targets': () => import('./elements/pogo-td-targets').then((m) => m.PogoTdTargets),
  'pogo-search': () => import('./elements/pogo-search').then((m) => m.PogoSearch),
};

/**
 * Instances defined without waiting for the viewport. `<pogo-title>` is the page's
 * h1, already on screen: no observer round trip before it upgrades. A follow board
 * waits out of the page (display: none) until a game is under way, so it never
 * approaches; it must be defined to see the game start and appear.
 */
export function immediate(el: Element): boolean {
  return el.localName === 'pogo-title' || (el.localName === 'pogo-board' && el.getAttribute('mode') === 'follow');
}
