// What <pogo-net kind="az"> reads off the AlphaZero net for one position: its
// preference for each legal move (the softmax over the legal moves of the
// policy head, as the search uses it) and its value, for the player to move.
import { legal, moveName, type Move, type State } from '../engine';
import type { AzNet } from '../nets';

export interface PolicyRow {
  move: Move;
  name: string;
  /** Share of the preference, 0–1; the legal moves' shares sum to 1. */
  prior: number;
}

export interface AzReadout {
  /** The legal moves, the strongest preference first, ties in engine order. */
  rows: PolicyRow[];
  /** In [−1, 1], for the player to move. */
  value: number;
  /** Outputs of the policy head: one per conceivable move, legal or not. */
  actions: number;
}

/**
 * `policyIndex` is nets.ts's, passed in by a caller that has loaded that module
 * on demand: a static import here would pull the parser into the eager bundle.
 */
export function azReadout(net: AzNet, s: State, policyIndex: (m: Move) => number): AzReadout {
  const out = net.evaluate(s);
  const rows = legal(s).map((move) => {
    const prior = out.priors.get(policyIndex(move));
    if (prior === undefined) throw new Error(`pogo-figures: the net gives no preference for ${moveName(move)}`);
    return { move, name: moveName(move), prior };
  });
  // A stable sort: equal shares keep the engine's order.
  rows.sort((a, b) => b.prior - a.prior);
  return { rows, value: out.value, actions: out.logits.length };
}
