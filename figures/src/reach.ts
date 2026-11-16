// The breadth-first exploration's counts, fetched when <pogo-reach> first
// approaches. The source the figure names is the data file's own `source`
// field, kept here once so the label and the file cannot drift apart unseen
// (reach-bars.ts refuses a file whose field says otherwise).
import { assetUrl } from './assets';
import { loadReach, type ReachData } from './data';

export const REACH_FILE = 'data/reach.json';
/** The file <pogo-reach> names under its `measured` label: reach.json's `source`. */
export const REACH_SOURCE = 'docs/experiments/v3-solve/reach.json';

export const fetchReach = (): Promise<ReachData> => loadReach(assetUrl(REACH_FILE));
