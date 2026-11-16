// The two nets, each fetched once per page however many figures read it, and
// the AlphaZero net's bytes shared with the board's search (SearchClient sends
// them to its worker, so the worker never fetches the file a second time). A
// failed fetch is not kept: the next reader to ask tries again. The parser is
// imported on demand, so it stays out of the eager bundle.
import { NET_FILE, TD_FILE, assetUrl } from './assets';
import type { AzNet, TdNet } from './nets';

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`pogo-figures: could not fetch ${url} (${response.status})`);
  return response.arrayBuffer();
}

/** One promise per resource, dropped when it fails so that a retry fetches again. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

/**
 * The bytes of the AlphaZero net (`NET_FILE`). Never transfer them to a worker:
 * a transferred buffer is detached here, for every reader that shares it.
 */
export const sharedAzBytes = once(() => fetchBytes(assetUrl(NET_FILE)));

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
