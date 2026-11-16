// The search behind the board, as one function both sides of the worker share:
// search.worker.ts runs it off the main thread, and SearchClient runs it on the
// main thread when no worker can be had. The engine and the net load once, on
// the first request, never at page load: from the bytes the page sends with
// it (the page's one fetch, nets-shared.ts), else from the net's URL.
import { ready, type Rules, type State, type Triple } from './engine';
import { bestMove, search, type SearchSnapshot } from './mcts';
import { loadAz, parseAz, type AzNet } from './nets';

/** AlphaZero's exploration constant, as MctsConfig::default; no root noise. */
export const C_PUCT = 1.5;

export interface SearchRequest {
  id: number;
  state: State;
  sims: number;
  rules: Rules;
  /** Absolute URLs of the engine and the net, resolved by the page. */
  assets: { wasm: string; net: string };
  /** The net's file, sent with a worker's first request so that it does not fetch `assets.net` again. */
  netBytes?: ArrayBuffer;
}

/** Asks the worker to drop request `id` (its reply will not come). */
export interface CancelRequest {
  id: number;
  cancel: true;
}

export type WorkerMessage = SearchRequest | CancelRequest;

export type SearchReply =
  | { id: number; move: Triple; snapshot: SearchSnapshot }
  | { id: number; error: string };

export interface HandlerDeps {
  ready: (wasmUrl: string) => Promise<void>;
  /** The net, parsed from `bytes` when the request carries them, else fetched from `url`. */
  loadNet: (url: string, bytes?: ArrayBuffer) => Promise<AzNet>;
}

const loadNet = async (url: string, bytes?: ArrayBuffer): Promise<AzNet> => (bytes ? parseAz(bytes) : loadAz(url));

const asTriple = (m: { from_cell: number; num_pieces: number; to_cell: number }): Triple => [
  m.from_cell,
  m.num_pieces,
  m.to_cell,
];

/** Answers one request; rejects with an `AbortError` when `signal` aborts. */
export function createSearchHandler(deps: HandlerDeps = { ready, loadNet }) {
  let net: Promise<AzNet> | undefined;
  return async (req: SearchRequest, signal: AbortSignal): Promise<SearchReply> => {
    await deps.ready(req.assets.wasm);
    if (!net) {
      const loading = deps.loadNet(req.assets.net, req.netBytes);
      net = loading;
      // A failed fetch must not stay cached: the reader's retry loads again.
      loading.catch(() => {
        if (net === loading) net = undefined;
      });
    }
    const snapshot = await search(req.state, await net, { sims: req.sims, rules: req.rules, cPuct: C_PUCT, signal });
    return { id: req.id, move: asTriple(bestMove(snapshot)), snapshot };
  };
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The worker's message loop, apart from `self` so it can be tested: a new
 * request or a cancel aborts the one in flight, and an aborted request posts
 * nothing.
 */
export function createWorkerEndpoint(
  handle: (req: SearchRequest, signal: AbortSignal) => Promise<SearchReply>,
  post: (reply: SearchReply) => void,
): (msg: WorkerMessage) => Promise<void> {
  let inFlight: AbortController | undefined;
  return async (msg) => {
    inFlight?.abort();
    inFlight = undefined;
    if ('cancel' in msg) return;
    const controller = new AbortController();
    inFlight = controller;
    try {
      const reply = await handle(msg, controller.signal);
      if (!controller.signal.aborted) post(reply);
    } catch (error) {
      if (!controller.signal.aborted) post({ id: msg.id, error: message(error) });
    } finally {
      if (inFlight === controller) inFlight = undefined;
    }
  };
}
