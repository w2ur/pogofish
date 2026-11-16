import { afterEach, describe, expect, it, vi } from 'vitest';
import { fly, tween } from './motion';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('tween', () => {
  it('draws its first state at once and its last when it is cancelled, once', () => {
    const seen: number[] = [];
    const cancel = tween(500, (p) => seen.push(p));
    expect(seen).toEqual([0]);
    cancel();
    cancel();
    expect(seen).toEqual([0, 1]);
  });

  it('with no duration it draws only the last state', () => {
    const seen: number[] = [];
    tween(0, (p) => seen.push(p));
    expect(seen).toEqual([1]);
  });
});

describe('fly', () => {
  it('lands once, when cancelled before it left, and leaves no chip behind', () => {
    vi.useFakeTimers();
    const layer = document.createElement('div');
    const from = document.createElement('span');
    const to = document.createElement('span');
    layer.append(from, to);
    document.body.append(layer);
    const onLand = vi.fn();
    const cancel = fly({ layer, from, to, text: '0,10', flip: '−0,10', delay: 300, onLand });
    expect(onLand).not.toHaveBeenCalled();
    cancel();
    cancel();
    expect(onLand).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(layer.querySelector('.flyer')).toBeNull();
    expect(onLand).toHaveBeenCalledTimes(1);
  });

  it('once it has left, the chip is in the layer until it lands, and says its second text past half-way', () => {
    vi.useFakeTimers();
    const layer = document.createElement('div');
    const from = document.createElement('span');
    const to = document.createElement('span');
    layer.append(from, to);
    document.body.append(layer);
    const onLand = vi.fn();
    const cancel = fly({ layer, from, to, text: '0,10', flip: '−0,10', onLand });
    vi.advanceTimersByTime(0);
    const chip = layer.querySelector('.flyer')!;
    expect(chip.textContent).toBe('0,10');
    cancel();
    expect(chip.textContent).toBe('−0,10');
    expect(layer.querySelector('.flyer')).toBeNull();
    expect(onLand).toHaveBeenCalledTimes(1);
  });
});
