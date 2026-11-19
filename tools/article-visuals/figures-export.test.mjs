// node --test tools/article-visuals/figures-export.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { END_REST_MS, FIGURES_OF_ARTICLE, TICK_MS, framePlan, inkRows, overwrite, pngSize, ticks } from './figures-export.mjs';

test('one frame per beat, each held until the next beat or the end of its step', () => {
  const holds = [1000, 3000, 500];
  const beats = [[0], [0, 900, 2000], [0]];
  const plan = framePlan(3, (i) => holds[i], (i) => beats[i]);
  assert.deepEqual(
    plan.map((f) => [f.step, f.beat, f.at, f.ms]),
    [
      [0, 0, 0, 1000],
      [1, 0, 0, 900],
      [1, 1, 900, 1100],
      [1, 2, 2000, 1000],
      [2, 0, 0, 500],
    ],
  );
  // Nothing is sped up or cut: the frames add up to the figure's own play.
  assert.equal(
    plan.reduce((s, f) => s + f.ms, 0),
    holds.reduce((s, h) => s + h, 0),
  );
});

test('a figure that rests on its end has its last frame held at least END_REST_MS; a loop keeps its own rest', () => {
  const resting = framePlan(2, () => 1000, () => [0], false);
  assert.deepEqual(resting.map((f) => f.ms), [1000, END_REST_MS]);
  // Where the page holds it for nothing (the race's last event), the GIF still rests.
  assert.equal(framePlan(2, (i) => (i === 1 ? 0 : 500), () => [0], false).at(-1).ms, END_REST_MS);
  assert.equal(framePlan(2, () => 9000, () => [0], false).at(-1).ms, 9000);
  assert.deepEqual(framePlan(2, () => 1000, () => [0], true).map((f) => f.ms), [1000, 1000]);
  // The clock still stops where the figure's own step ends.
  assert.equal(resting.at(-1).until, 1000);
});

test('a hold becomes whole ticks of the time grid, never none', () => {
  assert.equal(ticks(1100), 1100 / TICK_MS);
  assert.equal(ticks(1274), Math.round(1274 / TICK_MS));
  assert.equal(ticks(0), 1);
  assert.equal(ticks(10), 1);
});

test('the rows that hold ink: the ground alone is blank, a mark is found where it is', () => {
  const width = 4;
  const ground = 240;
  const gray = new Uint8Array(width * 6).fill(ground);
  assert.equal(inkRows(gray, width, ground), null);
  gray[2 * width + 1] = 10;
  gray[4 * width + 3] = 200;
  assert.deepEqual(inkRows(gray, width, ground), [2, 4]);
  // Within the tolerance, a grey is still the ground (antialiasing of the page's own colour).
  gray[5 * width] = ground - 3;
  assert.deepEqual(inkRows(gray, width, ground), [2, 4]);
});

test('a PNG’s size is read from its header', () => {
  // The signature, then the IHDR chunk: its length, its name, the width and the height.
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(1440, 16);
  head.writeUInt32BE(987, 20);
  const png = join(mkdtempSync(join(tmpdir(), 'figures-export-')), 'head.png');
  writeFileSync(png, head);
  assert.deepEqual(pngSize(png), { width: 1440, height: 987 });
});

test('the article’s figures: one file each, the same names it holds, every element of the essay that the letter shows', () => {
  const names = FIGURES_OF_ARTICLE.map((f) => f.name);
  assert.equal(new Set(names).size, names.length);
  for (const f of FIGURES_OF_ARTICLE) {
    assert.match(f.name, /^fig-\d\d-[a-z-]+\.(gif|webp)$/);
    // A WebP is a still; a GIF is a sequence.
    assert.equal(f.still !== undefined, f.name.endsWith('.webp'), f.name);
    assert.match(f.tag, /^pogo-[a-z-]+$/);
  }
  assert.deepEqual(
    names.map((n) => Number(n.slice(4, 6))),
    Array.from({ length: 18 }, (_, k) => k + 2),
  );
});

test('a file is written over in place: same inode, its extended attributes kept, its old tail gone', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'figures-export-')), 'fig.gif');
  writeFileSync(file, 'a much longer old content');
  execFileSync('xattr', ['-w', 'com.example.item-id', 'ID-42', file]);
  const before = statSync(file).ino;
  overwrite(file, Buffer.from('new'));
  assert.equal(readFileSync(file, 'utf8'), 'new');
  assert.equal(statSync(file).ino, before);
  assert.equal(execFileSync('xattr', ['-p', 'com.example.item-id', file], { encoding: 'utf8' }).trim(), 'ID-42');
});
