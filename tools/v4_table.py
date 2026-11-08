#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Generate the v4 evaluation tables of docs/experiments/v4-evaluation.md.

Usage: v4_table.py <json dir> <doc.md>

Reads every *.json of <json dir> (main table) and of <json dir>/appendix-lc1d/
(appendix table), written by `v4bench`, and rewrites only the text between the
marker pairs

    <!-- v4-table:start -->    ...  <!-- v4-table:end -->
    <!-- v4-appendix:start --> ...  <!-- v4-appendix:end -->

Exit 0 on success, 2 when it cannot run (a JSON with a foreign table hash or
without `command`, no JSON, a missing marker): nothing is written then.
"""
import json
import re
import shlex
import sys
from pathlib import Path

ACCEPTED_TABLE_SHA256 = "1690c767b68a6214eb1fb4d74d932198a13f67c744b7c6e61102eeb44c5e3704"
APPENDIX_DIR = "appendix-lc1d"
MARKS = {
    "main": ("<!-- v4-table:start -->", "<!-- v4-table:end -->"),
    "appendix": ("<!-- v4-appendix:start -->", "<!-- v4-appendix:end -->"),
}

GROUPS = ("controls", "scripted", "table learner", "TD", "nets")
SCRIPTED_ORDER = ("random", "greedy", "greedy-2ply")
LABELS = {
    "random": "random (takes a win, avoids an immediate loss)",
    "greedy": "greedy",
    "greedy-2ply": "greedy-2ply",
    "table": "table (perfect player)",
}
MARK = "†"

NOTE = (
    f"{MARK} Read from the uncapped game's table, but the player learnt under the rule of the "
    "\"Trained under\" column and is scored under `lc1-2` (a position's third occurrence loses "
    "for the player who causes it). The table "
    "ignores repetition and the sampled positions carry no history, so the repetition inputs "
    "of a net read \"never seen\": these two figures are not an in-game measure. The score "
    "against greedy is played under the live rules."
)
KEEP_NOTE = (
    "Keep won (drawn): the share of held-out won (drawn) positions in which the player's move "
    "keeps the position's value in the uncapped table. Score: against greedy, over finished "
    "pairs only; unfinished games (1,000-ply limit) are counted apart and are never draws."
)


class Refusal(Exception):
    pass


def load_dir(directory: Path) -> list[dict]:
    files = sorted(directory.glob("*.json"))
    if not files:
        raise Refusal(f"no JSON in {directory}")
    runs = []
    for path in files:
        try:
            data = json.loads(path.read_text())
        except (OSError, ValueError) as err:
            raise Refusal(f"{path}: unreadable ({err})") from err
        if not data.get("command"):
            raise Refusal(f"{path}: no `command`")
        if data.get("table_sha256") != ACCEPTED_TABLE_SHA256:
            raise Refusal(f"{path}: table_sha256 {data.get('table_sha256')!r} is not the accepted one")
        for key in ("player", "keep", "arena"):
            if key not in data:
                raise Refusal(f"{path}: no `{key}`")
        runs.append(data)
    return runs


def group_of(player: str) -> str:
    if player == "table":
        return "controls"
    if player in SCRIPTED_ORDER:
        return "scripted"
    if player.startswith("qtab:"):
        return "table learner"
    if player.startswith("td:"):
        return "TD"
    if player.startswith("net:"):
        return "nets"
    raise Refusal(f"unknown player {player!r}")


def sort_key(run: dict):
    player = run["player"]
    group = group_of(player)
    rank = GROUPS.index(group)
    if group == "scripted":
        return (rank, SCRIPTED_ORDER.index(player), "", 0, player)
    seed = re.search(r"(az-[a-z0-9-]*?|[a-z0-9]*-)?s(\d+)", player)
    family = seed.group(1) or "" if seed else ""
    seed_n = int(seed.group(2)) if seed else 0
    sims = re.search(r":(\d+)$", player)
    return (rank, seed_n, family, int(sims.group(1)) if sims else 0, player)


def trained_under(player: str) -> str:
    if player.startswith(("td:", "net:", "qtab:")):
        return "lc1d-2" if "lc1d" in player else "lc1-2"
    return "—"


def label(player: str) -> str:
    if player in LABELS:
        return LABELS[player]
    spec = player.split(":", 1)[1] if ":" in player else player
    if player.startswith("net:"):
        path, _, sims = spec.rpartition(":")
        p = Path(path)
        name = p.parent.name if p.stem == "final" else p.stem
        search = "policy argmax, no search" if sims == "0" else f"{sims} simulations"
        return f"net {name}, {search}"
    if player.startswith("td:"):
        return f"TD(λ) {Path(spec).parent.name}"
    if player.startswith("qtab:"):
        return f"tabular learner {spec}"
    return player


def rate(stat: dict) -> str:
    lo, hi = stat["ci95"]
    return f"{stat['rate']:.3f} [{lo:.3f}, {hi:.3f}]"


def render(runs: list[dict], heading_note: str) -> str:
    runs = sorted(runs, key=sort_key)
    lines = [
        "| # | Player | Trained under | Keep won (95 % CI) | Keep drawn (95 % CI) "
        "| Score vs greedy (95 % CI) | Finished pairs | Unfinished games | Distinct games |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for i, run in enumerate(runs, 1):
        arena = run["arena"]
        mark = MARK if group_of(run["player"]) in ("TD", "nets", "table learner") else ""
        lo, hi = arena["ci95"]
        games = arena["games"]
        unfinished = arena["a"]["unfinished"]
        share = 100 * unfinished / games if games else 0.0
        lines.append(
            f"| {i} | {label(run['player'])} | {trained_under(run['player'])} "
            f"| {rate(run['keep']['won'])}{mark} | {rate(run['keep']['drawn'])}{mark} "
            f"| {arena['score']:.3f} [{lo:.3f}, {hi:.3f}] | {arena['scored_pairs']} of {arena['config']['pairs']} "
            f"| {unfinished} of {games} ({share:.1f} %) | {arena['distinct_games']} of {games} |"
        )
    out = ["\n".join(lines), "", KEEP_NOTE, "", heading_note, "", "Commands, by row:", ""]
    for i, run in enumerate(runs, 1):
        out.append(f"{i}. `{shlex.join(run['command'])}`")
    return "\n".join(out)


def rewrite(text: str, kind: str, body: str) -> str:
    start, end = MARKS[kind]
    if text.count(start) != 1 or text.count(end) != 1:
        raise Refusal(f"expected exactly one {start} / {end} pair")
    head, rest = text.split(start)
    _, tail = rest.split(end)
    return f"{head}{start}\n{body}\n{end}{tail}"


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    json_dir, doc = Path(argv[0]), Path(argv[1])
    try:
        text = doc.read_text()
        main_runs = load_dir(json_dir)
        appendix_runs = load_dir(json_dir / APPENDIX_DIR)
        text = rewrite(text, "main", render(main_runs, NOTE))
        text = rewrite(text, "appendix", render(appendix_runs, NOTE))
    except (Refusal, OSError) as err:
        print(f"v4_table: {err}", file=sys.stderr)
        return 2
    if text != doc.read_text():
        doc.write_text(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
