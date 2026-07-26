/**
 * Scene 8 verdict table — derived, never typed.
 *
 * Every number this module exports is computed from the tournament JSON
 * committed under `src/data/tournaments/` (see the README there for
 * provenance and the exact commands that regenerate each file). No metric,
 * badge or header count in the rendered table is a literal in TypeScript
 * source; if the data is re-run, the page follows and the tests fail loudly
 * on anything that moved.
 *
 * LC1-3 is deliberately present with no numbers: it is a rule variant the
 * article shows in Scene 7, but it was never trained and never played a
 * tournament. Rendering it as untested is the honest option; deleting it
 * would hide a variant the reader has already met, and inventing figures
 * for it is what this module exists to prevent.
 */

import lc12Balance from "../data/tournaments/lc1-2/tournament_balance.json";
import lc12AzVsRandom from "../data/tournaments/lc1-2/tournament_az_vs_random.json";
import lc12AzVsDqn from "../data/tournaments/lc1-2/tournament_az_vs_dqn.json";
import lc12DqnVsRandom from "../data/tournaments/lc1-2/tournament_dqn_vs_random.json";
import lc230Balance from "../data/tournaments/lc2-30/tournament_balance.json";
import lc230AzVsRandom from "../data/tournaments/lc2-30/tournament_az_vs_random.json";
import lc230AzVsDqn from "../data/tournaments/lc2-30/tournament_az_vs_dqn.json";
import lc230DqnVsRandom from "../data/tournaments/lc2-30/tournament_dqn_vs_random.json";
import lc329Balance from "../data/tournaments/lc3-29/tournament_balance.json";
import lc329AzVsRandom from "../data/tournaments/lc3-29/tournament_az_vs_random.json";
import lc329AzVsDqn from "../data/tournaments/lc3-29/tournament_az_vs_dqn.json";
import lc329DqnVsRandom from "../data/tournaments/lc3-29/tournament_dqn_vs_random.json";
import lc340Balance from "../data/tournaments/lc3-40/tournament_balance.json";
import lc340AzVsRandom from "../data/tournaments/lc3-40/tournament_az_vs_random.json";
import lc340AzVsDqn from "../data/tournaments/lc3-40/tournament_az_vs_dqn.json";
import lc340DqnVsRandom from "../data/tournaments/lc3-40/tournament_dqn_vs_random.json";

/** One tournament run, as written by `crates/train/src/bin/tournament.rs`. */
export type TournamentResult = {
  variant: string;
  games: number;
  player1: string;
  player2: string;
  white_wins: number;
  red_wins: number;
  draws: number;
  player1_win_rate: number;
};

/** The four match-ups run for every tested variant. */
export type VariantTournaments = {
  /** Trained AlphaZero model against itself — the colour-balance probe. */
  balance: TournamentResult;
  /** Trained AlphaZero model against a random legal-move player. */
  azVsRandom: TournamentResult;
  /** Trained AlphaZero model against the DQN baseline. */
  azVsDqn: TournamentResult;
  /** DQN baseline against a random legal-move player. */
  dqnVsRandom: TournamentResult;
};

/** Every committed tournament, keyed by variant id as rendered in the table. */
export const TOURNAMENTS: Record<string, VariantTournaments> = {
  "LC1-2": {
    balance: lc12Balance,
    azVsRandom: lc12AzVsRandom,
    azVsDqn: lc12AzVsDqn,
    dqnVsRandom: lc12DqnVsRandom,
  },
  "LC2-30": {
    balance: lc230Balance,
    azVsRandom: lc230AzVsRandom,
    azVsDqn: lc230AzVsDqn,
    dqnVsRandom: lc230DqnVsRandom,
  },
  "LC3-29": {
    balance: lc329Balance,
    azVsRandom: lc329AzVsRandom,
    azVsDqn: lc329AzVsDqn,
    dqnVsRandom: lc329DqnVsRandom,
  },
  "LC3-40": {
    balance: lc340Balance,
    azVsRandom: lc340AzVsRandom,
    azVsDqn: lc340AzVsDqn,
    dqnVsRandom: lc340DqnVsRandom,
  },
};

/**
 * The pass/fail thresholds the article states in Scene 7. They are the whole
 * rubric: a variant that clears all three is playable, one that misses colour
 * balance is broken as a game rather than merely dull.
 */
export const VERDICT_THRESHOLDS = {
  /** |white share - 0.5| must not exceed this. */
  balanceTolerance: 0.05,
  /** Win rate against a random player must reach this. */
  minSkill: 0.75,
  /** Draw share must not exceed this. */
  maxDraws: 0.1,
} as const;

export type VerdictLevel = "pass" | "warn" | "fail" | "untested";

export type VerdictRow = {
  id: string;
  /** English fallback label; the rendered label comes from i18n. */
  label: string;
  /** White's share of decided-or-drawn games in the self-play tournament. */
  balance: number | null;
  /** Win rate against a random legal-move player. */
  skill: number | null;
  /** Draw share in the self-play tournament. */
  draws: number | null;
  verdict: VerdictLevel;
  /** True for the variants whose models ship in the playable app. */
  shipped: boolean;
  /** Total games behind this row, across all four committed match-ups. */
  games: number | null;
};

/**
 * The two variants whose ONNX models are bundled in the playable app
 * (`public/models/lc1-2`, `public/models/lc3-29`). This is what the star in
 * the table marks — "shipped", not "best".
 */
const SHIPPED_VARIANTS = ["LC1-2", "LC3-29"];

/** Order variants appear in Scene 7, so the two scenes read consistently. */
const VARIANT_ORDER = ["LC1-2", "LC1-3", "LC2-30", "LC3-29", "LC3-40"];

/** English fallback labels, used only when an i18n label is missing. */
const VARIANT_LABELS: Record<string, string> = {
  "LC1-2": "Sudden Death",
  "LC1-3": "Triple Repeat",
  "LC2-30": "Hard Cap · 30",
  "LC3-29": "Classic · 29",
  "LC3-40": "Long Soft Cap",
};

/**
 * Apply the rubric. Colour imbalance is disqualifying on its own — a game
 * whose winner is decided by which side you were dealt is not a game — so it
 * short-circuits to `fail` while the softer misses only warn.
 */
export function classifyVerdict(
  balance: number,
  skill: number,
  draws: number,
): Exclude<VerdictLevel, "untested"> {
  const balanceOk = Math.abs(balance - 0.5) <= VERDICT_THRESHOLDS.balanceTolerance;
  const skillOk = skill >= VERDICT_THRESHOLDS.minSkill;
  const drawsOk = draws <= VERDICT_THRESHOLDS.maxDraws;
  if (balanceOk && skillOk && drawsOk) return "pass";
  if (!balanceOk) return "fail";
  return "warn";
}

function buildRow(id: string): VerdictRow {
  const label = VARIANT_LABELS[id] ?? id;
  const shipped = SHIPPED_VARIANTS.includes(id);
  const runs = TOURNAMENTS[id];
  if (!runs) {
    // Never trained, never played. No numbers exist and none are invented.
    return { id, label, balance: null, skill: null, draws: null, verdict: "untested", shipped, games: null };
  }
  const balance = runs.balance.white_wins / runs.balance.games;
  const draws = runs.balance.draws / runs.balance.games;
  const skill = runs.azVsRandom.player1_win_rate;
  const games =
    runs.balance.games + runs.azVsRandom.games + runs.azVsDqn.games + runs.dqnVsRandom.games;
  return { id, label, balance, skill, draws, verdict: classifyVerdict(balance, skill, draws), shipped, games };
}

/** Scene 8 verdict rows, derived from the committed tournament JSON. */
export const VERDICT: VerdictRow[] = VARIANT_ORDER.map(buildRow);

const TESTED = VERDICT.filter((row) => row.games !== null);

/** Header and prose counts, derived from the same files as the rows. */
export const VERDICT_TOTALS = {
  /** Rule variants in the table, tested or not. */
  variants: VERDICT.length,
  /** Variants that actually played a tournament. */
  tested: TESTED.length,
  /** Total games across every committed tournament file. */
  games: TESTED.reduce((sum, row) => sum + (row.games ?? 0), 0),
  /** Games behind each tested variant — every variant ran the same schedule. */
  gamesPerTestedVariant: TESTED.length === 0
    ? 0
    : TESTED.reduce((sum, row) => sum + (row.games ?? 0), 0) / TESTED.length,
} as const;
