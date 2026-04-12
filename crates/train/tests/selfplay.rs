use pogofish_engine::RuleSet;
use pogofish_train::encoding::ACTION_SIZE;
use pogofish_train::net::{make_var_store, AzNet};
use pogofish_train::selfplay::{play_one_game, SelfPlayConfig};

fn make_net() -> (tch::nn::VarStore, AzNet) {
    let vs = make_var_store();
    let net = AzNet::new(&vs.root(), &[64, 32], 32, 32);
    (vs, net)
}

fn fast_cfg() -> SelfPlayConfig {
    SelfPlayConfig {
        num_simulations: 10,
        c_puct: 1.5,
        max_moves: 20,
        dirichlet_alpha: 0.3,
        dirichlet_epsilon: 0.25,
    }
}

#[test]
fn play_one_game_nonempty() {
    let (_vs, net) = make_net();
    let rules = RuleSet::LC1 { repetitions: 1 };
    let examples = play_one_game(&net, &rules, &fast_cfg());
    assert!(!examples.is_empty(), "self-play game should produce at least one example");
}

#[test]
fn training_examples_have_correct_policy_len() {
    let (_vs, net) = make_net();
    let rules = RuleSet::LC1 { repetitions: 1 };
    let examples = play_one_game(&net, &rules, &fast_cfg());
    for (i, ex) in examples.iter().enumerate() {
        assert_eq!(
            ex.policy.size(),
            vec![ACTION_SIZE as i64],
            "example {i} has wrong policy shape"
        );
    }
}

#[test]
fn training_examples_value_bounded() {
    let (_vs, net) = make_net();
    let rules = RuleSet::LC3 { cap: 30 };
    let examples = play_one_game(&net, &rules, &fast_cfg());
    for (i, ex) in examples.iter().enumerate() {
        assert!(
            ex.value >= -1.0 && ex.value <= 1.0,
            "example {i} value {} out of range",
            ex.value
        );
    }
}
