import { describe, expect, it, vi } from 'vitest';
import { initial, play, type Triple } from '../engine';
import { replayView, resultWords } from './replay-view';

const move: Triple = [1, 2, 7];
const steps = [{ state: initial() }, { state: play(initial(), move), move }];
const spoken = ['Départ', 'Blanc joue b1-2-b3'].map((text) => ({ lines: [{ className: 'move', text }], title: text, live: text }));

describe('replayView', () => {
  it('stacks every step’s words, shows one, and says it in the live region', () => {
    const view = replayView({ steps, spoken, reducedMotion: () => true });
    view.show(1);
    const on = view.status.querySelectorAll('.said:not([data-off])');
    expect(on).toHaveLength(1);
    expect(on[0]!.textContent).toBe('Blanc joue b1-2-b3');
    expect(view.live.textContent).toBe('Blanc joue b1-2-b3');
    expect(view.slot.querySelector('svg title')!.textContent).toBe('Blanc joue b1-2-b3');
  });

  it('a sizer holds room in the same cell and is never shown', () => {
    const view = replayView({ steps, spoken, sizers: [[{ className: 'how', text: 'a long sentence' }]], reducedMotion: () => true });
    view.show(0);
    const sizer = view.status.querySelector('.said.sizer')!;
    expect(sizer.textContent).toBe('a long sentence');
    expect(view.status.querySelectorAll('.said:not([data-off]):not(.sizer)')).toHaveLength(1);
  });

  it('the pieces travel on a step forward only, and never under reduced motion', () => {
    const proto = Element.prototype as unknown as { animate?: unknown };
    const had = proto.animate;
    const animate = vi.fn();
    proto.animate = animate;
    try {
      let reduced = false;
      const view = replayView({ steps, spoken, reducedMotion: () => reduced });
      view.show(0);
      view.show(1);
      expect(animate).toHaveBeenCalled();
      animate.mockClear();
      view.show(0);
      reduced = true;
      view.show(1);
      expect(animate).not.toHaveBeenCalled();
    } finally {
      proto.animate = had;
    }
  });
});

describe('resultWords', () => {
  it('says who wins and how, by stacks or by repetition', () => {
    expect(resultWords('fr', { winner: 'W', byRepetition: false })).toEqual({
      who: 'Blanc gagne',
      how: 'Toutes les piles ont un sommet blanc.',
    });
    expect(resultWords('en', { winner: 'W', byRepetition: true }).how).toBe(
      'Red produced a position for the third time and loses, under the repetition rule.',
    );
  });
});
