import { PogoBoard } from './elements/pogo-board';
import { PogoCount } from './elements/pogo-count';
import { PogoGreedy } from './elements/pogo-greedy';
import { PogoLine } from './elements/pogo-line';
import { PogoMoves } from './elements/pogo-moves';
import { PogoOpenings } from './elements/pogo-openings';
import { PogoQsteps } from './elements/pogo-qsteps';
import { PogoRace } from './elements/pogo-race';
import { PogoReach } from './elements/pogo-reach';
import { PogoRetrograde } from './elements/pogo-retrograde';
import { PogoStages } from './elements/pogo-stages';
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
  ['pogo-openings', PogoOpenings],
  ['pogo-greedy', PogoGreedy],
  ['pogo-qsteps', PogoQsteps],
  ['pogo-stages', PogoStages],
  ['pogo-race', PogoRace],
];

/** Registers every `<pogo-…>` element; safe to call twice. */
export function defineAll(): void {
  for (const [name, ctor] of ELEMENTS) if (!customElements.get(name)) customElements.define(name, ctor);
}

export * from './engine';
