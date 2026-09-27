# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib>=3.8"]
# ///
"""Plot TD learning curves (score against greedy) from docs/experiments/v2-td.json.

Usage: uv run tools/plot_td_curve.py docs/experiments/v2-td.json docs/experiments/v2-td.png
"""

import json
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

INK = "#121010"
MUTED = "#6b6461"
FAINT = "#a39c97"
GRID = "#e4dfda"
PAPER = "#fbf8f4"


def main(src: str, dst: str) -> None:
    runs = json.load(open(src))["runs"]
    fig, ax = plt.subplots(figsize=(7.5, 4.2), dpi=150)
    fig.patch.set_facecolor(PAPER)
    ax.set_facecolor(PAPER)
    labelled = set()
    for name, run in runs.items():
        absolute = name.startswith("absolute")
        color = FAINT if absolute else INK
        group = "absolute encoding (seed 1)" if absolute else "mover-relative encoding (seeds 1–3)"
        x = [e["games_played"] / 1000 for e in run["evals"]]
        y = [e["vs_greedy"]["score"] for e in run["evals"]]
        lo = [e["vs_greedy"]["ci95"][0] for e in run["evals"]]
        hi = [e["vs_greedy"]["ci95"][1] for e in run["evals"]]
        ax.fill_between(x, lo, hi, color=color, alpha=0.10, linewidth=0)
        ax.plot(x, y, color=color, linewidth=2 if absolute else 1.5,
                label=None if group in labelled else group)
        labelled.add(group)
    ax.axhline(0.5, color=MUTED, linewidth=1, linestyle=(0, (4, 3)))
    ax.set_ylim(0, 1)
    ax.set_xlabel("self-play games (thousands)", color=MUTED, fontsize=9)
    ax.set_ylabel("score against greedy (95 % CI)", color=MUTED, fontsize=9)
    ax.grid(axis="y", color=GRID, linewidth=1)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(MUTED)
    ax.tick_params(colors=MUTED, labelsize=8)
    ax.legend(frameon=False, fontsize=8, loc="lower right", labelcolor=INK)
    fig.tight_layout()
    fig.savefig(dst, facecolor=PAPER)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
