import { PogoBoard } from './elements/pogo-board';

export { manifest } from './manifest';

/** Registers every `<pogo-…>` element; safe to call twice. */
export function defineAll(): void {
  if (!customElements.get('pogo-board')) customElements.define('pogo-board', PogoBoard);
}

export * from './engine';
