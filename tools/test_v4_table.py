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
