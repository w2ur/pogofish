import { describe, expect, it } from 'vitest';
import { LazyPlan } from './lazy-plan';

describe('LazyPlan', () => {
  it('imports a tag once, however many instances approach', () => {
    const plan = new LazyPlan(['pogo-a', 'pogo-b']);
    expect(plan.take(['pogo-a', 'pogo-a'])).toEqual(['pogo-a']);
    expect(plan.take(['pogo-a'])).toEqual([]);
    plan.settle('pogo-a', true);
    expect(plan.take(['pogo-a'])).toEqual([]);
    expect(plan.phase('pogo-a')).toBe('defined');
  });

  it('never retries a failed import', () => {
    const plan = new LazyPlan(['pogo-a']);
    expect(plan.take(['pogo-a'])).toEqual(['pogo-a']);
    plan.settle('pogo-a', false);
    expect(plan.phase('pogo-a')).toBe('failed');
    expect(plan.waiting('pogo-a')).toBe(false);
    expect(plan.take(['pogo-a'])).toEqual([]);
  });

  it('ignores tags it does not know, and tags the page already defined', () => {
    const plan = new LazyPlan(['pogo-a', 'pogo-b'], (t) => t === 'pogo-b');
    expect(plan.take(['div', 'pogo-z', 'pogo-b'])).toEqual([]);
    expect(plan.waiting('pogo-a')).toBe(true);
    expect(plan.waiting('pogo-b')).toBe(false);
  });

  it('reports when nothing is left to watch for', () => {
    const plan = new LazyPlan(['pogo-a', 'pogo-b']);
    plan.take(['pogo-a', 'pogo-b']);
    expect(plan.anyWaiting()).toBe(false);
  });

  it('a settle out of order changes nothing', () => {
    const plan = new LazyPlan(['pogo-a']);
    plan.settle('pogo-a', true);
    expect(plan.phase('pogo-a')).toBe('waiting');
  });
});
