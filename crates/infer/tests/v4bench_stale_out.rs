//! A failed `v4bench` run leaves no JSON at `--out`, even one an earlier run
//! wrote there: a stale file would read as this run's result.

use std::process::Command;

// Regression: 837d0a1 — a JSON left at --out by an earlier run survived a run
// that then failed.
#[test]
fn a_failing_run_deletes_a_json_left_at_out() {
    let dir = std::env::temp_dir().join(format!("v4bench-stale-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("greedy.json");
    std::fs::write(&out, "{\"from\": \"an earlier run\"}\n").unwrap();
    // No table.bin in the table directory: the run fails after parsing its arguments.
    let status = Command::new(env!("CARGO_BIN_EXE_v4bench"))
        .arg(dir.join("no-table"))
        .arg("greedy")
        .arg("--out")
        .arg(&out)
        .output()
        .unwrap();
    assert_eq!(status.status.code(), Some(2), "{status:?}");
    assert!(!out.exists(), "the stale JSON survived a failed run");
    std::fs::remove_dir_all(&dir).unwrap();
}
