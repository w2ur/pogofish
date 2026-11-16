import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LC1_2, initial, legal } from './engine';
import { parseAz } from './nets';
import { SearchClient, type WorkerLike } from './search-client';
import { createSearchHandler, createWorkerEndpoint, type SearchReply, type WorkerMessage } from './search-handler';

const bytes = readFileSync(resolve(process.cwd(), 'public/nets/az-lc1-s1.pfw'));
const net = parseAz(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
const handler = createSearchHandler({ ready: async () => {}, loadNet: async () => net });
const AZ_BYTES = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
/** The page's one fetch of the net, stood in for. */
const netBytes = () => Promise.resolve(AZ_BYTES);
const flush = () => new Promise((r) => setTimeout(r, 0));
const mainThread = vi.fn(handler);
const legalTriples = legal(initial()).map((m) => [m.from_cell, m.num_pieces, m.to_cell]);

/** A worker run in-process through the real endpoint; `broken` fires `error` as a failed load does. */
class FakeWorker extends EventTarget implements WorkerLike {
  readonly sent: WorkerMessage[] = [];
  terminated = false;
  private readonly endpoint = createWorkerEndpoint(handler, (reply) => this.reply(reply));
  constructor(private readonly mode: 'ok' | 'broken' | 'silent' | 'error-reply' = 'ok') {
    super();
  }
  postMessage(message: WorkerMessage): void {
    this.sent.push(message);
    if (this.mode === 'broken') setTimeout(() => this.dispatchEvent(new Event('error')), 0);
    else if (this.mode === 'error-reply') setTimeout(() => this.reply({ id: message.id, error: 'pogo-figures: wasm 404' }), 0);
    else if (this.mode === 'ok') void this.endpoint(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: SearchReply): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

describe('the search client', () => {
  it('runs the search in the worker when it can', async () => {
    mainThread.mockClear();
    const client = new SearchClient({ netBytes, createWorker: () => new FakeWorker(), fallback: mainThread });
    const result = await client.bestMove(initial(), 25, LC1_2);
    expect(result.via).toBe('worker');
    expect(legalTriples).toContainEqual(result.move);
    expect(mainThread).not.toHaveBeenCalled();
  });

  it.each([
    ['cannot be created', () => {
      throw new Error('blocked by CSP');
    }],
    ['errors on load', () => new FakeWorker('broken')],
  ])('falls back to the main thread when the worker %s', async (_, createWorker) => {
    mainThread.mockClear();
    const client = new SearchClient({ netBytes, createWorker: createWorker as () => WorkerLike, fallback: mainThread });
    const result = await client.bestMove(initial(), 25, LC1_2);
    expect(result.via).toBe('main');
    expect(legalTriples).toContainEqual(result.move);
    expect(client.mode).toBe('main');
    // The next search does not try the worker again.
    expect((await client.bestMove(initial(), 5, LC1_2)).via).toBe('main');
    expect(mainThread).toHaveBeenCalledTimes(2);
  });

  it('an error reply is a failure to retry, in a fresh worker, never a fall back for good', async () => {
    mainThread.mockClear();
    const workers: FakeWorker[] = [];
    const modes: ('error-reply' | 'ok')[] = ['error-reply', 'ok'];
    const client = new SearchClient({ netBytes,
      createWorker: () => {
        const w = new FakeWorker(modes[workers.length]);
        workers.push(w);
        return w;
      },
      fallback: mainThread,
    });
    await expect(client.bestMove(initial(), 25, LC1_2)).rejects.toThrow(/wasm 404/);
    expect(workers[0]!.terminated).toBe(true);
    expect(mainThread).not.toHaveBeenCalled();
    // « Réessayer »: the next request starts a new worker, which answers.
    const result = await client.bestMove(initial(), 25, LC1_2);
    expect(result.via).toBe('worker');
    expect(workers).toHaveLength(2);
    expect(mainThread).not.toHaveBeenCalled();
  });

  it('a main-thread search that never answers fails after the timeout', async () => {
    let seen: AbortSignal | undefined;
    const client = new SearchClient({ netBytes,
      createWorker: () => {
        throw new Error('no worker');
      },
      fallback: (_req, signal) => {
        seen = signal;
        return new Promise(() => {});
      },
      timeoutMs: 20,
    });
    await expect(client.bestMove(initial(), 5, LC1_2)).rejects.toThrow(/^pogo-figures: .*did not answer/);
    expect(seen!.aborted).toBe(true);
  });

  it('an aborted main-thread search rejects with an AbortError at once, without waiting out the timeout', async () => {
    vi.useFakeTimers();
    try {
      const client = new SearchClient({ netBytes,
        createWorker: () => {
          throw new Error('no worker');
        },
        // A fallback deaf to its signal: only the client can end the wait.
        fallback: () => new Promise(() => {}),
        timeoutMs: 30_000,
      });
      const controller = new AbortController();
      const run = client.bestMove(initial(), 5, LC1_2, controller.signal);
      const settled = vi.fn();
      run.catch(settled);
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toHaveBeenCalledTimes(1);
      expect(settled.mock.calls[0]![0]).toMatchObject({ name: 'AbortError' });
      // Nothing is left waiting on the 30 s timer.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back when the worker never answers', async () => {
    const client = new SearchClient({ netBytes, createWorker: () => new FakeWorker('silent'), fallback: mainThread, timeoutMs: 20 });
    expect((await client.bestMove(initial(), 5, LC1_2)).via).toBe('main');
  });

  it('a superseded request rejects, and its late reply is ignored', async () => {
    const worker = new FakeWorker('silent');
    const client = new SearchClient({ netBytes, createWorker: () => worker, fallback: mainThread });
    const first = client.bestMove(initial(), 25, LC1_2);
    // The first request is posted once the net's bytes are in hand.
    await flush();
    const second = client.bestMove(initial(), 25, LC1_2);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const [, , req2] = worker.sent as [WorkerMessage, WorkerMessage, WorkerMessage & { id: number }];
    expect(worker.sent[1]).toEqual({ id: 1, cancel: true });
    // A reply to the first request, arriving late, must not settle the second.
    worker.reply({ id: 1, move: [0, 1, 1], snapshot: { sim: 1, root: [] } });
    worker.reply({ id: req2.id, move: [2, 1, 1], snapshot: { sim: 1, root: [] } });
    expect((await second).move).toEqual([2, 1, 1]);
  });

  it('an aborted signal cancels the worker request', async () => {
    const worker = new FakeWorker('silent');
    const client = new SearchClient({ netBytes, createWorker: () => worker, fallback: mainThread });
    const controller = new AbortController();
    const run = client.bestMove(initial(), 25, LC1_2, controller.signal);
    await flush();
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.sent.at(-1)).toEqual({ id: 1, cancel: true });
  });

  it('an aborted signal stops the main-thread search too', async () => {
    const client = new SearchClient({ netBytes, createWorker: () => new FakeWorker('broken'), fallback: mainThread });
    const controller = new AbortController();
    const run = client.bestMove(initial(), 400, LC1_2, controller.signal);
    setTimeout(() => controller.abort(), 5);
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('a main-thread failure rejects, so the board can offer a retry', async () => {
    const client = new SearchClient({ netBytes,
      createWorker: () => {
        throw new Error('no worker');
      },
      fallback: async (req) => ({ id: req.id, error: 'pogo-figures: could not fetch net (404)' }),
    });
    await expect(client.bestMove(initial(), 5, LC1_2)).rejects.toThrow(/404/);
  });

  it('sends the net’s bytes with a worker’s first request only, and again to a fresh worker', async () => {
    const workers: FakeWorker[] = [];
    const modes: ('error-reply' | 'ok')[] = ['error-reply', 'ok'];
    const loads = vi.fn(netBytes);
    const client = new SearchClient({
      netBytes: loads,
      createWorker: () => {
        const w = new FakeWorker(modes[workers.length]);
        workers.push(w);
        return w;
      },
      fallback: mainThread,
    });
    await expect(client.bestMove(initial(), 5, LC1_2)).rejects.toThrow(/wasm 404/);
    await client.bestMove(initial(), 5, LC1_2);
    await client.bestMove(initial(), 5, LC1_2);
    const bytesOf = (m: WorkerMessage) => ('netBytes' in m ? m.netBytes?.byteLength : undefined);
    expect(workers[0]!.sent.map(bytesOf)).toEqual([AZ_BYTES.byteLength]);
    expect(workers[1]!.sent.map(bytesOf)).toEqual([AZ_BYTES.byteLength, undefined]);
    // Copied to the worker, never transferred: the page's buffer is still whole.
    expect(AZ_BYTES.byteLength).toBeGreaterThan(0);
  });

  it('a request superseded while the net loads posts nothing, and the next one carries the bytes', async () => {
    const worker = new FakeWorker('ok');
    const client = new SearchClient({ netBytes, createWorker: () => worker, fallback: mainThread });
    const first = client.bestMove(initial(), 5, LC1_2);
    const second = client.bestMove(initial(), 5, LC1_2);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect((await second).via).toBe('worker');
    expect(worker.sent).toHaveLength(1);
    expect('netBytes' in worker.sent[0]! && worker.sent[0].netBytes?.byteLength).toBe(AZ_BYTES.byteLength);
  });

  it('a net that never loads fails after the timeout, and keeps the worker', async () => {
    const worker = new FakeWorker('ok');
    const client = new SearchClient({ netBytes: () => new Promise(() => {}), createWorker: () => worker, fallback: mainThread, timeoutMs: 20 });
    await expect(client.bestMove(initial(), 5, LC1_2)).rejects.toThrow(/^pogo-figures: the net did not load/);
    expect(worker.sent).toHaveLength(0);
    expect(client.mode).toBe('worker');
  });
});
