// figures-export.mjs OUT_DIR [--only NAME[,NAME…]] [--into DIR]
//
// Draws the article's figures from the page's own elements (figures/, in export
// mode: src/kit/export.ts), on the light theme, every figure at the same width
// on the same ground and margin. A film or a toy's introduction becomes a GIF
// with one frame per beat of each step, held for as long as the figure holds it
// (no speed-up, no cut); a still becomes a WebP. Frames are taken at twice the
// pixel density; a GIF is then brought down to WIDTH, a WebP kept at 2×.
//
// OUT_DIR receives each figure's frames (OUT_DIR/NAME/) and its file. With
// --into, each file is then written over the file of the same name in DIR, which
// must already exist (its content replaced in place, so a synced folder keeps the
// file's identity); a Google Drive file's ID is read before and after, and the
// script stops at the first one that changed.
//
// Needs `npm install` in figures/ and in app/ (Playwright), Chrome, and gifski.
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, ftruncateSync, linkSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIGURES = resolve(HERE, '../../figures');
const APP = resolve(HERE, '../../app');

/** The picture's width in CSS px, margin included, and the margin. */
export const WIDTH = 720;
export const PAD = 24;
/** A GIF's time grid: every hold is rounded to it (gifski merges the repeated frames). */
export const TICK_MS = 50;
/** A motion lasting at least MOTION_MIN_MS is sampled every MOTION_MS, for a figure that asks (`motion`). */
export const MOTION_MIN_MS = 400;
export const MOTION_MS = 100;
/** How long a GIF holds the end of a figure that rests there, before it starts again. */
export const END_REST_MS = 4000;
/** The light page ground (figures/dev/export.html, --pogo-ground). */
const GROUND = '0xeff1f2';
const DRIVE_ID ='com.google.drivefs.item-id#S';

/**
 * The article's figures, in its order: the file each one replaces, and the element as
 * the essay uses it (figures/dev/essay.ts). `still` names the step a WebP shows.
 */
export const FIGURES_OF_ARTICLE = [
  { name: 'fig-02-depart.webp', tag: 'pogo-moves', attrs: { view: 'start' }, still: 0 },
  { name: 'fig-03-coups.gif', tag: 'pogo-moves', attrs: { view: 'moves' } },
  { name: 'fig-04-partie-courte.gif', tag: 'pogo-line', attrs: { line: 'shortestWin', rules: 'A' } },
  { name: 'fig-05-boucle.gif', tag: 'pogo-line', attrs: { line: 'loop', rules: 'A' } },
  { name: 'fig-06-combinatoire.gif', tag: 'pogo-count', attrs: {}, motion: true },
  { name: 'fig-07-exploration.gif', tag: 'pogo-reach', attrs: {} },
  { name: 'fig-08-retrograde.gif', tag: 'pogo-retrograde', attrs: {} },
  { name: 'fig-09-centre.gif', tag: 'pogo-line', attrs: { line: 'centreLoss', rules: 'A' } },
  { name: 'fig-10-ouvertures.gif', tag: 'pogo-openings', attrs: {} },
  { name: 'fig-11-glouton.gif', tag: 'pogo-greedy', attrs: {} },
  { name: 'fig-12-qlearning.gif', tag: 'pogo-qsteps', attrs: {} },
  { name: 'fig-13-reseau-td.gif', tag: 'pogo-net', attrs: { kind: 'td' } },
  { name: 'fig-14-encodage.webp', tag: 'pogo-encoding', attrs: {}, still: 'last' },
  { name: 'fig-15-td-cibles.gif', tag: 'pogo-td-targets', attrs: {} },
  { name: 'fig-16-reseau-alphazero.gif', tag: 'pogo-net', attrs: { kind: 'az' } },
  { name: 'fig-17-recherche-alphazero.gif', tag: 'pogo-search', attrs: { position: 'puzzle5' }, wait: 180000, motion: true },
  { name: 'fig-18-course.gif', tag: 'pogo-race', attrs: {} },
  { name: 'fig-19-mosaiques.gif', tag: 'pogo-mosaic', attrs: {} },
];

/**
 * The frames of a sequence: one per beat of each step, each held until the next beat or the
 * end of its step. `hold` and `beats` as the figure offers them (src/kit/export.ts). A figure that
 * does not loop rests on its end for as long as the reader looks; a GIF starts again, so its last
 * frame is held at least END_REST_MS.
 */
export function framePlan(steps, hold, beats, loops = true) {
  const plan = [];
  for (let i = 0; i < steps; i++) {
    const offsets = beats(i);
    const end = hold(i);
    offsets.forEach((at, k) => {
      const next = offsets[k + 1] ?? end;
      plan.push({ step: i, beat: k, at, until: next, ms: next - at });
    });
  }
  const last = plan.at(-1);
  if (!loops && last) last.ms = Math.max(last.ms, END_REST_MS);
  return plan;
}

/** How many copies of a frame, on the TICK_MS grid, hold it `ms` (at least one). */
export function ticks(ms) {
  return Math.max(1, Math.round(ms / TICK_MS));
}

function parseArgs(argv) {
  const out = argv[0];
  if (!out || out.startsWith('--')) throw new Error('usage: figures-export.mjs OUT_DIR [--only NAME,…] [--into DIR]');
  const opt = (flag) => {
    const k = argv.indexOf(flag);
    return k >= 0 ? argv[k + 1] : undefined;
  };
  return { out: resolve(out), only: opt('--only')?.split(','), into: opt('--into') && resolve(opt('--into')) };
}

function driveId(file) {
  try {
    return execFileSync('xattr', ['-p', DRIVE_ID, file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

async function startServer() {
  execFileSync('node', ['scripts/copy-wasm.mjs'], { cwd: FIGURES, stdio: 'inherit' });
  const vitePath = createRequire(join(FIGURES, 'package.json')).resolve('vite');
  const { createServer } = await import(pathToFileURL(vitePath).href);
  const server = await createServer({ root: FIGURES, configFile: join(FIGURES, 'vite.config.ts'), server: { port: 5287, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
  await server.listen();
  return { server, base: server.resolvedUrls.local[0].replace(/\/$/, '') };
}

/**
 * Holds every animation of the figure that has not finished (they run in real time, not on the
 * page's clock): paused where they are, so the frame can be set to any moment of the beat.
 * Returns how long the longest still has to run, in ms.
 */
async function holdMotion(page) {
  return page.evaluate(() => {
    const held = window.pogoExport.shadowRoot.getAnimations().filter((a) => {
      const end = a.effect?.getComputedTiming().endTime;
      return typeof end === 'number' && end !== Infinity && a.playState !== 'finished';
    });
    for (const a of held) a.pause();
    window.pogoHeld = held.map((a) => ({ a, from: Number(a.currentTime ?? 0), end: Number(a.effect.getComputedTiming().endTime) }));
    return Math.max(0, ...window.pogoHeld.map((h) => h.end - h.from));
  });
}

/** Sets every held animation `ms` after where it was held, at most to its end. */
async function seekMotion(page, ms) {
  await page.evaluate((t) => {
    for (const h of window.pogoHeld) h.a.currentTime = Math.min(h.end, h.from + t);
  }, ms);
  await page.waitForTimeout(60);
}

async function capture(page, base, fig, dir) {
  const q = new URLSearchParams({ tag: fig.tag, attrs: JSON.stringify(fig.attrs), lang: 'fr', width: String(WIDTH - 2 * PAD), pad: String(PAD) });
  await page.clock.install();
  await page.goto(`${base}/dev/export.html?${q}`);
  await page.waitForFunction(() => window.pogoExport || window.pogoExportError, null, { timeout: 120000 });
  const error = await page.evaluate(() => window.pogoExportError);
  if (error) throw new Error(`${fig.name}: ${error}`);
  // A figure that must compute first (the search) offers its sequence once it has; one that
  // offers none within the wait is drawn as it rendered, as one still.
  const steps = await page
    .waitForFunction(() => window.pogoExport.exportSequence()?.steps ?? false, null, { timeout: fig.wait ?? 3000 })
    .then((h) => h.jsonValue())
    .catch(() => 0);
  // From here the page's timers run only when told: each beat is reached exactly.
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
  const plan = steps
    ? await page.evaluate(() => {
        const s = window.pogoExport.exportSequence();
        return { loops: s.loops, steps: Array.from({ length: s.steps }, (_, i) => ({ hold: s.hold(i), beats: s.beats(i) })) };
      })
    : [];
  const frames = steps ? framePlan(steps, (i) => plan.steps[i].hold, (i) => plan.steps[i].beats, plan.loops) : [{ step: 0, beat: 0, at: 0, until: 0, ms: 0 }];
  const shot = page.locator('#shot');
  const wanted = fig.still === undefined ? null : fig.still === 'last' ? Math.max(0, steps - 1) : fig.still;
  const taken = [];
  const take = async (f, ms) => {
    const file = join(dir, `f${String(taken.length).padStart(4, '0')}.png`);
    await shot.screenshot({ path: file, animations: 'allow' });
    taken.push({ ...f, ms, file });
  };
  let clock = 0;
  for (const f of frames) {
    if (f.beat === 0) {
      if (steps) await page.evaluate((i) => window.pogoExport.exportSequence().go(i), f.step);
      clock = 0;
    }
    const still = wanted !== null;
    if (still && f.step !== wanted) {
      await page.clock.runFor(Math.max(1, f.until - 1 - clock));
      clock = f.until - 1;
      continue;
    }
    // The beat's own change happens at its start: its timers fire, its animations begin.
    if (f.at > clock) await page.clock.runFor(f.at - clock);
    clock = Math.max(clock, f.at);
    const longest = await holdMotion(page);
    // A motion long enough to be seen is sampled (MOTION_MS apart), while it runs within the beat.
    let shown = 0;
    if (fig.motion && !still && longest >= MOTION_MIN_MS) {
      for (; shown + MOTION_MS < Math.min(longest, f.ms - MOTION_MS); shown += MOTION_MS) {
        await seekMotion(page, shown);
        await take(f, MOTION_MS);
      }
    }
    // The rest of the beat on the page's clock (a figure drawn by requestAnimationFrame moves
    // on it), then the beat as the reader sees it last, just before the next one.
    const ahead = Math.max(0, f.until - 1 - clock);
    if (ahead > 0) await page.clock.runFor(ahead);
    clock += ahead;
    await seekMotion(page, still ? 1e9 : Math.max(0, f.ms - 1));
    await take(f, Math.max(MOTION_MS, f.ms - shown));
    if (still) break;
  }
  return taken;
}

/** Replaces `dest`'s content in place: opened as it is, emptied, written; never unlinked or recreated. */
export function overwrite(dest, bytes) {
  const fd = openSync(dest, 'r+');
  try {
    ftruncateSync(fd, 0);
    writeSync(fd, bytes, 0, bytes.length, 0);
  } finally {
    closeSync(fd);
  }
}

/** A PNG's size, from its header. */
export function pngSize(file) {
  const head = readFileSync(file).subarray(16, 24);
  return { width: head.readUInt32BE(0), height: head.readUInt32BE(4) };
}

/**
 * The rows of a frame that hold anything but the ground, as [first, last], or null for a blank
 * frame. Read from its grey levels: the ground is one flat grey, everything drawn differs from it.
 */
export function inkRows(gray, width, ground, tolerance = 6) {
  let first = -1;
  let last = -1;
  const rows = gray.length / width;
  for (let y = 0; y < rows; y++) {
    const row = gray.subarray(y * width, (y + 1) * width);
    if (row.some((v) => Math.abs(v - ground) > tolerance)) {
      if (first < 0) first = y;
      last = y;
    }
  }
  return first < 0 ? null : [first, last];
}

function grayOf(file) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 });
}

/**
 * Frames every picture the same way: all frames brought to one size, then cut to what any of
 * them draws, with the same margin (PAD, at the frames' density) above and below; the width is
 * the page's. A figure's own empty room (a reserve kept for a later step) does not widen it.
 */
function frameAll(frames) {
  const sizes = frames.map((f) => pngSize(f.file));
  const width = sizes[0].width;
  const height = Math.max(...sizes.map((s) => s.height));
  const scale = width / WIDTH;
  const groundGray = grayOf(frames[0].file)[0];
  let top = Infinity;
  let bottom = -1;
  frames.forEach((f, k) => {
    const rows = inkRows(grayOf(f.file), sizes[k].width, groundGray);
    if (!rows) return;
    top = Math.min(top, rows[0]);
    bottom = Math.max(bottom, rows[1]);
  });
  if (bottom < 0) throw new Error('every frame is blank');
  const margin = Math.round(PAD * scale);
  const y = Math.max(0, top - margin);
  const h = Math.min(height + margin, bottom + 1 + margin) - y;
  frames.forEach((f) => {
    const out = f.file.replace(/\.png$/, '-framed.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f.file, '-vf', `pad=iw:${height + margin}:0:0:color=${GROUND},crop=iw:${h}:0:${y}`, out]);
    f.file = out;
  });
}

function encodeGif(frames, dir, target) {
  const seq = join(dir, 'seq');
  rmSync(seq, { recursive: true, force: true });
  mkdirSync(seq);
  let n = 0;
  for (const f of frames) for (let k = 0; k < ticks(f.ms); k++) linkSync(f.file, join(seq, `t${String(n++).padStart(5, '0')}.png`));
  const files = Array.from({ length: n }, (_, k) => join(seq, `t${String(k).padStart(5, '0')}.png`));
  execFileSync('gifski', ['--quiet', '--fps', String(1000 / TICK_MS), '--width', String(WIDTH), '--quality', '90', '-o', target, ...files]);
}

function encodeWebp(frame, target) {
  execFileSync('cwebp', ['-quiet', '-q', '90', '-m', '6', frame.file, '-o', target]);
}

async function main() {
  const { out, only, into } = parseArgs(process.argv.slice(2));
  const list = FIGURES_OF_ARTICLE.filter((f) => !only || only.includes(f.name));
  if (into) for (const f of list) if (!existsSync(join(into, f.name))) throw new Error(`${join(into, f.name)} does not exist: --into only replaces files`);
  mkdirSync(out, { recursive: true });
  const { chromium } = await import(pathToFileURL(join(APP, 'node_modules/playwright-core/index.mjs')).href);
  const { server, base } = await startServer();
  const browser = await chromium.launch({ channel: 'chrome' });
  const report = [];
  try {
    for (const fig of list) {
      const dir = join(out, fig.name.replace(/\.\w+$/, ''));
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const context = await browser.newContext({ viewport: { width: WIDTH + 40, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'no-preference' });
      const page = await context.newPage();
      page.on('pageerror', (e) => console.error(`${fig.name}: ${e.message}`));
      const frames = await capture(page, base, fig, dir);
      await context.close();
      const target = join(out, fig.name);
      frameAll(frames);
      if (fig.name.endsWith('.gif')) encodeGif(frames, dir, target);
      else encodeWebp(frames.at(-1), target);
      const ms = frames.reduce((s, f) => s + ticks(f.ms) * TICK_MS, 0);
      const line = { name: fig.name, frames: frames.length, seconds: fig.name.endsWith('.gif') ? ms / 1000 : 0, bytes: statSync(target).size };
      report.push(line);
      console.log(`${line.name}\t${line.frames} frames\t${line.seconds} s\t${(line.bytes / 1024).toFixed(0)} KiB`);
      if (into) {
        const dest = join(into, fig.name);
        const before = driveId(dest);
        // Content replaced in place (same inode, extended attributes kept): never a new file.
        overwrite(dest, readFileSync(target));
        const after = driveId(dest);
        if (before !== after) throw new Error(`${dest}: Drive ID changed from ${before} to ${after}; stopped`);
        console.log(`  written over ${dest} (Drive ID ${after ?? 'none'} unchanged)`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
