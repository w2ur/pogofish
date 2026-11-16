// The round-5 learning data (stages, references, mosaics), fetched once per
// page however many figures read it. A failed fetch is not kept: the next
// figure to ask tries again. The figures name its own `source` string, never
// a path typed here.
import { assetUrl } from './assets';
import { loadV5, type V5Data } from './data';

export const V5_FILE = 'data/v5.json';

let pending: Promise<V5Data> | undefined;

export function sharedV5(): Promise<V5Data> {
  pending ??= loadV5(assetUrl(V5_FILE)).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
