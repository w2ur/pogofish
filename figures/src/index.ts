import { PogoBoard } from './elements/pogo-board';
import { PogoCount } from './elements/pogo-count';
import { PogoLine } from './elements/pogo-line';
import { PogoMoves } from './elements/pogo-moves';
import { PogoReach } from './elements/pogo-reach';
import { PogoRetrograde } from './elements/pogo-retrograde';
import { PogoTitle } from './elements/pogo-title';

export { manifest } from './manifest';

const ELEMENTS: [string, CustomElementConstructor][] = [
  ['pogo-board', PogoBoard],
  ['pogo-title', PogoTitle],
  ['pogo-moves', PogoMoves],
  ['pogo-line', PogoLine],
  ['pogo-count', PogoCount],
  ['pogo-reach', PogoReach],
  ['pogo-retrograde', PogoRetrograde],
];

/** Registers every `<pogo-…>` element; safe to call twice. */
export function defineAll(): void {
  for (const [name, ctor] of ELEMENTS) if (!customElements.get(name)) customElements.define(name, ctor);
}

export * from './engine';
