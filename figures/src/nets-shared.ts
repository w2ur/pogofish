// The two nets, each fetched once per page however many figures read it, and
// the AlphaZero net's bytes shared with the board's search (SearchClient sends
// them to its worker, so the worker never fetches the file a second time). A
// failed fetch is not kept: the next reader to ask tries again. A fetch that
// hangs is a failed one after NET_TIMEOUT_MS (it is aborted and dropped), so no
// figure and no search waits on it for good. The parser is imported on demand,
// so it stays out of the eager bundle.
import { NET_FILE, TD_FILE, assetUrl } from './assets';
import type { AzNet, TdNet } from './nets';

/** How long a net may take to arrive, body included, before its fetch is aborted (SearchClient's default timeout). */
export const NET_TIMEOUT_MS = 30_000;

/** The file's bytes, or a rejection once `NET_TIMEOUT_MS` has passed, the fetch aborted. */
function fetchBytes(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`pogo-figures: ${url} did not load in ${NET_TIMEOUT_MS} ms`));
    }, NET_TIMEOUT_MS);
    (async () => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`pogo-figures: could not fetch ${url} (${response.status})`);
      return response.arrayBuffer();
    })().then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * A shared load: one promise per resource, dropped when it fails, or by `drop()`
 * while it is still in flight, so that the next reader loads again. A load that
 * has arrived is never dropped: nothing is downloaded twice.
 */
interface Once<T> {
  (): Promise<T>;
  drop(): void;
}

function once<T>(load: () => Promise<T>): Once<T> {
  let pending: Promise<T> | undefined;
  let arrived = false;
  const get = (() => {
    if (!pending) {
      const p = load();
      pending = p;
      arrived = false;
      p.then(
        () => {
          if (pending === p) arrived = true;
        },
        // Only this load's failure drops it: a load started after a drop is kept.
        () => {
          if (pending === p) pending = undefined;
        },
      );
    }
    return pending;
  }) as Once<T>;
  get.drop = () => {
    if (!arrived) pending = undefined;
  };
  return get;
}

/**
 * The bytes of the AlphaZero net (`NET_FILE`). Never transfer them to a worker:
 * a transferred buffer is detached here, for every reader that shares it.
 */
export const sharedAzBytes = once(() => fetchBytes(assetUrl(NET_FILE)));

/** Forgets a load of the net's bytes still in flight: SearchClient calls it when its own timeout passes. */
export function dropAzBytes(): void {
  sharedAzBytes.drop();
}

/** The AlphaZero net the board plays, parsed once from `sharedAzBytes`. */
export const sharedAz = once(async (): Promise<AzNet> => {
  const [bytes, { parseAz }] = await Promise.all([sharedAzBytes(), import('./nets')]);
  return parseAz(bytes);
});

/** The TD(λ) value net (`TD_FILE`). */
export const sharedTd = once(async (): Promise<TdNet> => {
  const [bytes, { parseTd }] = await Promise.all([fetchBytes(assetUrl(TD_FILE)), import('./nets')]);
  return parseTd(bytes);
});
