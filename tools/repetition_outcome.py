#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Criteria (a)-(e) and the decision rule of docs/experiments/v3-repetition-outcome.md.

Usage: tools/repetition_outcome.py DIR [--out summary.json]

DIR holds runs/<run>/metrics.jsonl and arena/{G,A,D}-<prefix>[-sN].json, as
written by the evaluation commands of the pre-registration. Exits 2 when an
expected file is missing (a criterion that cannot be computed is not passed).
"""

import json
import math
import sys
from pathlib import Path

RULES = {"lc1d-2": "az-lc1d", "lc1-2": "az-lc1-m2"}
SEEDS = (1, 2, 3)
LAST = range(181, 201)  # sample S: self-play iterations 181-200
Z = 1.96


def wilson(k: int, n: int) -> list[float]:
    if n == 0:
        return [math.nan, math.nan]
    p = k / n
    d = 1 + Z * Z / n
    c = (p + Z * Z / (2 * n)) / d
    h = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / d
    return [max(0.0, c - h), min(1.0, c + h)]


def score(w: int, d: int, l: int) -> dict:
    """Mean of win 1 / draw 1/2 / loss 0 with a normal 95 % interval over games."""
    n = w + d + l
    if n < 2:
        return {"n": n, "score": (w + d / 2) / n if n else math.nan, "ci95": [math.nan, math.nan]}
    m = (w + d / 2) / n
    var = (w * (1 - m) ** 2 + d * (0.5 - m) ** 2 + l * m**2) / (n - 1)
    h = Z * math.sqrt(var / n)
    return {"n": n, "score": m, "ci95": [max(0.0, m - h), min(1.0, m + h)]}


def prop(k: int, n: int) -> dict:
    return {"k": k, "n": n, "p": k / n if n else math.nan, "ci95": wilson(k, n)}


def need(path: Path) -> Path:
    if not path.exists():
        print(f"missing {path}", file=sys.stderr)
        sys.exit(2)
    return path


def sample_s(root: Path, prefix: str) -> dict:
    tot = {"games": 0, "truncated": 0, "draws": 0, "variant": 0, "white_wins": 0}
    per_run = {}
    for s in SEEDS:
        rows = [json.loads(x) for x in need(root / "runs" / f"{prefix}-s{s}" / "metrics.jsonl").read_text().splitlines() if x]
        rows = [r for r in rows if r["iteration"] in LAST]
        if len(rows) != len(LAST):
            print(f"{prefix}-s{s}: {len(rows)} of {len(LAST)} iterations in 181-200", file=sys.stderr)
            sys.exit(2)
        run = {
            "games": 50 * len(rows),
            "truncated": sum(r["truncated_games"] for r in rows),
            "draws": sum(r["draws"] for r in rows),
            "variant": sum(r["variant_rule_endings"] for r in rows),
            "white_wins": sum(r["white_wins"] for r in rows),
        }
        per_run[f"s{s}"] = run
        for k in tot:
            tot[k] += run[k]
    return summarise(tot) | {"per_run": per_run}


def summarise(t: dict) -> dict:
    fin = t["games"] - t["truncated"]
    decisive = fin - t["draws"]
    white_losses = decisive - t["white_wins"]
    return {
        "counts": t,
        "R": prop(t["variant"], fin),
        "D": prop(t["draws"], fin),
        "white": score(t["white_wins"], t["draws"], white_losses),
        # Wins through the repetition rule among decisive games (criterion e).
        # Under both rules every draw is a repetition ending (lc1-2 has none,
        # lc1d-2 has no other source), so repetition wins = endings - draws.
        "E": prop(t["variant"] - t["draws"], decisive),
    }


def arena(path: Path) -> list[dict]:
    return json.loads(need(path).read_text())


def finished(rec: dict) -> int:
    return rec["wins"] + rec["draws"] + rec["losses"]


def sample_a(root: Path, prefix: str) -> dict:
    tot = {"games": 0, "truncated": 0, "draws": 0, "variant": 0, "white_wins": 0}
    matches = []
    for r in arena(root / "arena" / f"A-{prefix}.json"):
        a, w, red, v = r["a"], r["a_as_white"], r["a_as_red"], r["a_by_variant_rule"]
        m = {
            "games": r["games"],
            "truncated": a["unfinished"],
            "draws": a["draws"],
            "variant": finished(v),
            "white_wins": w["wins"] + red["losses"],
        }
        matches.append({"a": r["player_a"], "b": r["player_b"], "score": r["score"], "ci95": r["ci95"]} | summarise(m))
        for k in tot:
            tot[k] += m[k]
    return summarise(tot) | {"matches": matches}


def sample_g(root: Path, prefix: str) -> dict:
    out = {}
    for s in SEEDS:
        [r] = arena(root / "arena" / f"G-{prefix}-s{s}.json")
        a, v = r["a"], r["a_by_variant_rule"]
        base = {k: a[k] - v[k] for k in ("wins", "draws", "losses")}
        out[f"s{s}"] = {
            "score": r["score"],
            "ci95": r["ci95"],
            "record": a,
            "passes": r["ci95"][0] > 0.5,
            "final_score_in_variant_endings": score(v["wins"], v["draws"], v["losses"]),
            "final_score_in_base_endings": score(base["wins"], base["draws"], base["losses"]),
        }
    out["holds"] = all(out[f"s{s}"]["passes"] for s in SEEDS)
    return out


def sample_d(root: Path, prefix: str) -> list[dict]:
    games = []
    for r in arena(root / "arena" / f"D-{prefix}.json"):
        for colour in ("a_as_white", "a_as_red"):
            rec = r[colour]
            res = "win" if rec["wins"] else "draw" if rec["draws"] else "loss" if rec["losses"] else "unfinished"
            games.append({"a": r["player_a"], "b": r["player_b"], "a_colour": colour[5:], "a_result": res})
    return games


def overlaps(x: list[float], y: list[float]) -> bool:
    return x[0] <= y[1] and y[0] <= x[1]


def worse_balance(draw: dict, loss: dict) -> bool:
    return not overlaps(draw["ci95"], loss["ci95"]) and abs(draw["score"] - 0.5) > abs(loss["score"] - 0.5)


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    root = Path(args[0])
    out = Path(args[args.index("--out") + 1]) if "--out" in args else None
    res = {
        rule: {"S": sample_s(root, p), "A": sample_a(root, p), "G": sample_g(root, p), "D": sample_d(root, p)}
        for rule, p in RULES.items()
    }
    d, l = res["lc1d-2"], res["lc1-2"]
    cond = {
        "1_gradient_holds_lc1d": d["G"]["holds"],
        "2_decisive_lc1d": d["A"]["D"]["ci95"][1] <= 0.10 and d["S"]["D"]["ci95"][1] <= 0.10,
        "3_balance_not_worse_lc1d": not (
            worse_balance(d["S"]["white"], l["S"]["white"]) or worse_balance(d["A"]["white"], l["A"]["white"])
        ),
        "4_lc1_rule_not_rare": l["A"]["R"]["ci95"][0] > 0.05 or l["S"]["R"]["ci95"][0] > 0.05,
    }
    res["criteria"] = {
        "a_rarely_decides": {
            rule: {s: res[rule][s]["R"]["ci95"][1] <= 0.05 for s in ("A", "S")} for rule in RULES
        },
        "e_repetition_wins_dominate_lc1": {s: l[s]["E"]["ci95"][0] > 0.5 for s in ("A", "S")},
        "lc1_draws_seen": l["A"]["counts"]["draws"] + l["S"]["counts"]["draws"],
    }
    res["decision"] = cond | {"prefer_lc1d": all(cond.values())}
    text = json.dumps(res, indent=2) + "\n"
    if out:
        out.write_text(text)
    print(text)


if __name__ == "__main__":
    main()
