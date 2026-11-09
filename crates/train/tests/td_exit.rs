//! `td_train`'s exit status tells a finished run from an interrupted one, so
//! a script that chains export and bench stops instead of using a partial net.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

fn args(dir: &Path, iterations: &str) -> Vec<String> {
    let mut a = vec![dir.display().to_string()];
    for (k, v) in [
        ("--hidden", "16"),
        ("--iterations", iterations),
        ("--games", "4"),
        ("--eval-every", "0"),
        ("--max-plies", "300"),
    ] {
        a.push(k.into());
        a.push(v.into());
    }
    a
}

fn iteration(dir: &Path) -> u64 {
    std::fs::read_to_string(dir.join("state.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["iteration"].as_u64())
        .unwrap_or(0)
}

// Regression: <fix commit> — td_train exited 0 when interrupted, so
// scripts/v4-eval.sh exported and benched a partial net.
#[test]
fn an_interrupted_run_exits_130_and_a_finished_one_exits_0() {
    let exe = env!("CARGO_BIN_EXE_td_train");
    let base: PathBuf =
        std::env::temp_dir().join(format!("pogofish-td-exit-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let (short, long) = (base.join("short"), base.join("long"));

    let done = Command::new(exe).args(args(&short, "2")).output().unwrap();
    assert_eq!(done.status.code(), Some(0), "{done:?}");

    let mut child = Command::new(exe)
        .args(args(&long, "100000"))
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let start = Instant::now();
    while iteration(&long) < 1 {
        assert!(start.elapsed() < Duration::from_secs(120), "run made no progress");
        std::thread::sleep(Duration::from_millis(5));
    }
    unsafe { libc::kill(child.id() as libc::pid_t, libc::SIGINT) };
    let status = child.wait().unwrap();
    assert_eq!(status.code(), Some(130), "{status}");
    assert!(iteration(&long) < 100000);
    let _ = std::fs::remove_dir_all(base);
}
