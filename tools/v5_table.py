#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Generate round 5's tables and curve data (docs/experiments/v5-video.md).

Usage: v5_table.py [<v5 dir>]   (default docs/experiments/v5)

Reads the bench JSON `<program>-s<seed>-p<pct>.json` written by `v4bench`
(programs qtab, td, az100, az0) and the game JSON of `games/`, written by
`v5game`, and writes:

- `<v5 dir>/table.md`: per program, the score against greedy at each stage for
  each seed (95 % interval), the keep rates of seed 1, the game shown (seed 1),
  then the pre-registered criteria, each met or failed;
- `<v5 dir>/curves.json`: the same figures as data, for the video.

The addendum's tabular runs against random (`<v5 dir>/vs-random/`, seed 1) get
their own section and `qtab_vs_random` in `curves.json`.

Addendum 2's mosaics (`mosaic/`) and puzzles (`puzzles/`), seed 1, get a section
each and `mosaics` / `puzzles` in `curves.json`.

A stage not measured yet shows "—"; the criteria then read "pending".
Exit 0 written; 2 cannot run (a JSON with a foreign table hash, an opponent
other than greedy, a malformed file name, a game JSON whose player differs
from its bench JSON's).
"""
import json
import re
import sys
from pathlib import Path

ACCEPTED_TABLE_SHA256 = "1690c767b68a6214eb1fb4d74d932198a13f67c744b7c6e61102eeb44c5e3704"
PCTS = (0, 1, 2, 5, 10, 25, 50, 100)
SEEDS = (1, 2, 3)
PROGRAMS = {
    # name: (label, budget in games, games per stage unit)
    "qtab": ("Tabular learner (Q-learning, one value per position)", 5_000_000),
    "td": ("TD(λ) value net, one ply", 50_000),
    "az100": ("AlphaZero, 100 simulations", 10_000),
    "az0": ("AlphaZero, no search (policy argmax)", 10_000),
}
# Criterion 3 (v5-video.md): round 4's score against greedy at the last stage.
ROUND4 = {
    ("qtab", 1): (0.178, [0.163, 0.193], "v4-evaluation.md, exploratory 5,000,000-game run"),
    ("td", 1): (0.779, [0.763, 0.796], "v4 main table row 8"),
    ("td", 2): (0.764, [0.747, 0.781], "v4 main table row 9"),
    ("td", 3): (0.771, [0.754, 0.788], "v4 main table row 10"),
    ("az100", 1): (0.883, [0.870, 0.897], "v4 main table row 13"),
    ("az100", 2): (0.887, [0.875, 0.900], "v4 main table row 14"),
    ("az100", 3): (0.887, [0.874, 0.900], "v4 main table row 15"),
}
# Criterion 4: these stage-0 players score below 0.10 (upper 95 % bound).
STAGE0_BAR = 0.10
STAGE0_PROGRAMS = ("qtab", "td", "az0")
REFERENCES = {
    "random": (0.031, [0.024, 0.038]),
    "greedy": (0.493, [0.474, 0.512]),
    "table": (0.919, [0.908, 0.930]),
}
NAME = re.compile(r"^(qtab|td|az100|az0)-s([123])-p(\d{3})$")


def fail(msg: str) -> None:
    print(f"v5_table: {msg}", file=sys.stderr)
    sys.exit(2)


def fmt(x: float) -> str:
    return f"{x:.3f}"


def fmt_ci(score: float, ci: list) -> str:
    return f"{fmt(score)} [{fmt(ci[0])}, {fmt(ci[1])}]"


def stage_games(prog: str, pct: int) -> int:
    return PROGRAMS[prog][1] * pct // 100


def load(v5: Path) -> dict:
    runs = {}
    for f in sorted(v5.glob("*.json")):
        if f.name == "curves.json":
            continue
        m = NAME.match(f.stem)
        if not m:
            fail(f"{f}: not a <program>-s<seed>-p<pct> bench file")
        prog, seed, pct = m[1], int(m[2]), int(m[3])
        if pct not in PCTS:
            fail(f"{f}: stage {pct} % is not a pre-registered stage")
        d = json.loads(f.read_text())
        if d.get("table_sha256") != ACCEPTED_TABLE_SHA256:
            fail(f"{f}: foreign table hash {d.get('table_sha256')}")
        if d.get("opponent", "greedy") != "greedy":
            fail(f"{f}: opponent {d.get('opponent')}, expected greedy")
        a = d["arena"]
        run = {
            "file": f.name,
            "spec": d["spec"],
            "games_trained": stage_games(prog, pct),
            "score": a["score"],
            "ci95": a["ci95"],
            "scored_pairs": a["scored_pairs"],
            "unfinished": a["a"]["unfinished"],
            "keep_won": d["keep"]["won"]["rate"],
            "keep_drawn": d["keep"]["drawn"]["rate"],
            "git_rev": d.get("git_rev"),
        }
        g = v5 / "games" / f.name
        if g.exists():
            game = json.loads(g.read_text())
            if game["spec"] != d["spec"]:
                fail(f"{g}: player {game['spec']} differs from the bench's {d['spec']}")
            run["game"] = {
                "file": f"games/{g.name}",
                "result": game["player_result"],
                "plies": game["plies"],
            }
        runs[(prog, seed, pct)] = run
    return runs


def load_vs_random(v5: Path) -> dict:
    """The addendum: qtab seed 1 against the bench's random player, by stage."""
    out = {}
    d = v5 / "vs-random"
    for f in sorted(d.glob("*.json")) if d.is_dir() else []:
        m = NAME.match(f.stem)
        if not m or m[1] != "qtab" or m[2] != "1" or int(m[3]) not in PCTS:
            fail(f"{f}: not a qtab-s1-p<pct> file of a pre-registered stage")
        j = json.loads(f.read_text())
        if j.get("table_sha256") != ACCEPTED_TABLE_SHA256:
            fail(f"{f}: foreign table hash")
        if j.get("opponent") != "random":
            fail(f"{f}: opponent {j.get('opponent')}, expected random")
        a = j["arena"]
        run = {
            "file": f"vs-random/{f.name}",
            "spec": j["spec"],
            "games_trained": stage_games("qtab", int(m[3])),
            "score": a["score"],
            "ci95": a["ci95"],
            "unfinished": a["a"]["unfinished"],
        }
        g = d / "games" / f.name
        if g.exists():
            game = json.loads(g.read_text())
            if game.get("opponent") != "random":
                fail(f"{g}: opponent {game.get('opponent')}, expected random")
            run["game"] = {
                "file": f"vs-random/games/{g.name}",
                "result": game["player_result"],
                "plies": game["plies"],
            }
        out[int(m[3])] = run
    return out


ROUND4_VS_RANDOM = (0.784, [0.766, 0.801])
MOSAICS = (
    ("qtab-random", "Tabular learner vs random"),
    ("qtab", "Tabular learner vs greedy"),
    ("td", "TD(λ) vs greedy"),
    ("az100", "AlphaZero, 100 simulations, vs greedy"),
    ("az0", "AlphaZero, no search, vs greedy"),
)
PUZZLES = (
    ("qtab", "Tabular learner", "solved"),
    ("td", "TD(λ)", "solved"),
    ("az", "AlphaZero, no search", "solved_without_search"),
    ("az", "AlphaZero, 100 simulations", "solved_with_search"),
)


def mosaic_path(v5: Path, key: str, pct: int) -> Path:
    prog, _, opp = key.partition("-")
    suffix = f"-{opp}" if opp else ""
    return v5 / "mosaic" / f"{prog}-s1-p{pct:03d}{suffix}.json"


def load_addendum2(v5: Path) -> tuple:
    mosaics, puzzles = {}, {}
    for key, _ in MOSAICS:
        for pct in PCTS:
            f = mosaic_path(v5, key, pct)
            if f.exists():
                j = json.loads(f.read_text())
                mosaics[(key, pct)] = {
                    "file": str(f.relative_to(v5)),
                    "games": j["games"],
                    "wins": j["wins"],
                    "losses": j["losses"],
                    "draws": j["draws"],
                    "unfinished": j["unfinished"],
                    "mistakes": j["player_moves_mistake"],
                    "judged": j["player_moves_keep"] + j["player_moves_mistake"],
                    "mistake_share": j["mistake_share"],
                    "results": [g["result"] for g in j["game_list"]],
                }
    for prog in ("qtab", "td", "az"):
        for pct in PCTS:
            f = v5 / "puzzles" / f"{prog}-s1-p{pct:03d}.json"
            if f.exists():
                j = json.loads(f.read_text())
                puzzles[(prog, pct)] = {
                    k: j[k]
                    for k in ("solved", "solved_without_search", "solved_with_search", "puzzles")
                    if k in j
                } | {"file": str(f.relative_to(v5))}
    return mosaics, puzzles


def addendum2_section(mosaics: dict, puzzles: dict) -> list:
    out = [
        "## Addendum 2: mosaics (first 50 bench pairs, seed 1)",
        "",
        "Games won of 100, and the share of the program's moves that the solved uncapped "
        "table judges mistakes (repetition ignored, †).",
        "",
        "| Mosaic | " + " | ".join(f"{p} %" for p in PCTS) + " |",
        "|---|" + "---|" * len(PCTS),
    ]
    for key, label in MOSAICS:
        cells = []
        for pct in PCTS:
            m = mosaics.get((key, pct))
            cells.append(
                f"{m['wins']} won, {100 * m['mistake_share']:.0f} % mistakes" if m else "—"
            )
        out.append(f"| {label} | " + " | ".join(cells) + " |")
    out += [
        "",
        "## Addendum 2: puzzles solved (of 9, seed 1)",
        "",
        "| Player | " + " | ".join(f"{p} %" for p in PCTS) + " |",
        "|---|" + "---|" * len(PCTS),
    ]
    for prog, label, field in PUZZLES:
        cells = []
        for pct in PCTS:
            z = puzzles.get((prog, pct))
            cells.append(f"{round(z[field], 2):g}" if z and z.get(field) is not None else "—")
        out.append(f"| {label} | " + " | ".join(cells) + " |")
    out += [
        "",
        "A fractional count: the player's tied set holds the key move among others "
        "(it would pick uniformly among them).",
        "",
    ]
    return out


def vs_random_section(vr: dict) -> list:
    out = [
        "## Addendum: tabular learner against random (seed 1, not pre-registered with the round)",
        "",
        "| Stage | Games trained | Score vs random | Unfinished | Game shown |",
        "|---|---|---|---|---|",
    ]
    for pct in PCTS:
        r = vr.get(pct)
        g = r.get("game") if r else None
        out.append(
            f"| {pct} % | {stage_games('qtab', pct):,} | "
            + (f"{fmt_ci(r['score'], r['ci95'])} | {r['unfinished']}" if r else "— | —")
            + f" | {g['result'] + ', ' + str(g['plies']) + ' plies' if g else '—'} |"
        )
    last = vr.get(100)
    score, ci = ROUND4_VS_RANDOM
    if last is None:
        verdict = "pending"
    else:
        ok = last["ci95"][0] <= ci[1] and ci[0] <= last["ci95"][1] and all(
            r["unfinished"] == 0 for r in vr.values()
        )
        verdict = "met" if ok else "failed"
    out += [
        "",
        f"Criterion: the last stage overlaps round 4's {fmt_ci(score, ci)} and no game is "
        f"unfinished: {verdict}.",
        "",
    ]
    return out


def criteria(runs: dict) -> list:
    rows = []
    all_runs = list(runs.values())
    total = len(PROGRAMS) * len(SEEDS) * len(PCTS)
    complete = len(all_runs) == total
    unfinished = sum(r["unfinished"] for r in all_runs)
    rows.append((
        "1. Controls pass",
        f"{len(all_runs)} of {total} benches wrote a JSON (a bench whose controls fail writes none)",
        "met" if complete else "pending",
    ))
    rows.append((
        "2. No unfinished game",
        f"{unfinished} unfinished over {sum(1 for _ in all_runs)} benches",
        ("met" if unfinished == 0 else "failed") if complete else
        ("failed" if unfinished else "pending"),
    ))
    for (prog, seed), (score, ci, src) in ROUND4.items():
        r = runs.get((prog, seed, 100))
        if r is None:
            rows.append((f"3. {prog} seed {seed} reproduces round 4", f"round 4 {fmt_ci(score, ci)} ({src})", "pending"))
            continue
        ok = r["ci95"][0] <= ci[1] and ci[0] <= r["ci95"][1]
        rows.append((
            f"3. {prog} seed {seed} reproduces round 4",
            f"{fmt_ci(r['score'], r['ci95'])} against round 4's {fmt_ci(score, ci)} ({src})",
            "met" if ok else "failed",
        ))
    for prog in STAGE0_PROGRAMS:
        for seed in SEEDS:
            r = runs.get((prog, seed, 0))
            if r is None:
                rows.append((f"4. {prog} seed {seed} at stage 0 below {STAGE0_BAR}", "", "pending"))
                continue
            rows.append((
                f"4. {prog} seed {seed} at stage 0 below {STAGE0_BAR}",
                fmt_ci(r["score"], r["ci95"]),
                "met" if r["ci95"][1] < STAGE0_BAR else "failed",
            ))
    return rows


def table(runs: dict, vr: dict, a2: tuple) -> str:
    out = [
        "# Round 5: scores by stage",
        "",
        "Generated by `tools/v5_table.py` from the JSON of this directory; do not edit.",
        "Score: against greedy under `lc1-2`, 1,000 colour-swapped pairs (round 4's bench), "
        "95 % interval. Keep: share of held-out won / drawn positions where the move keeps "
        "the uncapped table's value (seed 1; read from the uncapped table, not an in-game "
        "measure, `v4-evaluation.md` †). Game shown: game 0 of the bench's arena, the "
        "program as White (seed 1); it illustrates, the score measures.",
        "",
        "References (round 4, not re-measured): "
        + "; ".join(f"{k} {fmt_ci(*v)}" for k, v in REFERENCES.items())
        + ".",
        "",
    ]
    for prog, (label, budget) in PROGRAMS.items():
        out += [f"## {label}", "", f"Budget: {budget:,} self-play games.", ""]
        out.append("| Stage | Games trained | Seed 1 | Seed 2 | Seed 3 | Keep won / drawn (seed 1) | Game shown (seed 1) |")
        out.append("|---|---|---|---|---|---|---|")
        for pct in PCTS:
            cells = [f"{pct} %", f"{stage_games(prog, pct):,}"]
            for seed in SEEDS:
                r = runs.get((prog, seed, pct))
                cells.append(fmt_ci(r["score"], r["ci95"]) if r else "—")
            r1 = runs.get((prog, 1, pct))
            cells.append(f"{fmt(r1['keep_won'])} / {fmt(r1['keep_drawn'])}" if r1 else "—")
            g = r1.get("game") if r1 else None
            cells.append(f"{g['result']}, {g['plies']} plies" if g else "—")
            out.append("| " + " | ".join(cells) + " |")
        out.append("")
    out += ["## Criteria (pre-registered)", "", "| Criterion | Figures | Verdict |", "|---|---|---|"]
    for name, figs, verdict in criteria(runs):
        out.append(f"| {name} | {figs} | {verdict} |")
    out.append("")
    if vr:
        out += vs_random_section(vr)
    if a2[0] or a2[1]:
        out += addendum2_section(*a2)
    return "\n".join(out)


def curves(runs: dict, vr: dict, a2: tuple) -> dict:
    mosaics, puzzles = a2
    return {
        "mosaics": {
            key: [{"pct": pct, **mosaics[(key, pct)]} for pct in PCTS if (key, pct) in mosaics]
            for key, _ in MOSAICS
        },
        "puzzles": {
            prog: [{"pct": pct, **puzzles[(prog, pct)]} for pct in PCTS if (prog, pct) in puzzles]
            for prog in ("qtab", "td", "az")
        },
        "qtab_vs_random": {
            "seed": 1,
            "opponent": "random",
            "stages": [{"pct": pct, **vr[pct]} for pct in PCTS if pct in vr],
        },
        "source": "docs/experiments/v5-video.md; generated by tools/v5_table.py",
        "opponent": "greedy",
        "rules": "lc1-2",
        "stages_pct": list(PCTS),
        "references": {k: {"score": s, "ci95": ci} for k, (s, ci) in REFERENCES.items()},
        "programs": {
            prog: {
                "label": label,
                "budget_games": budget,
                "seeds": {
                    str(seed): [
                        {"pct": pct, **runs[(prog, seed, pct)]}
                        for pct in PCTS
                        if (prog, seed, pct) in runs
                    ]
                    for seed in SEEDS
                },
            }
            for prog, (label, budget) in PROGRAMS.items()
        },
    }


def main() -> None:
    v5 = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/experiments/v5")
    if not v5.is_dir():
        fail(f"{v5} is not a directory")
    runs, vr, a2 = load(v5), load_vs_random(v5), load_addendum2(v5)
    (v5 / "table.md").write_text(table(runs, vr, a2))
    (v5 / "curves.json").write_text(json.dumps(curves(runs, vr, a2), indent=1) + "\n")
    print(f"{len(runs)} benches -> {v5 / 'table.md'}, {v5 / 'curves.json'}")


if __name__ == "__main__":
    main()
