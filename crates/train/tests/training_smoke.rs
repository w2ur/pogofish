use pogofish_train::training::{train, TrainConfig, TrainStop};
use std::path::{Path, PathBuf};

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("pogofish-az-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    d
}

pub fn tiny(iterations: u32) -> TrainConfig {
    TrainConfig {
        arch: "mlp_tiny".into(),
        iterations,
        games_per_iteration: 2,
        num_simulations: 8,
        max_moves: 60,
        buffer_positions: 500,
        train_steps: 3,
        batch_size: 16,
        checkpoint_every: 1,
        eval_every: 0,
        ..TrainConfig::default()
    }
}

#[test]
fn smoke_train_writes_its_files() {
    let d = tmp("smoke");
    assert_eq!(train(&tiny(2), &d).unwrap(), TrainStop::Finished);
    for f in [
        "weights.pt",
        "momentum.pt",
        "buffer.pt",
        "state.json",
        "config.json",
        "metrics.jsonl",
    ] {
        assert!(d.join(f).exists(), "{f}");
    }
    assert!(d.join("checkpoints/iter_00001.pt").exists());
    assert!(
        d.join("checkpoints/iter_00002.pt").exists(),
        "every checkpoint is kept"
    );
    let _ = std::fs::remove_dir_all(d);
}

/// Regression (round-1 defect 3): training under a rule the board encoding
/// cannot represent is refused before anything is written.
#[test]
fn training_refuses_a_non_markov_ruleset() {
    let d = tmp("refuse");
    for rules in ["lc1-1", "lc2-30", "lc3-29"] {
        let err = train(
            &TrainConfig {
                rules: rules.into(),
                ..tiny(1)
            },
            &d,
        )
        .expect_err("must refuse");
        assert!(format!("{err}").contains("not a Markov state"), "{err}");
    }
    assert!(!d.exists(), "nothing may be written");
}

#[test]
fn the_default_safety_limit_is_the_decided_one() {
    // docs/experiments/v2-ruleset.md: 1,000 plies.
    assert_eq!(TrainConfig::default().max_moves, 1000);
    assert_eq!(
        pogofish_train::selfplay::SelfPlayConfig::default().max_moves,
        1000
    );
}

fn tensors(path: &Path) -> Vec<(String, tch::Tensor)> {
    let mut v = tch::Tensor::load_multi(path).unwrap();
    v.sort_by(|a, b| a.0.cmp(&b.0));
    v
}

/// A run extended in two parts ends bit-identical to a single run: weights,
/// momentum buffers, replay buffer and counters.
#[test]
fn a_run_extended_in_two_parts_equals_one_run() {
    let (one, two) = (tmp("one"), tmp("two"));
    train(&tiny(3), &one).unwrap();
    train(&tiny(1), &two).unwrap();
    train(&tiny(3), &two).unwrap();
    for f in ["weights.pt", "momentum.pt", "buffer.pt"] {
        for ((n, a), (_, b)) in tensors(&one.join(f))
            .iter()
            .zip(tensors(&two.join(f)).iter())
        {
            assert!(a.equal(b), "{f}: {n} differs");
        }
    }
    let read = |d: &Path, f: &str| std::fs::read_to_string(d.join(f)).unwrap();
    assert_eq!(read(&one, "state.json"), read(&two, "state.json"));
    let _ = std::fs::remove_dir_all(one);
    let _ = std::fs::remove_dir_all(two);
}
