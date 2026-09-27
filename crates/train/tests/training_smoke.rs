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

/// Regression (round-1 defect 3): training under a rule the network input
/// cannot represent is refused before anything is written: lc2/lc3 always
/// (they read the move count), lc1 unless the input has the repetition count.
#[test]
fn training_refuses_features_that_miss_what_the_rule_reads() {
    use pogofish_train::encoding::Features;
    let d = tmp("refuse");
    for (rules, features) in [
        ("lc1-2", Features::MoverRelative),
        ("lc1-2", Features::Absolute),
        ("lc2-30", Features::MoverRelativeRepetition),
        ("lc3-29", Features::MoverRelativeRepetition),
    ] {
        let cfg = TrainConfig {
            rules: rules.into(),
            features,
            ..tiny(1)
        };
        let err = train(&cfg, &d).expect_err("must refuse");
        assert!(format!("{err}").contains("lacks what the rule"), "{err}");
    }
    assert!(!d.exists(), "nothing may be written");
    // The ablation override is explicit and recorded in the run's config.
    let ablation = TrainConfig {
        rules: "lc1-2".into(),
        features: Features::MoverRelative,
        allow_missing_features: true,
        truncation_stop_iterations: 0,
        ..tiny(1)
    };
    assert_eq!(train(&ablation, &d).unwrap(), TrainStop::Finished);
    assert!(std::fs::read_to_string(d.join("config.json"))
        .unwrap()
        .contains("\"allow_missing_features\": true"));
    let _ = std::fs::remove_dir_all(&d);
}

/// The chosen ruleset (lc1-2) trains with the repetition feature, and the
/// replay buffer keeps each position's repetition count across a resume.
#[test]
fn lc1_trains_and_resumes_with_the_repetition_feature() {
    use pogofish_train::encoding::Features;
    let cfg = |n| TrainConfig {
        rules: "lc1-2".into(),
        features: Features::MoverRelativeRepetition,
        truncation_stop_iterations: 0,
        ..tiny(n)
    };
    let (one, two) = (tmp("lc1-one"), tmp("lc1-two"));
    assert_eq!(train(&cfg(3), &one).unwrap(), TrainStop::Finished);
    train(&cfg(1), &two).unwrap();
    train(&cfg(3), &two).unwrap();
    for f in ["weights.pt", "buffer.pt"] {
        for ((n, a), (_, b)) in tensors(&one.join(f))
            .iter()
            .zip(tensors(&two.join(f)).iter())
        {
            assert!(a.equal(b), "{f}: {n} differs");
        }
    }
    let names: Vec<String> = tensors(&one.join("buffer.pt"))
        .into_iter()
        .map(|(n, _)| n)
        .collect();
    assert!(names.contains(&"seen_before".to_string()), "{names:?}");
    let _ = std::fs::remove_dir_all(one);
    let _ = std::fs::remove_dir_all(two);
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

/// The ruleset switch rule stops training by itself: with a 2-ply limit every
/// game truncates, so the run stops after 3 iterations of 10, and a resumed
/// run stops again at once instead of carrying on.
#[test]
fn the_truncation_rule_stops_training() {
    let d = tmp("truncation");
    let cfg = TrainConfig {
        max_moves: 2,
        iterations: 10,
        ..tiny(10)
    };
    assert_eq!(train(&cfg, &d).unwrap(), TrainStop::TruncationRule);
    let state = std::fs::read_to_string(d.join("state.json")).unwrap();
    assert!(state.contains("\"iteration\": 3"), "{state}");
    assert_eq!(train(&cfg, &d).unwrap(), TrainStop::TruncationRule);
    assert!(std::fs::read_to_string(d.join("state.json"))
        .unwrap()
        .contains("\"iteration\": 3"));
    let _ = std::fs::remove_dir_all(d);
}

/// The arena loads checkpoints with the features and architecture their
/// run was trained with, read from the run's config.json.
#[test]
fn arena_players_load_with_their_runs_features() {
    use pogofish_engine::{initial_state, legal_moves, RuleSet};
    use pogofish_search::rng::SplitMix64;
    use pogofish_train::encoding::Features;
    let d = tmp("agent-cfg");
    let cfg = TrainConfig {
        rules: "lc1-2".into(),
        features: Features::MoverRelativeRepetition,
        truncation_stop_iterations: 0,
        ..tiny(1)
    };
    train(&cfg, &d).unwrap();
    for path in [d.join("weights.pt"), d.join("checkpoints/iter_00001.pt")] {
        let spec = format!("net:{}:4", path.display());
        let mut agent = pogofish_train::agents::agent_from_spec(&spec).unwrap();
        let s = initial_state();
        let m = agent.choose(
            &s,
            &RuleSet::LC1 { repetitions: 2 },
            &mut SplitMix64::new(0),
        );
        assert!(legal_moves(&s).contains(&m));
    }
    let _ = std::fs::remove_dir_all(d);
}
