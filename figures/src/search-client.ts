// The main thread's side of the search: one module worker, started on the
// first request. When it cannot be created, crashes (error, messageerror) or
// hangs, the same search runs on the main thread from then on (it yields
// between batches, so the page stays responsive). An error the worker reports
// is a failure the reader can retry, in a fresh worker. A new request
// supersedes the one in flight. The net comes from the page's one fetch
// (nets-shared.ts): its bytes go with a worker's first request, and the
// main-thread search reads the page's parsed net, so the file is never
// downloaded twice, whichever figure or board asked for it first.
import { assetUrl, NET_FILE, WASM_FILE, workerUrl } from './assets';
import { NET_TIMEOUT_MS, dropAzBytes, sharedAz, sharedAzBytes } from './nets-shared';
import type { Rules, State, Triple } from './engine';
import type { SearchSnapshot } from './mcts';
import type { SearchReply, SearchRequest, WorkerMessage } from './search-handler';

export type Via = 'worker' | 'main';

export interface SearchResult {
  move: Triple;
  snapshot: SearchSnapshot;
  via: Via;
}

/** The part of `Worker` the client uses, so a test can stand one in. */
export interface WorkerLike {
  postMessage(message: WorkerMessage): void;
  terminate(): void;
  /** 'message' (a `MessageEvent<SearchReply>`), 'error' and 'messageerror'. */
  addEventListener(type: 'message' | 'error' | 'messageerror', fn: (e: Event) => void): void;
}

export type Fallback = (req: SearchRequest, signal: AbortSignal) => Promise<SearchReply>;

export interface ClientOptions {
  createWorker?: () => WorkerLike;
  fallback?: Fallback;
  /**
   * A worker that has not answered after this long is dropped for the main thread; a
   * main-thread search that has not answered after this long fails, and so does a net
   * that has not loaded (default `NET_TIMEOUT_MS`).
   */
  timeoutMs?: number;
  /** The net's bytes, sent to each new worker (default: the page's one fetch). */
  netBytes?: () => Promise<ArrayBuffer>;
  /** Forgets a load of `netBytes` that outlived the timeout, so the next request loads again (default: the page's). */
  dropNet?: () => void;
}

const abortError = (): DOMException => new DOMException('pogo-figures: search superseded or aborted', 'AbortError');

const defaultWorker = (): WorkerLike => new Worker(workerUrl(), { type: 'module' }) as unknown as WorkerLike;

let mainHandler: Promise<Fallback> | undefined;
/** Loaded on demand: the search and the net parser stay out of the eager bundle. The net is the page's. */
const mainThread: Fallback = async (req, signal) => {
  mainHandler ??= Promise.all([import('./search-handler'), import('./engine')]).then(([m, e]) =>
    m.createSearchHandler({ ready: e.ready, loadNet: () => sharedAz() }),
  );
  return (await mainHandler)(req, signal);
};

interface Pending {
  id: number;
  resolve: (reply: SearchReply) => void;
  /** The worker failed while this request was its own. */
  fail: () => void;
}

export class SearchClient {
  /** `undefined`: not tried yet; `null`: unavailable, every search runs on the main thread. */
  private worker: WorkerLike | null | undefined;
  private nextId = 1;
  private current: AbortController | undefined;
  private pending: Pending | undefined;
  private readonly createWorker: () => WorkerLike;
  private readonly fallback: Fallback;
  private readonly timeoutMs: number;
  private readonly netBytes: () => Promise<ArrayBuffer>;
  private readonly dropNet: () => void;
  /** The worker that has been sent the net's bytes. */
  private hasNet: WorkerLike | undefined;

  constructor(o: ClientOptions = {}) {
    this.createWorker = o.createWorker ?? defaultWorker;
    this.fallback = o.fallback ?? mainThread;
    this.timeoutMs = o.timeoutMs ?? NET_TIMEOUT_MS;
    this.netBytes = o.netBytes ?? sharedAzBytes;
    this.dropNet = o.dropNet ?? (o.netBytes ? () => {} : dropAzBytes);
  }

  /** Where the next search will run, once known. */
  get mode(): Via | undefined {
    if (this.worker === undefined) return undefined;
    return this.worker === null ? 'main' : 'worker';
  }

  /** The move AlphaZero plays from `state`. Rejects with an `AbortError` when superseded or aborted. */
  async bestMove(state: State, sims: number, rules: Rules, signal?: AbortSignal): Promise<SearchResult> {
    this.current?.abort();
    const controller = new AbortController();
    this.current = controller;
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) throw abortError();
      const req: SearchRequest = {
        id: this.nextId++,
        state,
        sims,
        rules,
        assets: { wasm: assetUrl(WASM_FILE), net: assetUrl(NET_FILE) },
      };
      const worker = this.ensureWorker();
      if (worker) {
        if (this.hasNet !== worker) {
          // Copied, never transferred: the page's other readers share these bytes.
          req.netBytes = await this.loadNet(controller.signal);
          // Superseded while the bytes loaded: nothing was posted, and nothing will be.
          if (controller.signal.aborted) throw abortError();
          this.hasNet = worker;
        }
        const reply = await this.viaWorker(worker, req, controller.signal);
        if (reply && 'error' in reply) {
          // A failed fetch inside the worker may be transient, and the worker's
          // module state caches it: the retry starts a fresh worker.
          worker.terminate();
          if (this.worker === worker) this.worker = undefined;
          throw new Error(reply.error);
        }
        if (reply) return { ...reply, via: 'worker' };
        // The worker could not start, crashed or hung: from now on the main thread searches.
        this.dropWorker();
      }
      const reply = await this.onMainThread(req, controller.signal);
      if ('error' in reply) throw new Error(reply.error);
      return { move: reply.move, snapshot: reply.snapshot, via: 'main' };
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (this.current === controller) this.current = undefined;
    }
  }

  /** The net's bytes, bounded by the timeout: a hung fetch must not think forever. Rejects with an `AbortError` on abort. */
  private loadNet(signal: AbortSignal): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const done = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      };
      const onAbort = (): void => {
        done();
        reject(abortError());
      };
      const timer = setTimeout(() => {
        done();
        // A hung load is not waited on again: the reader's retry starts a fresh one.
        this.dropNet();
        reject(new Error(`pogo-figures: the net did not load in ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }
      this.netBytes().then(
        (bytes) => {
          done();
          resolve(bytes);
        },
        (error: unknown) => {
          done();
          reject(error);
        },
      );
    });
  }

  /** The fallback, bounded by the same timeout as the worker: a hung fetch must not think forever. */
  private onMainThread(req: SearchRequest, signal: AbortSignal): Promise<SearchReply> {
    const controller = new AbortController();
    return new Promise<SearchReply>((resolve, reject) => {
      // An abort settles at once, with the AbortError, whatever the fallback does.
      const onAbort = (): void => {
        clearTimeout(timer);
        controller.abort();
        reject(abortError());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        controller.abort();
        // The fallback may have hung on the net itself: a retry loads it afresh.
        this.dropNet();
        reject(new Error(`pogo-figures: the search did not answer in ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      signal.addEventListener('abort', onAbort, { once: true });
      // Aborted while the worker was being given up on: 'abort' has already fired.
      if (signal.aborted) {
        onAbort();
        return;
      }
      this.fallback(req, controller.signal)
        .then(
          (reply) => (signal.aborted ? reject(abortError()) : resolve(reply)),
          (error: unknown) => reject(signal.aborted ? abortError() : error),
        )
        .finally(() => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        });
    });
  }

  /** Stops the worker; the next request starts a new one. */
  dispose(): void {
    this.current?.abort();
    this.worker?.terminate();
    this.worker = undefined;
  }

  private ensureWorker(): WorkerLike | null {
    if (this.worker !== undefined) return this.worker;
    try {
      const worker = this.createWorker();
      worker.addEventListener('message', (e) => {
        const reply = (e as MessageEvent<SearchReply>).data;
        if (this.pending && reply.id === this.pending.id) this.pending.resolve(reply);
      });
      // A failure between two requests drops the worker, so the next one does not wait for the timeout.
      const failed = (): void => (this.pending ? this.pending.fail() : this.dropWorker());
      worker.addEventListener('error', failed);
      worker.addEventListener('messageerror', failed);
      this.worker = worker;
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  /** Resolves with the reply, or `null` when the worker failed or timed out. */
  private viaWorker(worker: WorkerLike, req: SearchRequest, signal: AbortSignal): Promise<SearchReply | null> {
    return new Promise((resolve, reject) => {
      const done = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        if (this.pending?.id === req.id) this.pending = undefined;
      };
      const onAbort = (): void => {
        done();
        worker.postMessage({ id: req.id, cancel: true });
        reject(abortError());
      };
      const timer = setTimeout(() => {
        done();
        resolve(null);
      }, this.timeoutMs);
      this.pending = {
        id: req.id,
        resolve: (reply) => {
          done();
          resolve(reply);
        },
        fail: () => {
          done();
          resolve(null);
        },
      };
      signal.addEventListener('abort', onAbort, { once: true });
      worker.postMessage(req);
    });
  }
}
