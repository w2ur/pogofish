import { afterEach, describe, expect, it, vi } from 'vitest';
import { intersect, observersOf, observing } from './test-dom';
import { lazyDefine, type LazyHandle } from './lazy-define';
import type { Loader } from './registry';

let n = 0;
/** Fresh tag names per test: the custom-element registry outlives a test. */
const fresh = (): string => `lazy-t${++n}`;

function counted(fail = false): { load: Loader; calls: () => number } {
  let calls = 0;
  return {
    load: async () => {
      calls++;
      if (fail) throw new Error('chunk 404');
      return class extends HTMLElement {};
    },
    calls: () => calls,
  };
}

function add(tag: string, parent: Element = document.body): HTMLElement {
  const el = document.createElement(tag);
  const p = document.createElement('p');
  p.textContent = 'fallback';
  el.append(p);
  parent.append(el);
  return el;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let handle: LazyHandle | undefined;
afterEach(() => {
  handle?.stop();
  handle = undefined;
  document.body.replaceChildren();
});

describe('lazyDefine', () => {
  it('imports nothing before an instance approaches, then defines its tag', async () => {
    const tag = fresh();
    const a = counted();
    const el = add(tag);
    handle = lazyDefine({ loaders: { [tag]: a.load } });
    await handle.settled();
    expect(a.calls()).toBe(0);
    expect(customElements.get(tag)).toBeUndefined();
    intersect(el);
    await handle.settled();
    expect(a.calls()).toBe(1);
    expect(customElements.get(tag)).toBeDefined();
    // Upgraded in place: the fallback is the same node, neither dropped nor duplicated.
    expect(el.querySelectorAll('p')).toHaveLength(1);
    expect(observing(el)).toBe(0);
  });

  it('two instances of a tag trigger one import', async () => {
    const tag = fresh();
    const a = counted();
    const one = add(tag);
    const two = add(tag);
    handle = lazyDefine({ loaders: { [tag]: a.load } });
    intersect(one);
    intersect(two);
    await handle.settled();
    expect(a.calls()).toBe(1);
  });

  it('a failed import leaves the tag undefined, its fallback in place, and is never retried', async () => {
    const tag = fresh();
    const a = counted(true);
    const errors: string[] = [];
    const one = add(tag);
    handle = lazyDefine({ loaders: { [tag]: a.load }, onError: (t) => errors.push(t) });
    intersect(one);
    await handle.settled();
    const two = add(tag);
    await tick();
    intersect(two);
    intersect(one);
    await handle.settled();
    expect(a.calls()).toBe(1);
    expect(errors).toEqual([tag]);
    expect(customElements.get(tag)).toBeUndefined();
    expect(one.textContent).toBe('fallback');
  });

  it('the default error report is one warning per tag, not an error per instance', async () => {
    const tag = fresh();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const els = [add(tag), add(tag), add(tag)];
      handle = lazyDefine({ loaders: { [tag]: counted(true).load } });
      for (const el of els) intersect(el);
      await handle.settled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('picks up an instance added after it started, nested or not', async () => {
    const tag = fresh();
    const a = counted();
    handle = lazyDefine({ loaders: { [tag]: a.load } });
    const panel = document.createElement('section');
    const el = add(tag, panel);
    document.body.append(panel);
    await tick();
    expect(observing(el)).toBe(1);
    intersect(el);
    await handle.settled();
    expect(customElements.get(tag)).toBeDefined();
  });

  it('an immediate instance is imported without waiting for the viewport', async () => {
    const tag = fresh();
    const a = counted();
    add(tag);
    handle = lazyDefine({ loaders: { [tag]: a.load }, when: (el) => (el.localName === tag ? 'now' : 'approach') });
    await handle.settled();
    expect(a.calls()).toBe(1);
    expect(customElements.get(tag)).toBeDefined();
  });

  it('a waiting instance is neither observed nor imported until wake(), which imports once', async () => {
    const tag = fresh();
    const absent = fresh();
    const a = counted();
    const b = counted();
    const el = add(tag);
    handle = lazyDefine({ loaders: { [tag]: a.load, [absent]: b.load }, when: () => 'wait' });
    expect(observing(el)).toBe(0);
    await handle.settled();
    expect(a.calls()).toBe(0);
    handle.wake(absent);
    handle.wake(tag);
    handle.wake(tag);
    await handle.settled();
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(0);
    expect(customElements.get(tag)).toBeDefined();
  });

  it('a class the registry refuses fails like a failed import: one warning, never retried', async () => {
    const taken = fresh();
    const tag = fresh();
    const ctor = class extends HTMLElement {};
    customElements.define(taken, ctor);
    let calls = 0;
    const errors: string[] = [];
    const el = add(tag);
    handle = lazyDefine({
      loaders: {
        [tag]: async () => {
          calls++;
          return ctor; // already defined under another name: define() throws
        },
      },
      onError: (t) => errors.push(t),
    });
    intersect(el);
    await handle.settled();
    intersect(add(tag));
    await tick();
    await handle.settled();
    expect(errors).toEqual([tag]);
    expect(calls).toBe(1);
    expect(customElements.get(tag)).toBeUndefined();
    expect(el.textContent).toBe('fallback');
  });

  it('imports every present tag at once when IntersectionObserver is missing', async () => {
    const tag = fresh();
    const absent = fresh();
    const a = counted();
    const b = counted();
    add(tag);
    const saved = globalThis.IntersectionObserver;
    // @ts-expect-error: a browser without the API.
    delete globalThis.IntersectionObserver;
    try {
      handle = lazyDefine({ loaders: { [tag]: a.load, [absent]: b.load } });
      await handle.settled();
      expect(a.calls()).toBe(1);
      expect(b.calls()).toBe(0);
      add(absent);
      await tick();
      await handle.settled();
      expect(b.calls()).toBe(1);
    } finally {
      globalThis.IntersectionObserver = saved;
    }
  });

  it('leaves a tag the page already defined alone', async () => {
    const tag = fresh();
    customElements.define(tag, class extends HTMLElement {});
    const a = counted();
    const el = add(tag);
    handle = lazyDefine({ loaders: { [tag]: a.load } });
    intersect(el);
    await handle.settled();
    expect(a.calls()).toBe(0);
    expect(observing(el)).toBe(0);
  });

  it('asks the observer for a margin wider than the kit render margin', () => {
    const tag = fresh();
    const el = add(tag);
    handle = lazyDefine({ loaders: { [tag]: counted().load } });
    expect(observersOf(el).map((o) => o.options.rootMargin)).toEqual(['100%']);
  });
});
