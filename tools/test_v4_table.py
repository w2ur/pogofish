"""Tests of tools/v4_table.py. Run: uv run --with pytest pytest tools/test_v4_table.py"""
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent
spec = importlib.util.spec_from_file_location("v4_table", TOOLS / "v4_table.py")
v4_table = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v4_table)

SHA = v4_table.ACCEPTED_TABLE_SHA256
DOC = "# Doc\n\nintro\n\n<!-- v4-table:start -->\n<!-- v4-table:end -->\n\nmid\n\n" \
      "<!-- v4-appendix:start -->\n<!-- v4-appendix:end -->\n\noutro\n"


def stat(rate, half=0.01):
    return {"rate": rate, "ci95": [rate - half, rate + half], "n": 10000}


def make_run(player, won=0.5, drawn=0.4, score=0.6, unfinished=0, sha=SHA, command=True):
    run = {
        "player": player,
        "table_sha256": sha,
        "keep": {"won": stat(won), "drawn": stat(drawn)},
        "arena": {
            "score": score,
            "ci95": [score - 0.02, score + 0.02],
            "scored_pairs": 1000 - unfinished,
            "games": 2000,
            "distinct_games": 1900,
            "a": {"wins": 1, "draws": 0, "losses": 1, "unfinished": unfinished},
            "config": {"pairs": 1000},
        },
    }
    if command:
        run["command"] = ["./target/release/v4bench", "models/v3-solve", player, "--out", "x.json"]
    return run


def write(directory: Path, run: dict):
    directory.mkdir(parents=True, exist_ok=True)
    name = run["player"].replace(":", "_").replace("/", "_")
    (directory / f"{name}.json").write_text(json.dumps(run))


@pytest.fixture
def fixture(tmp_path):
    main_dir = tmp_path / "v4"
    for player in ("net:models/v3/az-lc1-m2-s2/final.pfw:100", "td:models/v4-td-lc1-s2/td.pfv",
                   "greedy-2ply", "table", "random", "td:models/v4-td-lc1-s1/td.pfv",
                   "net:models/v3/az-lc1-m2-s1/final.pfw:100", "greedy"):
        write(main_dir, make_run(player))
    write(main_dir / "appendix-lc1d", make_run("net:models/v3/az-lc1d-s1/final.pfw:100"))
    doc = tmp_path / "doc.md"
    doc.write_text(DOC)
    return main_dir, doc


def test_rewrite_is_idempotent(fixture):
    main_dir, doc = fixture
    assert v4_table.main([str(main_dir), str(doc)]) == 0
    first = doc.read_bytes()
    assert v4_table.main([str(main_dir), str(doc)]) == 0
    assert doc.read_bytes() == first
    assert first != DOC.encode()


def test_only_the_marked_blocks_change(fixture):
    main_dir, doc = fixture
    v4_table.main([str(main_dir), str(doc)])
    text = doc.read_text()
    assert text.startswith("# Doc\n\nintro\n\n<!-- v4-table:start -->\n")
    assert "<!-- v4-table:end -->\n\nmid\n\n<!-- v4-appendix:start -->\n" in text
    assert text.endswith("<!-- v4-appendix:end -->\n\noutro\n")


def test_row_order_controls_scripted_td_nets(fixture):
    main_dir, doc = fixture
    v4_table.main([str(main_dir), str(doc)])
    main_block = doc.read_text().split("<!-- v4-table:end -->")[0]
    rows = [line.split("|")[2].strip() for line in main_block.splitlines() if line.startswith("| ") and line[2].isdigit()]
    assert rows[0] == "table (perfect player)"
    assert rows[1].startswith("random (takes a win")
    assert rows[2:4] == ["greedy", "greedy-2ply"]
    assert [r for r in rows[4:]] == ["TD(λ) v4-td-lc1-s1", "TD(λ) v4-td-lc1-s2",
                                    "net az-lc1-m2-s1, 100 simulations", "net az-lc1-m2-s2, 100 simulations"]


def test_table_learner_group_sits_between_scripted_and_td(fixture):
    main_dir, doc = fixture
    write(main_dir, make_run("qtab:models/v4-qtab/q.bin"))
    v4_table.main([str(main_dir), str(doc)])
    block = doc.read_text().split("<!-- v4-table:end -->")[0]
    order = [line.split("|")[2].strip() for line in block.splitlines() if line.startswith("| ") and line[2].isdigit()]
    assert order.index("greedy-2ply") < order.index("tabular learner models/v4-qtab/q.bin") < order.index("TD(λ) v4-td-lc1-s1")


def test_refuses_foreign_table_hash(fixture):
    main_dir, doc = fixture
    write(main_dir, make_run("greedy", sha="0" * 64))
    assert v4_table.main([str(main_dir), str(doc)]) == 2
    assert doc.read_text() == DOC


def test_refuses_json_without_command(fixture):
    main_dir, doc = fixture
    write(main_dir / "appendix-lc1d", make_run("net:models/v3/az-lc1d-s2/final.pfw:100", command=False))
    assert v4_table.main([str(main_dir), str(doc)]) == 2
    assert doc.read_text() == DOC


def test_refuses_missing_marker(fixture):
    main_dir, doc = fixture
    doc.write_text(DOC.replace("<!-- v4-appendix:end -->", ""))
    before = doc.read_text()
    assert v4_table.main([str(main_dir), str(doc)]) == 2
    assert doc.read_text() == before


def test_unfinished_shown_apart(fixture):
    main_dir, doc = fixture
    write(main_dir, make_run("greedy", unfinished=30, drawn=0.25))
    v4_table.main([str(main_dir), str(doc)])
    row = next(line for line in doc.read_text().splitlines() if "| greedy |" in line)
    cells = [c.strip() for c in row.split("|")]
    assert "970 of 1000" in cells
    assert "30 of 2000 (1.5 %)" in cells
    assert "0.250 [0.240, 0.260]" in cells  # drawn rate untouched by unfinished games


def test_mismatch_mark_on_nets_and_td_only(fixture):
    main_dir, doc = fixture
    v4_table.main([str(main_dir), str(doc)])
    block = doc.read_text().split("<!-- v4-table:end -->")[0]
    rows = {line.split("|")[2].strip(): line for line in block.splitlines() if line.startswith("| ") and line[2].isdigit()}
    assert v4_table.MARK not in rows["greedy"]
    assert v4_table.MARK not in rows["table (perfect player)"]
    assert rows["net az-lc1-m2-s1, 100 simulations"].count(v4_table.MARK) == 2
    assert block.count(v4_table.NOTE) == 1


def test_commands_listed_by_row(fixture):
    main_dir, doc = fixture
    v4_table.main([str(main_dir), str(doc)])
    block = doc.read_text().split("<!-- v4-table:end -->")[0]
    assert "1. `./target/release/v4bench models/v3-solve table --out x.json`" in block


@pytest.mark.skipif(not (REPO / "docs/experiments/v4/table.json").exists(), reason="no committed bench JSON")
def test_real_files_are_idempotent_and_match_the_committed_doc(tmp_path):
    doc = tmp_path / "v4-evaluation.md"
    shutil.copy(REPO / "docs/experiments/v4-evaluation.md", doc)
    cmd = [sys.executable, str(TOOLS / "v4_table.py"), str(REPO / "docs/experiments/v4"), str(doc)]
    assert subprocess.run(cmd).returncode == 0
    first = doc.read_bytes()
    assert subprocess.run(cmd).returncode == 0
    assert doc.read_bytes() == first
    assert first == (REPO / "docs/experiments/v4-evaluation.md").read_bytes()


TAB_DOC = DOC + "\n<!-- v4-tabular:start -->\n<!-- v4-tabular:end -->\n"


def qtab_run(seed, opponent, score, won=0.5, drawn=0.3):
    run = make_run(f"qtab:models/v4-qtab-s{seed}/v.bin", won=won, drawn=drawn, score=score)
    run["opponent"] = opponent
    run["keep_visited"] = {"won": stat(0.7), "drawn": {"rate": 0.4, "ci95": [0.3, 0.5], "n": 12}}
    run["coverage"] = {"visited": 10, "visited_reachable": 10, "reachable": 1000,
                       "share_of_reachable": 0.01}
    return run


def write_named(directory: Path, name: str, run: dict):
    (directory / name).write_text(json.dumps(run))


def tabular_block(doc: Path) -> str:
    text = doc.read_text()
    return text.split("<!-- v4-tabular:start -->")[1].split("<!-- v4-tabular:end -->")[0]


def test_refuses_two_json_for_the_same_player_and_opponent(fixture):
    main_dir, doc = fixture
    write_named(main_dir, "greedy-again.json", make_run("greedy"))
    assert v4_table.main([str(main_dir), str(doc)]) == 2
    assert doc.read_text() == DOC


def test_same_player_against_two_opponents_is_accepted(fixture):
    main_dir, doc = fixture
    write_named(main_dir, "q1.json", qtab_run(1, "greedy", 0.6))
    write_named(main_dir, "q1-vs-random.json", qtab_run(1, "random", 0.9))
    assert v4_table.main([str(main_dir), str(doc)]) == 0


def test_refuses_a_run_against_random_of_another_player(fixture):
    main_dir, doc = fixture
    run = make_run("td:models/v4-td-lc1-s1/td.pfv")
    run["opponent"] = "random"
    write_named(main_dir, "td-vs-random.json", run)
    assert v4_table.main([str(main_dir), str(doc)]) == 2
    assert doc.read_text() == DOC


def test_nets_sorted_by_family_then_seed_then_sims(fixture):
    main_dir, doc = fixture
    for player in ("net:crates/cli/assets/az-lc1-s1.pfw:100", "net:models/v3/az-lc1-m2-s3/final.pfw:100",
                   "net:crates/cli/assets/az-lc1-s1.pfw:0", "net:models/az-lc1-s2.pfw:100"):
        write(main_dir, make_run(player))
    v4_table.main([str(main_dir), str(doc)])
    block = doc.read_text().split("<!-- v4-table:end -->")[0]
    rows = [line.split("|")[2].strip() for line in block.splitlines() if line.startswith("| ") and line[2].isdigit()]
    nets = [r for r in rows if r.startswith("net ")]
    assert nets == ["net az-lc1-s1, policy argmax, no search", "net az-lc1-s1, 100 simulations",
                    "net az-lc1-s2, 100 simulations",
                    "net az-lc1-m2-s1, 100 simulations", "net az-lc1-m2-s2, 100 simulations",
                    "net az-lc1-m2-s3, 100 simulations"]


def test_tabular_block_reports_criteria_per_seed(fixture):
    main_dir, doc = fixture
    doc.write_text(TAB_DOC)
    for seed in (1, 2, 3):
        # Seed 2 fails criterion 1 (lower bound 0.48); every seed fails criterion 3 on drawn.
        write_named(main_dir, f"q{seed}.json", qtab_run(seed, "greedy", 0.6, won=0.5, drawn=0.11))
        write_named(main_dir, f"q{seed}-vs-random.json",
                    qtab_run(seed, "random", 0.5 if seed == 2 else 0.9, won=0.5, drawn=0.11))
    assert v4_table.main([str(main_dir), str(doc)]) == 0
    block = tabular_block(doc)
    rows = {line.split("|")[1].strip(): [c.strip() for c in line.split("|")[2:-1]]
            for line in block.splitlines() if line.startswith("| ")}
    c1 = rows["1. Against random: lower 95 % bound > 0.5"]
    assert c1 == ["met (0.880)", "failed (0.480)", "met (0.880)", "failed"]
    c2 = rows["2. Against greedy: lower 95 % bound > 0.5"]
    assert c2 == ["met (0.580)"] * 3 + ["met"]
    c3 = rows["3. Keep: lower 95 % bound > 0.360 (won) and > 0.112 (drawn)"]
    assert c3[:3] == ["failed: won met (0.490), drawn failed (0.100)"] * 3 and c3[3] == "failed"
    seed_row = rows["tabular learner models/v4-qtab-s1/v.bin"]
    assert seed_row[0] == "0.900 [0.880, 0.920]" and seed_row[1] == "0.600 [0.580, 0.620]"
    assert seed_row[5] == "0.400 [0.300, 0.500] (n = 12)"
    assert seed_row[6] == "10 of 1,000 (1.00 %)"
    # The runs against random stay out of the main table.
    main_block = doc.read_text().split("<!-- v4-table:end -->")[0]
    assert main_block.count("tabular learner models/v4-qtab-s1/v.bin") == 1
    assert "0.900 [0.880, 0.920]" not in main_block


def test_tabular_criteria_need_three_seeds(fixture):
    main_dir, doc = fixture
    doc.write_text(TAB_DOC)
    write_named(main_dir, "q1.json", qtab_run(1, "greedy", 0.9))
    assert v4_table.main([str(main_dir), str(doc)]) == 0
    block = tabular_block(doc)
    assert "| 1. Against random: lower 95 % bound > 0.5 | not measured | not measured on all 3 seeds |" in block
    assert "| 2. Against greedy: lower 95 % bound > 0.5 | met (0.880) | not measured on all 3 seeds |" in block
