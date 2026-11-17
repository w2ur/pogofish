import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The figures' layout is CSS, which happy-dom does not lay out: these read the sheets.
// The browser check (dev harness at 320 px and ?box=1100) is in the round's report.
const css = (name: string): string =>
  readFileSync(resolve(process.cwd(), `src/elements/${name}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sheet: string, selector: string): string => {
  const at = sheet.indexOf(`${selector} {`);
  expect(at, `${selector} has a rule`).toBeGreaterThanOrEqual(0);
  return sheet.slice(at, sheet.indexOf('}', at));
};
const wide = (sheet: string): string => {
  const at = sheet.indexOf('@container (min-width: 720px)');
  expect(at, 'a 720px container query').toBeGreaterThanOrEqual(0);
  return sheet.slice(at);
};

describe('every figure is centred in its box, and the wide ones use it', () => {
  it('pogo-moves: board, line and transport in one centred column', () => {
    const s = css('pogo-moves');
    expect(rule(s, '.moves')).toContain('align-items: center');
    expect(rule(s, '.moves > .controls')).toContain('justify-content: center');
  });

  it('pogo-line: one column of the board’s width, centred, its transport too', () => {
    const s = css('pogo-line');
    expect(rule(s, '.line-figure')).toContain('margin-inline: auto');
    expect(rule(s, '.line-figure')).toContain('width: min(100%, 400px)');
    expect(rule(s, '.line-figure > .controls')).toContain('justify-content: center');
  });

  it('pogo-count: the line, the drawing and the transport centred; the row beside the board from 720px', () => {
    const s = css('pogo-count');
    expect(rule(s, '.count')).toContain('text-align: center');
    expect(rule(s, '.count')).toContain('align-items: center');
    // The drawing itself changes layout with the width (count-view.ts): the sheet keeps its room.
    wide(s);
    expect(rule(s, '.count > .controls')).toContain('justify-content: center');
  });

  it('pogo-board inline: one centred column, the setup and the moves beside the board from 720px', () => {
    const s = css('pogo-board');
    expect(rule(s, ".pb[data-mode='inline'] > .body")).toContain('justify-content: center');
    const w = wide(s);
    expect(w).toMatch(/grid-template-columns: minmax\(0, 400px\) minmax\(240px, 320px\)/);
    expect(w).toMatch(/> \.next \{\s*grid-column: 2;/);
  });

  it('pogo-search: the board beside the table from 720px, centred in its column below it', () => {
    const s = css('pogo-search');
    const w = wide(s);
    expect(w).toMatch(/\.stage > \.search \{\s*display: grid;\s*grid-template-columns: 300px minmax\(0, 1fr\);/);
    expect(s).toMatch(/^\.board-slot \{[^}]*justify-content: center/m);
    // Scoped to the figure's root: the table, also of class « search », is not a grid of two columns.
    expect(w).not.toMatch(/^\s*\.search \{/m);
  });
});

describe('round 3, lot B2: three figures that use the width', () => {
  it('pogo-qsteps: the moves beside the board from 520px, the notebook beside them from 900px, the transport centred', () => {
    const s = css('pogo-qsteps');
    expect(s).toMatch(/@container \(min-width: 520px\) \{\s*\.body \{[^}]*grid-template-areas: 'slot moves' 'book book' 'formula formula'/);
    expect(s).toMatch(/@container \(min-width: 900px\) \{\s*\.body \{[^}]*grid-template-areas: 'slot moves book' 'slot formula formula'/);
    // Regression: since 3420d4d the transport sits in .walk (under the rate control), and `.qsteps > .controls` matched nothing.
    expect(rule(s, '.walk > .controls')).toContain('justify-content: center');
  });

  it('pogo-stages: the curve beside the board from 520px, under it below', () => {
    const s = css('pogo-stages');
    expect(rule(s, '.layout')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(s).toMatch(/@container \(min-width: 520px\) \{\s*\.layout \{\s*grid-template-columns: minmax\(0, 5fr\) minmax\(0, 6fr\)/);
    expect(rule(s, '.game')).toContain('margin-inline: auto');
  });

  it('pogo-td-targets: chart and ticks share one column per position; the sum sits beside the two positions from 520px, under them below', () => {
    const s = css('pogo-td-targets');
    expect(rule(s, '.row')).toContain('grid-template-columns: repeat(var(--n), minmax(0, 1fr))');
    expect(rule(s, '.glass')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(s).toMatch(/@container \(min-width: 520px\) \{\s*\.film \{[^}]*\}\s*\.glass \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    expect(rule(s, '.td-targets > .controls')).toContain('justify-content: center');
  });

  it('each keeps its room before it renders, per width', () => {
    for (const name of ['pogo-qsteps', 'pogo-stages', 'pogo-td-targets']) {
      const s = css(name);
      expect(rule(s, ':host')).toContain('container-type: inline-size');
      expect(s.match(/\.stage \{\s*min-height: \d+px;/g), name).toHaveLength(3);
    }
  });
});
