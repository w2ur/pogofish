//! Plan task 4.2: a run stopped by a real SIGINT mid-run resumes correctly —
//! same iteration counter, same buffer, continuous metrics — and ends
//! bit-identical to a run that was never interrupted.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const ITERATIONS: &str = "40";

fn args(dir: &Path) -> Vec<String> {
    let mut a = vec![dir.display().to_string()];
    for (k, v) in [
        ("--arch", "mlp_tiny"),
        ("--iterations", ITERATIONS),
        ("--games", "2"),
        ("--sims", "8"),
        ("--max-moves", "60"),
        ("--buffer", "400"),
        ("--train-steps", "3"),
        ("--batch", "16"),
        ("--eval-every", "0"),
        ("--checkpoint-every", "10"),
    ] {
        a.push(k.into());
        a.push(v.into());
    }
    a
}

fn iteration(dir: &Path) -> u32 {
    std::fs::read_to_string(dir.join("state.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["iteration"].as_u64())
        .unwrap_or(0) as u32
}

fn tensors(path: &Path) -> Vec<(String, tch::Tensor)> {
    let mut v = tch::Tensor::load_multi(path).unwrap();
    v.sort_by(|a, b| a.0.cmp(&b.0));
    v
}

#[test]
fn sigint_mid_run_then_resume_matches_an_uninterrupted_run() {
    let exe = env!("CARGO_BIN_EXE_train");
    let base: PathBuf =
        std::env::temp_dir().join(format!("pogofish-sigint-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let (reference, run) = (base.join("reference"), base.join("run"));

    assert!(Command::new(exe)
        .args(args(&reference))
        .output()
        .unwrap()
        .status
        .success());

    let mut child = Command::new(exe).args(args(&run)).spawn().unwrap();
    let start = Instant::now();
    while iteration(&run) < 3 {
        assert!(
            start.elapsed() < Duration::from_secs(120),
            "run made no progress"
        );
        std::thread::sleep(Duration::from_millis(5));
    }
    unsafe { libc::kill(child.id() as libc::pid_t, libc::SIGINT) };
    let status = child.wait().unwrap();
    assert!(status.success(), "graceful exit on SIGINT, got {status}");
    let stopped_at = iteration(&run);
    let total: u32 = ITERATIONS.parse().unwrap();
    assert!(
        (3..total).contains(&stopped_at),
        "stopped at {stopped_at}: interrupt came too late to test"
    );

    assert!(Command::new(exe)
        .args(args(&run))
        .output()
        .unwrap()
        .status
        .success());
    assert_eq!(iteration(&run), total);

    let metrics = std::fs::read_to_string(run.join("metrics.jsonl")).unwrap();
    let iters: Vec<u64> = metrics
        .lines()
        .map(|l| {
            serde_json::from_str::<serde_json::Value>(l).unwrap()["iteration"]
                .as_u64()
                .unwrap()
        })
        .collect();
    assert_eq!(
        iters,
        (1..=total as u64).collect::<Vec<_>>(),
        "no iteration lost or repeated"
    );
    for f in ["weights.pt", "momentum.pt", "buffer.pt"] {
        for ((n, a), (_, b)) in tensors(&reference.join(f))
            .iter()
            .zip(tensors(&run.join(f)).iter())
        {
            assert!(a.equal(b), "{f}: {n} differs from the uninterrupted run");
        }
    }
    let _ = std::fs::remove_dir_all(base);
}
