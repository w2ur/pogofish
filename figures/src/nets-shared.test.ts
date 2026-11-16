import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const file = (name: string): ArrayBuffer => {
  const b = readFileSync(resolve(process.cwd(), 'public/nets', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const AZ = file('az-lc1-s1.pfw');
const TD = file('td-s1.pfv');

let fetchMock: ReturnType<typeof vi.fn>;
const fresh = async () => {
  vi.resetModules();
  return import('./nets-shared');
};
const requested = (): string[] => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => new Response(String(url).endsWith('.pfw') ? AZ.slice(0) : TD.slice(0)));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A fetch that never answers, though it hears its abort. */
const hung = (signals: AbortSignal[]) => (_url: string, init?: RequestInit) => {
  if (init?.signal) signals.push(init.signal);
  return new Promise<Response>(() => {});
};

describe('the shared nets', () => {
  it('the network is fetched once for two figures, and once for the board’s bytes too', async () => {
    const m = await fresh();
    const [a, b, bytes] = await Promise.all([m.sharedAz(), m.sharedAz(), m.sharedAzBytes()]);
    expect(a).toBe(b);
    expect(bytes.byteLength).toBe(AZ.byteLength);
    await m.sharedAz();
    expect(requested().filter((u) => u.endsWith('nets/az-lc1-s1.pfw'))).toHaveLength(1);
    expect(requested()).toHaveLength(1);
  });

  it('the TD net is its own file, fetched once', async () => {
    const m = await fresh();
    const [a, b] = await Promise.all([m.sharedTd(), m.sharedTd()]);
    expect(a).toBe(b);
    expect(a.header.layers.map((l) => l.outputs)).toEqual([128, 64, 1]);
    expect(requested()).toEqual([expect.stringMatching(/nets\/td-s1\.pfv$/)]);
  });

  it('nothing is fetched until a reader asks', async () => {
    await fresh();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed fetch is not kept: the next reader fetches again', async () => {
    const m = await fresh();
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 503 }));
    await expect(m.sharedAz()).rejects.toThrow(/503/);
    await expect(m.sharedAz()).resolves.toBeDefined();
    expect(requested()).toHaveLength(2);
  });

  it('a fetch that never settles fails at the timeout, aborted, and the next reader fetches again', async () => {
    vi.useFakeTimers();
    const m = await fresh();
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementationOnce(hung(signals));
    const first = m.sharedAz();
    const settled = vi.fn();
    first.catch(settled);
    await vi.advanceTimersByTimeAsync(m.NET_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled.mock.calls[0]![0]).toMatchObject({ message: expect.stringMatching(/did not load in 30000 ms/) });
    expect(signals[0]!.aborted).toBe(true);
    await expect(m.sharedAz()).resolves.toBeDefined();
    expect(requested()).toHaveLength(2);
  });

  it('the board’s search: a hung net rejects at its timeout, and « Réessayer » starts a new fetch', async () => {
    vi.resetModules();
    const m = await import('./nets-shared');
    const { SearchClient } = await import('./search-client');
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementationOnce(hung(signals));
    const sent: unknown[] = [];
    const worker = { postMessage: (x: unknown) => void sent.push(x), terminate: () => {}, addEventListener: () => {} };
    const client = new SearchClient({ createWorker: () => worker, timeoutMs: 20 });
    const state = { cells: [], to_move: 'White', move_count: 0, history: [] } as never;
    await expect(client.bestMove(state, 5, null)).rejects.toThrow(/^pogo-figures: the net did not load in 20 ms/);
    expect(sent).toHaveLength(0);
    // The retry fetches afresh, gets the bytes and posts them to the worker.
    void client.bestMove(state, 5, null).catch(() => {});
    for (let i = 0; i < 10 && sent.length === 0; i++) await new Promise((r) => setTimeout(r, 0));
    expect(requested()).toHaveLength(2);
    expect((sent[0] as { netBytes?: ArrayBuffer }).netBytes?.byteLength).toBe(AZ.byteLength);
    client.dispose();
    void m;
  });

  it('a net that has arrived is never dropped: no second download', async () => {
    const m = await fresh();
    await m.sharedAzBytes();
    m.dropAzBytes();
    await m.sharedAzBytes();
    expect(requested()).toHaveLength(1);
  });
});
