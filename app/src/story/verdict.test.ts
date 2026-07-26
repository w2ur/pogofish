import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  VERDICT,
  VERDICT_THRESHOLDS,
  VERDICT_TOTALS,
  classifyVerdict,
  type TournamentResult,
  type VerdictLevel,
  type VerdictRow,
} from "./verdict";

/* The Scene 8 table used to be a hand-typed array in data.ts. Two of its five
   rows carried numbers that contradicted the tournament output, one carried a
   fail reason with nothing behind it, and one described a variant that was
   never trained. These tests exist so that can't come back: the derivation is
   re-done here from the raw JSON fields, and the figures the article actually
   prints are pinned as literals so a data refresh cannot silently leave a
   stale badge or a stale bar on the page. */

const TOURNAMENT_DIR = fileURLToPath(new URL("../data/tournaments", import.meta.url));

function readTournament(variant: string, kind: string): TournamentResult {
  return JSON.parse(readFileSync(`${TOURNAMENT_DIR}/${variant}/${kind}.json`, "utf8"));
}

function row(id: string): VerdictRow {
  const found = VERDICT.find((r) => r.id === id);
  if (!found) throw new Error(`no verdict row for ${id}`);
  return found;
}

/** Table id -> directory name under src/data/tournaments/. */
const TESTED_VARIANTS = {
  "LC1-2": "lc1-2",
  "LC2-30": "lc2-30",
  "LC3-29": "lc3-29",
  "LC3-40": "lc3-40",
} as const;

describe("derived metrics", () => {
  for (const [id, dir] of Object.entries(TESTED_VARIANTS)) {
    it(`${id} recomputes from the committed tournament JSON`, () => {
      const balanceRun = readTournament(dir, "tournament_balance");
      const skillRun = readTournament(dir, "tournament_az_vs_random");
      const r = row(id);
      expect(r.balance).toBeCloseTo(balanceRun.white_wins / balanceRun.games, 12);
      expect(r.draws).toBeCloseTo(balanceRun.draws / balanceRun.games, 12);
      expect(r.skill).toBeCloseTo(skillRun.player1_win_rate, 12);
    });
  }
});

describe("published figures", () => {
  /* The values the article prints today, recorded from the committed runs.
     A mismatch means the data moved: check the tournament files, then update
     this table deliberately rather than letting the page drift. */
  const PUBLISHED: Record<string, { balance: number; skill: number; draws: number; verdict: VerdictLevel }> = {
    "LC1-2": { balance: 0.52, skill: 1.0, draws: 0.0, verdict: "pass" },
    "LC2-30": { balance: 0.42, skill: 0.995, draws: 0.0, verdict: "fail" },
    "LC3-29": { balance: 0.5, skill: 0.99, draws: 0.055, verdict: "pass" },
    "LC3-40": { balance: 0.485, skill: 1.0, draws: 0.01, verdict: "pass" },
  };

  for (const [id, expected] of Object.entries(PUBLISHED)) {
    it(`${id} still renders the recorded figures`, () => {
      const r = row(id);
      expect(r.balance).toBeCloseTo(expected.balance, 10);
      expect(r.skill).toBeCloseTo(expected.skill, 10);
      expect(r.draws).toBeCloseTo(expected.draws, 10);
      expect(r.verdict).toBe(expected.verdict);
    });
  }
});

describe("verdict thresholds", () => {
  for (const [id, dir] of Object.entries(TESTED_VARIANTS)) {
    it(`${id} badge follows the threshold rule, not a stored label`, () => {
      const balanceRun = readTournament(dir, "tournament_balance");
      const skillRun = readTournament(dir, "tournament_az_vs_random");
      const balance = balanceRun.white_wins / balanceRun.games;
      const draws = balanceRun.draws / balanceRun.games;
      const skill = skillRun.player1_win_rate;

      const balanceOk = Math.abs(balance - 0.5) <= VERDICT_THRESHOLDS.balanceTolerance;
      const skillOk = skill >= VERDICT_THRESHOLDS.minSkill;
      const drawsOk = draws <= VERDICT_THRESHOLDS.maxDraws;
      const expected: VerdictLevel = balanceOk && skillOk && drawsOk
        ? "pass"
        : !balanceOk
        ? "fail"
        : "warn";

      expect(row(id).verdict).toBe(expected);
    });
  }

  it("treats colour imbalance as disqualifying even when skill and draws are fine", () => {
    expect(classifyVerdict(0.5, 1, 0)).toBe("pass");
    expect(classifyVerdict(0.42, 1, 0)).toBe("fail");
    expect(classifyVerdict(0.5, 0.6, 0)).toBe("warn");
    expect(classifyVerdict(0.5, 1, 0.5)).toBe("warn");
  });
});

describe("LC1-3, the variant that never ran", () => {
  it("exposes no numeric metric", () => {
    const r = row("LC1-3");
    expect(r.balance).toBeNull();
    expect(r.skill).toBeNull();
    expect(r.draws).toBeNull();
    expect(r.games).toBeNull();
    expect(r.verdict).toBe("untested");
  });

  it("has no tournament data on disk to derive one from", () => {
    expect(readdirSync(TOURNAMENT_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name))
      .not.toContain("lc1-3");
  });
});

describe("header and prose totals", () => {
  it("counts every row and only the tested ones as tested", () => {
    expect(VERDICT_TOTALS.variants).toBe(VERDICT.length);
    expect(VERDICT_TOTALS.tested).toBe(Object.keys(TESTED_VARIANTS).length);
  });

  it("sums games across every committed tournament file", () => {
    const kinds = [
      "tournament_balance",
      "tournament_az_vs_random",
      "tournament_az_vs_dqn",
      "tournament_dqn_vs_random",
    ];
    const total = Object.values(TESTED_VARIANTS).reduce(
      (sum, dir) => sum + kinds.reduce((s, kind) => s + readTournament(dir, kind).games, 0),
      0,
    );
    expect(VERDICT_TOTALS.games).toBe(total);
  });

  it("only reports a per-variant game count because every variant ran the same schedule", () => {
    for (const r of VERDICT) {
      if (r.games === null) continue;
      expect(r.games, r.id).toBe(VERDICT_TOTALS.gamesPerTestedVariant);
    }
  });
});
