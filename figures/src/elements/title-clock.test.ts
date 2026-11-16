import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('a loop restart re-phases by the media time: just after the start, where the beat puts it, not where the run left it', () => {
    // A 3.0 s clip: 2.99 s is 6.775 beats after beat-at, so 0.775 of a beat past a top (phase 0.275);
    // just after the restart, 0.01 s is 0.675 of a beat before the top at 0.28 (phase 0.825).
    expect(jumpPhase(2.99, PAGE)).toBeCloseTo(0.275, 9);
    expect(jumpPhase(0.01, PAGE)).toBeCloseTo(0.825, 9);
    // Running on from the end would have given 0.325: the restart jumps the phase, as the clip's time jumps.
    expect(jumpPhase(2.99 + 0.02, PAGE)).toBeCloseTo(0.325, 9);
    expect(jumpPhase(0.28, PAGE)).toBeCloseTo(0.5, 9);
  });

  it('the sheet’s paused delays place every piece where jumpPhase and swayPhase say', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/elements/pogo-title.css'), 'utf8');
    const delay = (selector: string): string => {
      const start = css.indexOf(`${selector} {`);
      const block = css.slice(start, css.indexOf('}', start));
      return /animation-delay: calc\(\((.*)\) \* 1s\);/.exec(block)![1]!;
    };
    /** The CSS sum, evaluated with the custom properties given. */
    const value = (expr: string, vars: Record<string, number>): number =>
      Function(`return ${expr.replace(/var\((--[\w-]+)(?:, [\d.]+)?\)/g, (_, v: string) => String(vars[v]))};`)() as number;
    const frac = (x: number) => x - Math.floor(x);
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
    for (const t of [0, 0.28, 1.13, 2.99]) {
      for (const own of [-0.03, 0, 0.02]) {
        const vars = { '--_beat': 0.4, '--_at': 0.28, '--own': own, '--clock': t };
        // A paused animation's place is minus its delay, over its duration.
        const jump = frac(-value(delay(':host([data-clock]) .disc'), vars) / 0.4);
        expect(near(jump, jumpPhase(t, PAGE, own))).toBeLessThan(1e-9);
        const sway = frac(-value(delay(':host([data-clock]) .sway::before'), vars) / 0.8);
        expect(near(sway, swayPhase(t, PAGE, own))).toBeLessThan(1e-9);
      }
    }
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
