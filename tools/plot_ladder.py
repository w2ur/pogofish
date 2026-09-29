# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib>=3.8"]
# ///
"""Plot an Elo ladder written by `ladder --out` (plan task 3.3).

Usage: uv run tools/plot_ladder.py ladder.json ladder.png
"""

import json
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

INK = "#121010"
MUTED = "#6b6461"
GRID = "#e4dfda"
PAPER = "#fbf8f4"


def main(src: str, dst: str) -> None:
    ladder = json.load(open(src))
    rows = list(reversed(ladder["ratings"]))  # highest at the top
    names = [r["player"] for r in rows]
    elo = [r["elo"] for r in rows]
    lo = [r["elo"] - r["ci95"][0] for r in rows]
    hi = [r["ci95"][1] - r["elo"] for r in rows]

    fig, ax = plt.subplots(figsize=(7, 0.55 * len(rows) + 1.2), dpi=150)
    fig.patch.set_facecolor(PAPER)
    ax.set_facecolor(PAPER)
    y = range(len(rows))
    ax.errorbar(elo, y, xerr=[lo, hi], fmt="o", color=INK, ecolor=INK,
                elinewidth=2, capsize=0, markersize=8, zorder=3)
    for yi, (e, h) in zip(y, zip(elo, hi)):
        ax.annotate(f"{e:.0f}", (e + h, yi), xytext=(6, 0), textcoords="offset points",
                    va="center", fontsize=9, color=MUTED)
    ax.set_yticks(list(y), names, fontsize=10, color=INK)
    ax.axvline(0, color=MUTED, linewidth=1, zorder=1)
    ax.grid(axis="x", color=GRID, linewidth=1, zorder=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(MUTED)
    ax.tick_params(axis="x", colors=MUTED, labelsize=9)
    ax.tick_params(axis="y", length=0)
    ax.set_xlabel(f"Elo ({ladder['anchor']} = 0), 95 % interval", color=MUTED, fontsize=9)
    fig.tight_layout()
    fig.savefig(dst, facecolor=PAPER)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
