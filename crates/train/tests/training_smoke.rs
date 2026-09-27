use pogofish_engine::RuleSet;
use pogofish_train::net::ArchConfig;
use pogofish_train::training::{train, TrainConfig};

#[test]
fn smoke_train_completes_without_panic() {
    let output_dir = std::env::temp_dir().join(format!(
        "pogofish_smoke_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .subsec_nanos()
    ));

    let rules = RuleSet::Uncapped;
    let cfg = smoke_config(output_dir.clone());

    train(&rules, &cfg).expect("smoke training should complete without error");

    // Verify output files were created
    assert!(
        output_dir.join("model_best.pt").exists(),
        "model_best.pt should be created"
    );
    assert!(
        output_dir.join("metrics.jsonl").exists(),
        "metrics.jsonl should be created"
    );

    // Cleanup
    let _ = std::fs::remove_dir_all(&output_dir);
}

/// Regression (round-1 defect 3): training under a rule the board encoding
/// cannot represent is refused before anything is written.
#[test]
fn training_refuses_a_non_markov_ruleset() {
    let output_dir = std::env::temp_dir().join(format!("pogofish_refuse_{}", std::process::id()));
    for rules in [
        RuleSet::LC1 { repetitions: 1 },
        RuleSet::LC2 { cap: 30 },
        RuleSet::LC3 { cap: 29 },
    ] {
        let err = train(&rules, &smoke_config(output_dir.clone())).expect_err("must refuse");
        assert!(format!("{err}").contains("not a Markov state"), "{err}");
    }
    assert!(!output_dir.exists(), "nothing may be written");
}

fn smoke_config(output_dir: std::path::PathBuf) -> TrainConfig {
    TrainConfig {
        iterations: 1,
        games_per_iteration: 2,
        num_simulations: 10,
        arch: ArchConfig::mlp_tiny(),
        c_puct: 1.5,
        lr: 1e-3,
        lr_end: 1e-4,
        weight_decay: 1e-4,
        batch_size: 8,
        training_epochs: 1,
        window_capacity: 10,
        dirichlet_alpha: 0.3,
        dirichlet_epsilon: 0.25,
        gatekeeper_games: 2,
        gatekeeper_threshold: 0.55,
        max_moves: 20,
        output_dir,
    }
}
