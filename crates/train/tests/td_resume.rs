//! A TD run that is resumed must continue exactly where it stopped.

use pogofish_train::td::{train_td, TdConfig, TdStop};
use std::path::{Path, PathBuf};

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("pogofish-td-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    d
}

pub fn small(iterations: u32) -> TdConfig {
    TdConfig {
        hidden: vec![16],
        iterations,
        games_per_iteration: 4,
        eval_every: 0,
        checkpoint_every: 2,
        max_plies: 300,
        ..TdConfig::default()
    }
}

fn weights(dir: &Path) -> Vec<(String, tch::Tensor)> {
    let mut v = tch::Tensor::load_multi(dir.join("weights.pt")).unwrap();
    v.sort_by(|a, b| a.0.cmp(&b.0));
    v
}

#[test]
fn a_run_extended_in_two_parts_equals_one_run() {
    let (one, two) = (tmp("one"), tmp("two"));
    assert_eq!(train_td(&small(4), &one).unwrap(), TdStop::Finished);
    assert_eq!(train_td(&small(2), &two).unwrap(), TdStop::Finished);
    assert_eq!(train_td(&small(4), &two).unwrap(), TdStop::Finished);

    for ((na, a), (nb, b)) in weights(&one).iter().zip(weights(&two).iter()) {
        assert_eq!(na, nb);
        assert!(a.equal(b), "{na} differs after resuming");
    }
    let read = |d: &Path, f: &str| std::fs::read_to_string(d.join(f)).unwrap();
    assert_eq!(read(&one, "state.json"), read(&two, "state.json"));
    assert_eq!(read(&two, "metrics.jsonl").lines().count(), 4);
    assert!(two.join("checkpoints/iter_00002.pt").exists());
    assert!(two.join("checkpoints/iter_00004.pt").exists());
    let _ = std::fs::remove_dir_all(one);
    let _ = std::fs::remove_dir_all(two);
}

#[test]
fn a_different_configuration_is_refused() {
    let d = tmp("cfg");
    train_td(&small(1), &d).unwrap();
    let other = TdConfig {
        lambda: 0.3,
        ..small(2)
    };
    assert!(train_td(&other, &d).is_err());
    let _ = std::fs::remove_dir_all(d);
}

#[test]
fn a_non_markov_ruleset_is_refused() {
    let d = tmp("lc2");
    let cfg = TdConfig {
        rules: "lc2-30".into(),
        ..small(1)
    };
    assert!(train_td(&cfg, &d).is_err());
    let _ = std::fs::remove_dir_all(d);
}
