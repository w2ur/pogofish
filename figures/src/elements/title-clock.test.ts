import { FREE_PERIOD, OWN_SPREAD, freeRunning, jumpPhase, ownDelay, parseBeat, parseBeatAt, swayPhase } from './title-clock';

const PAGE = { beat: 0.4, beatAt: 0.28 };

describe('title clock', () => {
  it('tops every jump at beat-at + k × beat of the media time', () => {
    for (const k of [0, 1, 2, 7, 25]) expect(jumpPhase(0.28 + k * 0.4, PAGE)).toBeCloseTo(0.5, 9);
    // Half a beat later it is on the ground.
    const ground = jumpPhase(0.48, PAGE);
    expect(Math.min(ground, 1 - ground)).toBeCloseTo(0, 9);
    // A beat-at of another moment moves the top with it.
    expect(jumpPhase(0.1, { beat: 0.4, beatAt: 0.1 })).toBeCloseTo(0.5, 9);
    expect(jumpPhase(0.28, { beat: 0.4, beatAt: 0.1 })).not.toBeCloseTo(0.5, 2);
  });

  it('a piece’s own delay shifts its top by a few hundredths of a second at most', () => {
    expect(ownDelay(0)).toBeCloseTo(-OWN_SPREAD, 9);
    expect(ownDelay(0.999)).toBeLessThanOrEqual(OWN_SPREAD);
    expect(OWN_SPREAD).toBeLessThanOrEqual(0.05);
    const own = ownDelay(0.8);
    expect(jumpPhase(0.28 + own, PAGE, own)).toBeCloseTo(0.5, 9);
  });

  it('a loop restart re-phases by itself: the phase is a function of the media time alone', () => {
    // A 3.0 s clip looping: just before the end, then just after the restart.
    const before = jumpPhase(2.99, PAGE);
    const after = jumpPhase(0.01, PAGE);
    expect(after).toBeCloseTo(jumpPhase(0.01, PAGE), 12);
    expect(before).not.toBeCloseTo(after, 3);
    // After the restart the next top is at beat-at again.
    expect(jumpPhase(0.28, PAGE)).toBeCloseTo(0.5, 9);
  });

  it('a letter is at one side on each beat, the other side on the next', () => {
    const side = (x: number) => Math.min(x, 1 - x);
    expect(side(swayPhase(0.28, PAGE))).toBeCloseTo(0, 9);
    expect(swayPhase(0.68, PAGE)).toBeCloseTo(0.5, 9);
    expect(side(swayPhase(1.08, PAGE))).toBeCloseTo(0, 9);
  });

  it('without a clock: the beat as the period if given, else the period the title always had', () => {
    expect(freeRunning(undefined)).toEqual({ period: FREE_PERIOD });
    expect(FREE_PERIOD).toBe(1.24);
    expect(freeRunning(0.4)).toEqual({ period: 0.4 });
  });

  it('reads its attributes, refusing what is not a time', () => {
    expect(parseBeat('0.4')).toBe(0.4);
    for (const bad of [null, '', '0', '-1', 'fast']) expect(parseBeat(bad)).toBeUndefined();
    expect(parseBeatAt('0.28')).toBe(0.28);
    expect(parseBeatAt(null)).toBe(0);
    expect(parseBeatAt('x')).toBe(0);
  });
});
