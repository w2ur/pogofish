import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LC1_2, initial, legal, play, terminal, type State } from './engine';
import { parseAz } from './nets';
import { createSearchHandler, createWorkerEndpoint, type SearchReply, type SearchRequest } from './search-handler';

const bytes = readFileSync(resolve(process.cwd(), 'public/nets/az-lc1-s1.pfw'));
const loadNet = vi.fn(async () => parseAz(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
const handler = createSearchHandler({ ready: async () => {}, loadNet });
const ASSETS = { wasm: 'engine.wasm', net: 'net.pfw' };

/** A deterministic generator (mulberry32), so the positions are the same every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPositions(n: number): State[] {
  const next = rng(7);
  const out: State[] = [];
  while (out.length < n) {
    let s = initial();
    const plies = Math.floor(next() * 14);
    for (let i = 0; i < plies && !terminal(s, LC1_2); i++) {
      const moves = legal(s);
      s = play(s, moves[Math.floor(next() * moves.length)]!);
    }
    if (!terminal(s, LC1_2)) out.push(s);
  }
  return out;
}

const request = (id: number, state: State, sims = 25): SearchRequest => ({ id, state, sims, rules: LC1_2, assets: ASSETS });

describe('the search handler', () => {
  it('the worker answers with a legal move for 20 random positions', async () => {
    const positions = randomPositions(20);
    for (const [i, s] of positions.entries()) {
      const reply = await handler(request(i, s), new AbortController().signal);
      if ('error' in reply) throw new Error(reply.error);
      expect(reply.id).toBe(i);
      const legalTriples = legal(s).map((m) => [m.from_cell, m.num_pieces, m.to_cell]);
      expect(legalTriples).toContainEqual(reply.move);
      expect(reply.snapshot.sim).toBe(25);
    }
  });

  it('loads the net once, and again after a failed load', async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error('pogo-figures: could not fetch net.pfw (404)')).mockImplementation(loadNet);
    const h = createSearchHandler({ ready: async () => {}, loadNet: failing });
    await expect(h(request(1, initial()), new AbortController().signal)).rejects.toThrow(/404/);
    await h(request(2, initial(), 5), new AbortController().signal);
    await h(request(3, initial(), 5), new AbortController().signal);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe('the worker endpoint', () => {
  it('a new request supersedes the one in flight, which posts nothing', async () => {
    const posted: SearchReply[] = [];
    const onMessage = createWorkerEndpoint(handler, (r) => posted.push(r));
    const first = onMessage(request(1, initial(), 400));
    const second = onMessage(request(2, initial(), 10));
    await Promise.all([first, second]);
    expect(posted.map((r) => r.id)).toEqual([2]);
  });

  it('a reply that settles after its request was superseded is not posted', async () => {
    const posted: SearchReply[] = [];
    // A handler that ignores its signal: the endpoint alone must hold the reply back.
    const deaf = async (req: SearchRequest): Promise<SearchReply> => {
      await new Promise((r) => setTimeout(r, 5));
      return { id: req.id, move: [0, 1, 1], snapshot: { sim: 0, root: [] } };
    };
    const onMessage = createWorkerEndpoint(deaf, (r) => posted.push(r));
    await Promise.all([onMessage(request(1, initial())), onMessage(request(2, initial()))]);
    expect(posted.map((r) => r.id)).toEqual([2]);
  });

  it('a cancel aborts the request in flight', async () => {
    const posted: SearchReply[] = [];
    const onMessage = createWorkerEndpoint(handler, (r) => posted.push(r));
    const run = onMessage(request(1, initial(), 400));
    await onMessage({ id: 1, cancel: true });
    await run;
    expect(posted).toEqual([]);
  });

  it('a failure is posted as an error reply with the request id', async () => {
    const posted: SearchReply[] = [];
    const broken = createSearchHandler({ ready: () => Promise.reject(new Error('pogo-figures: no wasm')), loadNet });
    await createWorkerEndpoint(broken, (r) => posted.push(r))(request(9, initial()));
    expect(posted).toEqual([{ id: 9, error: 'pogo-figures: no wasm' }]);
  });

  it('a request carrying the net’s bytes is answered without fetching the net', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no fetch expected'));
    try {
      const h = createSearchHandler();
      const netBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const reply = await h({ ...request(1, initial(), 5), netBytes }, new AbortController().signal);
      if ('error' in reply) throw new Error(reply.error);
      expect(reply.snapshot.sim).toBe(5);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
