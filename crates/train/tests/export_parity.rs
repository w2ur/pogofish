//! Plan task 6.1: the pure-Rust net must match the libtorch net on 100
//! positions within 1e-5 (policy logits and value).

use pogofish_engine::{
    apply_move_under, initial_state, is_terminal, legal_moves, GameState, RuleSet,
};
use pogofish_infer::mcts::{search, MctsConfig};
use pogofish_search::rng::SplitMix64;
use pogofish_train::encoding::Features;
use pogofish_train::export::to_mlp;
use pogofish_train::net::{ArchConfig, AzNet};

fn positions(n: usize) -> Vec<GameState> {
    let rules = RuleSet::LC1 { repetitions: 2 };
    let mut rng = SplitMix64::new(17);
    let mut out = Vec::new();
    while out.len() < n {
        let mut s = initial_state();
        for _ in 0..40 {
            if is_terminal(&s, &rules).is_some() || out.len() == n {
                break;
            }
            out.push(s.clone());
            let moves = legal_moves(&s);
            s = apply_move_under(&s, moves[rng.below(moves.len())], &rules).unwrap();
        }
    }
    out
}

#[test]
fn pure_rust_matches_libtorch_on_100_positions() {
    for features in [Features::MoverRelativeRepetition, Features::Absolute] {
        let vs = tch::nn::VarStore::new(tch::Device::Cpu);
        let net = AzNet::from_config_with(&vs.root(), &ArchConfig::mlp_small(), features);
        pogofish_train::td::seeded_init(&vs, 5);
        let mlp = to_mlp(&vs, &net).unwrap();
        let worst = pogofish_train::export::max_difference(&net, &mlp, 100);
        assert!(worst < 1e-5, "{features:?}: largest difference {worst}");
    }
}

/// Beyond the plan's check: with the same net, the pure-Rust search picks
/// the same moves as the libtorch one on these positions.
#[test]
fn pure_rust_search_agrees_with_libtorch_search() {
    let vs = tch::nn::VarStore::new(tch::Device::Cpu);
    let net = AzNet::from_config_with(
        &vs.root(),
        &ArchConfig::mlp_small(),
        Features::MoverRelativeRepetition,
    );
    pogofish_train::td::seeded_init(&vs, 9);
    let mlp = to_mlp(&vs, &net).unwrap();
    let cfg = MctsConfig {
        num_simulations: 50,
        ..MctsConfig::default()
    };
    let rules = RuleSet::LC1 { repetitions: 2 };
    let mut agree = 0;
    let all = positions(40);
    for s in &all {
        let a = search(&net, s, &rules, &cfg, None).best_move();
        let b = search(&mlp, s, &rules, &cfg, None).best_move();
        agree += (a == b) as usize;
    }
    assert_eq!(
        agree,
        all.len(),
        "moves differ on {} of {} positions",
        all.len() - agree,
        all.len()
    );
}
