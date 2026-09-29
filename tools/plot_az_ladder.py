# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib>=3.8"]
# ///
"""Plot checkpoint Elo against training iteration from ladder JSON files.

Usage: uv run tools/plot_az_ladder.py out.png ladder-az-lc1-s1.json [more ladders...]
Files whose name contains "norep" are drawn as the ablation.
"""

import json
import re
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

INK = "#121010"
MUTED = "#6b6461"
FAINT = "#a39c97"
GRID = "#e4dfda"
PAPER = "#fbf8f4"


def main(dst: str, sources: list[str]) -> None:
    fig, ax = plt.subplots(figsize=(7.5, 4.2), dpi=150)
    fig.patch.set_facecolor(PAPER)
    ax.set_facecolor(PAPER)
    labelled = set()
    greedy = []
    for src in sources:
        ratings = json.load(open(src))["ratings"]
        pts = sorted(
            (int(re.search(r"iter_(\d+)", r["player"]).group(1)), r["elo"], r["ci95"])
            for r in ratings
            if "iter_" in r["player"]
        )
        greedy += [r["elo"] for r in ratings if r["player"] == "greedy"]
        ablation = "norep" in src
        color = FAINT if ablation else INK
        group = "repetition feature off (seed 1)" if ablation else "AlphaZero, lc1-2 (seeds 1–3)"
        x = [p[0] for p in pts]
        ax.fill_between(x, [p[2][0] for p in pts], [p[2][1] for p in pts], color=color, alpha=0.08, linewidth=0)
        ax.plot(x, [p[1] for p in pts], color=color, linewidth=2 if ablation else 1.5, marker="o",
                markersize=3, label=None if group in labelled else group)
        labelled.add(group)
    if greedy:
        g = sum(greedy) / len(greedy)
        ax.axhline(g, color=MUTED, linewidth=1, linestyle=(0, (4, 3)))
        ax.annotate("greedy (mean over ladders)", (x[0], g), xytext=(0, -12), textcoords="offset points",
                    fontsize=8, color=MUTED)
    ax.set_xlabel("training iteration (50 self-play games each)", color=MUTED, fontsize=9)
    ax.set_ylabel("Elo, random = 0 (95 % CI)", color=MUTED, fontsize=9)
    ax.grid(axis="y", color=GRID, linewidth=1)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(MUTED)
    ax.tick_params(colors=MUTED, labelsize=8)
    ax.legend(frameon=False, fontsize=8, loc="lower right", bbox_to_anchor=(1.0, 0.12), labelcolor=INK)
    fig.tight_layout()
    fig.savefig(dst, facecolor=PAPER)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
