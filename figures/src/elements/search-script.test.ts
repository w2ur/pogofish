// The frames <pogo-search> plays, and every sentence it says, held to the one
// search run on puzzle 5 (mcts.ts, with its traces): each fact a sentence
// states is checked here against the snapshots and the traces it comes from.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { LC1_2, legal, moveName, play, terminal } from '../engine';
import { search, type SearchSnapshot, type SimulationTrace } from '../mcts';
import { parseAz, policyIndex } from '../nets';
import { C_PUCT } from '../search-handler';
import { frameCounter, frameHold, frameWords, deepSim, leader, mostVisited, rootRow, searchScript, SLOW, WALK_MS, type Frame, type SimFrame } from './search-script';
import { PUZZLE5, SEARCH_SIMS, STOPS, recordFull, rowOrder } from './search-steps';

const b = readFileSync(resolve(process.cwd(), 'public/nets/az-lc1-s1.pfw'));
const az = parseAz(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const N = ' ';

let before: SearchSnapshot;
let snaps: SearchSnapshot[];
let traces: SimulationTrace[];
let frames: Frame[];

beforeAll(async () => {
  const { priors } = az.evaluate(PUZZLE5);
  before = { sim: 0, root: legal(PUZZLE5).map((move) => ({ move, prior: priors.get(policyIndex(move)) ?? 0, visits: 0, meanValue: 0 })) };
  ({ snaps, traces } = await recordFull(
    (o) => search(PUZZLE5, az, { sims: SEARCH_SIMS, cPuct: C_PUCT, rules: LC1_2, onSnapshot: o.onSnapshot, onTrace: o.onTrace, signal: o.signal }),
    new AbortController().signal,
  ));
  frames = searchScript(before, snaps, traces);
});

const words = (f: Frame, lang: 'fr' | 'en' = 'fr') => frameWords(lang, f, 'Red');

describe('searchScript', () => {
  it('records every simulation, its snapshot and its trace', () => {
    expect(snaps).toHaveLength(100);
    expect(traces.map((t) => t.sim)).toEqual([...Array(100).keys()].map((k) => k + 1));
  });

  it('slows down the first three simulations, then the first that ends a game, in its place, then the stops, then plays', () => {
    expect(deepSim(traces)).toBe(36);
    expect(traces[35]!.leaf).toBe('end');
    expect(traces.slice(SLOW.length, 35).every((t) => t.leaf !== 'end')).toBe(true);
    expect(frames.map((f) => `${f.kind}${f.sim}`)).toEqual([
      'before0',
      'path1', 'leaf1', 'back1',
      'path2', 'leaf2', 'back2',
      'path3', 'leaf3', 'back3',
      'stop5', 'stop10', 'stop20',
      'path36', 'leaf36', 'back36',
      'stop50', 'end100',
    ]);
    expect(STOPS.slice(0, 3)).toEqual([...SLOW]);
  });

  it('a slowed simulation shows the rows before it while it runs, and after it once its note is counted', () => {
    for (const f of frames) {
      if (f.kind === 'path' || f.kind === 'leaf') expect(f.snap).toBe(f.sim === 1 ? before : snaps[f.sim - 2]);
      else if (f.kind !== 'before') expect(f.snap).toBe(snaps[f.sim - 1]);
    }
  });

  it('lasts between 35 and 50 seconds, no frame of a slowed simulation held under 2 seconds', () => {
    const total = frames.reduce((a, _, i) => a + frameHold(frames, i), 0);
    expect(total).toBeGreaterThanOrEqual(35_000);
    expect(total).toBeLessThanOrEqual(50_000);
    frames.forEach((f, i) => {
      if (f.kind === 'end') return;
      const own = f.kind === 'leaf' ? frameHold(frames, i) - WALK_MS * f.trace.moves.length : frameHold(frames, i);
      expect(own, `${f.kind}${f.sim}`).toBeGreaterThanOrEqual(2000);
    });
  });

  it('the slowed deep simulation follows a legal path to a game the player to move wins', () => {
    const tr = traces[35]!;
    let s = PUZZLE5;
    for (const m of tr.moves) s = play(s, m);
    expect(terminal(s, LC1_2)).toBe(true);
    expect(tr.value).toBe(1);
    expect(tr.moves.map(moveName)).toEqual(['b2-3-b1', 'c2-1-b2', 'b3-1-a3', 'b2-1-b1', 'a3-3-b1']);
  });
});

describe('frameWords, each fact from the search', () => {
  const find = (key: string) => frames.find((f) => `${f.kind}${f.sim}` === key)!;

  it('before: the net’s preferred move is the row of highest prior', () => {
    const top = before.root[rowOrder(before)[0]!]!;
    expect(moveName(top.move)).toBe('b2-2-a3');
    expect(words(find('before0'))).toBe('Avant la recherche : les préférences du réseau seules. Le réseau seul préfère b2-2-a3.'.replaceAll(' :', `${N}:`));
  });

  it('the first path follows the net’s preferred move; the next ones say only where they go', () => {
    expect(moveName(traces[0]!.moves[0]!)).toBe(moveName(before.root[rowOrder(before)[0]!]!.move));
    expect(words(find('path1'))).toBe(`Simulation 1${N}: la première piste suit le coup que le réseau préfère, b2-2-a3.`);
    expect(words(find('path2'))).toBe(`Simulation 2${N}: la piste suit b2-1-b1.`);
    expect(words(find('path36'))).toBe(`Simulation 36${N}: la piste suit b2-3-b1, c2-1-b2, b3-1-a3, b2-1-b1, a3-3-b1, par des positions déjà simulées.`);
  });

  it('a leaf says where the simulation stopped and the note it brings back, for Red', () => {
    expect(traces[0]!.leaf).toBe('new');
    expect(words(find('leaf1'))).toBe(`Elle s’arrête sur une position encore jamais simulée. Le réseau la note −0,86 pour Rouge.`);
    expect(traces[0]!.value).toBeCloseTo(-0.864, 3);
    expect(words(find('leaf36'))).toBe(`Elle s’arrête sur une partie finie${N}: Rouge gagne. Note pour Rouge${N}: +1,00.`);
  });

  it('the way back names the root move whose row took the note, with its visits and mean from the snapshot', () => {
    const f = find('back1') as SimFrame;
    const row = f.snap.root[rootRow(f.snap, f.trace)]!;
    expect(row.visits).toBe(1);
    expect(row.meanValue).toBeCloseTo(traces[0]!.value, 5);
    expect(words(f)).toBe(`La note remonte au premier coup de la piste, b2-2-a3${N}: 1 passage, note moyenne −0,86.`);
    const deep = find('back36') as SimFrame;
    const r36 = deep.snap.root[rootRow(deep.snap, deep.trace)]!;
    expect(r36.visits).toBe(snaps[35]!.root.find((r) => moveName(r.move) === 'b2-3-b1')!.visits);
    expect(words(deep)).toMatch(new RegExp(`^La note remonte au premier coup de la piste, b2-3-b1${N}: ${r36.visits} passages, note moyenne \\+0,\\d\\d\\.$`));
  });

  it('a stop names the move ahead when one alone leads and the net did not prefer it, else the rule of the paths', () => {
    expect(leader(snaps[4]!)).toBe(-1);
    expect(words(find('stop5'))).toBe('5 simulations. Les pistes vont vers les coups préférés, puis vers ceux dont la note moyenne est la meilleure.');
    const s20 = snaps[19]!;
    expect(moveName(s20.root[leader(s20)]!.move)).toBe('b2-3-b1');
    expect(words(find('stop20'))).toBe(`20 simulations. b2-3-b1 est en tête${N}: 5 passages, note moyenne +0,15.`);
  });

  it('the end names the most visited move and the net’s own first choice, both from the search', () => {
    const last = snaps[99]!;
    expect(moveName(last.root[mostVisited(last)]!.move)).toBe('b2-3-b1');
    expect(words(find('end100'))).toBe(`Après 100 simulations, il joue le coup le plus visité${N}: b2-3-b1. Le réseau seul préférait b2-2-a3.`);
    expect(words(find('end100'), 'en')).toBe('After 100 simulations, it plays the most visited move: b2-3-b1. The net alone preferred b2-2-a3.');
  });

  it('counts the simulations « 5 simulations sur 100 »', () => {
    expect(frameCounter('fr', find('stop5'), 100)).toBe('5 simulations sur 100');
    expect(frameCounter('fr', find('path1'), 100)).toBe('1 simulation sur 100');
    expect(frameCounter('en', find('before0'), 100)).toBe('0 simulations of 100');
  });
});
