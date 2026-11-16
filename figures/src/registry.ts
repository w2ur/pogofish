// One loader per tag, each a dynamic import: every element module becomes its
// own chunk, fetched when the first instance of its tag nears the screen
// (lazy-define.ts). The Record over `Tag` makes a tag without a loader, or a
// loader without a tag, a `tsc` error.
import type { When } from './lazy-define';
import type { Tag } from './manifest';
import { sessionHoldsGame } from './saved';

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
 * When an instance's tag is imported. `<pogo-title>` is the page's h1, already on
 * screen: no observer round trip before it upgrades. A follow board shows nothing
 * until a game is under way, so nearing the screen says nothing about it: it is
 * imported at once when a game is saved (it restores and shows it), and otherwise
 * waits for the first game, which index.ts wakes it for (a figure's
 * `pogo:playfrom`; an inline board starting one has already defined the tag).
 */
export function when(el: Element): When {
  if (el.localName === 'pogo-title') return 'now';
  if (el.localName === 'pogo-board' && el.getAttribute('mode') === 'follow') return sessionHoldsGame() ? 'now' : 'wait';
  return 'approach';
}
