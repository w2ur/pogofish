import { PogoBoard } from './elements/pogo-board';
import { PogoTitle } from './elements/pogo-title';

export { manifest } from './manifest';

const ELEMENTS: [string, CustomElementConstructor][] = [
  ['pogo-board', PogoBoard],
  ['pogo-title', PogoTitle],
];

/** Registers every `<pogo-…>` element; safe to call twice. */
export function defineAll(): void {
  for (const [name, ctor] of ELEMENTS) if (!customElements.get(name)) customElements.define(name, ctor);
}

export * from './engine';
