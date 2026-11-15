// The main thread's side of the search: one module worker, started on the
// first request. When it cannot be created, crashes (error, messageerror) or
// hangs, the same search runs on the main thread from then on (it yields
// between batches, so the page stays responsive). An error the worker reports
// is a failure the reader can retry, in a fresh worker. A new request
// supersedes the one in flight.
import { assetUrl, NET_FILE, WASM_FILE, workerUrl } from './assets';
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
   * main-thread search that has not answered after this long fails (default 30 s).
   */
  timeoutMs?: number;
}

const abortError = (): DOMException => new DOMException('pogo-figures: search superseded or aborted', 'AbortError');

const defaultWorker = (): WorkerLike => new Worker(workerUrl(), { type: 'module' }) as unknown as WorkerLike;

let mainHandler: Promise<Fallback> | undefined;
/** Loaded on demand: the search and the net parser stay out of the eager bundle. */
const mainThread: Fallback = async (req, signal) => {
  mainHandler ??= import('./search-handler').then((m) => m.createSearchHandler());
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

  constructor(o: ClientOptions = {}) {
    this.createWorker = o.createWorker ?? defaultWorker;
    this.fallback = o.fallback ?? mainThread;
    this.timeoutMs = o.timeoutMs ?? 30_000;
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

  /** The fallback, bounded by the same timeout as the worker: a hung fetch must not think forever. */
  private onMainThread(req: SearchRequest, signal: AbortSignal): Promise<SearchReply> {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    return new Promise<SearchReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`pogo-figures: the search did not answer in ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.fallback(req, controller.signal).then(
        (reply) => (signal.aborted ? reject(abortError()) : resolve(reply)),
        (error: unknown) => reject(signal.aborted ? abortError() : error),
      ).finally(() => clearTimeout(timer));
    }).finally(() => signal.removeEventListener('abort', onAbort));
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
