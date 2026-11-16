import { describe, expect, it } from 'vitest';
import { initial } from '../engine';

// Each element is its own chunk: a figure that hands a position over can be on the
// page before any board. The kit brings the store, so the event is never lost.
describe('the kit and the store', () => {
  it('a pogo:playfrom from a figure reaches the store when no board module was loaded', async () => {
    const { PogoFigure } = await import('./figure');
    class Hander extends PogoFigure {
      protected render(): void {}
      hand(): void {
        this.playFrom(initial(), 'from a figure');
      }
    }
    customElements.define('kit-hander', Hander);
    const el = document.createElement('kit-hander') as Hander;
    document.body.append(el);
    el.hand();
    // Imported only now: had the kit not brought it, its listener would not have heard the event.
    const { store } = await import('../store');
    expect(store.current()?.label).toBe('from a figure');
    el.remove();
  });
});
