import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/pack-v5.mjs run on a copy of its sources, laid out as in the repository
// (docs/experiments/v5/ two levels above figures/scripts/), one field doctored per case.
// The copy is no git repository: a source that passes every check stops at the date (exit 2).
const REPO = resolve(process.cwd(), '..');
type Curves = Record<string, Record<string, Record<string, unknown>>>;
let root: string;
let curves: Curves;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pack-v5-'));
  cpSync(join(REPO, 'docs/experiments/v5'), join(root, 'docs/experiments/v5'), { recursive: true });
  mkdirSync(join(root, 'figures/scripts'), { recursive: true });
  mkdirSync(join(root, 'figures/public/data'), { recursive: true });
  for (const f of ['pack-v5.mjs', 'v5-date.mjs']) cpSync(resolve(process.cwd(), 'scripts', f), join(root, 'figures/scripts', f));
  curves = JSON.parse(readFileSync(join(root, 'docs/experiments/v5/curves.json'), 'utf8')) as Curves;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Runs the script on curves.json changed by `doctor`: its exit code and what it said. */
function pack(doctor: (c: Curves) => void): { status: number | null; stderr: string } {
  const c = structuredClone(curves);
  doctor(c);
  writeFileSync(join(root, 'docs/experiments/v5/curves.json'), JSON.stringify(c));
  const run = spawnSync(process.execPath, [join(root, 'figures/scripts/pack-v5.mjs')], { encoding: 'utf8', timeout: 30_000 });
  return { status: run.status, stderr: run.stderr };
}

const written = () => readdirSync(join(root, 'figures/public/data'));

describe('pack-v5, on a source that contradicts itself', () => {
  it('a wrong field is a finding: exit 1, nothing written (the control)', () => {
    expect(pack((c) => ((c as Record<string, unknown>).rules = 'lc1-3'))).toMatchObject({ status: 1, stderr: expect.stringContaining('finding') });
    // And an untouched copy gets past every check of the sources, to the date.
    expect(pack(() => undefined)).toMatchObject({ status: 2, stderr: expect.stringContaining('git could not read') });
    expect(written()).toEqual([]);
  });

  // Regression: 25da136 — a missing seed list or mosaic list threw a TypeError, read as « could not run » (exit 2).
  it('a missing field is a finding too, not a script that could not run', () => {
    const cases: [string, (c: Curves) => void][] = [
      ['programs.td.seeds', (c) => delete c.programs!.td!.seeds],
      ['programs.td', (c) => delete c.programs!.td],
      ['programs', (c) => delete c.programs],
      ['mosaics.td', (c) => delete c.mosaics!.td],
      ['mosaics', (c) => delete c.mosaics],
      ['stages_pct', (c) => delete c.stages_pct],
    ];
    for (const [missing, doctor] of cases) {
      expect(pack(doctor), `without ${missing}`).toMatchObject({ status: 1, stderr: expect.stringContaining('finding') });
    }
    expect(written()).toEqual([]);
  });
});
