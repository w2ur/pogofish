use pogofish_engine::RuleSet;
use pogofish_engine::{testing::position, Color, Outcome};
use pogofish_train::encoding::ACTION_SIZE;
use pogofish_train::net::{make_var_store, AzNet};
use pogofish_train::selfplay::{play_game_from, play_one_game, GameEnd, SelfPlayConfig};

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
    let examples = play_one_game(&net, &rules, &fast_cfg()).examples;
    assert!(
        !examples.is_empty(),
        "self-play game should produce at least one example"
    );
}

#[test]
fn training_examples_have_correct_policy_len() {
    let (_vs, net) = make_net();
    let rules = RuleSet::LC1 { repetitions: 1 };
    let examples = play_one_game(&net, &rules, &fast_cfg()).examples;
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
    let examples = play_one_game(&net, &rules, &fast_cfg()).examples;
    for (i, ex) in examples.iter().enumerate() {
        assert!(
            ex.value.map_or(true, |v| (-1.0..=1.0).contains(&v)),
            "example {i} value {:?} out of range",
            ex.value
        );
    }
}

/// Plan task 2.1: a game the rules end is `Terminated` and every position
/// gets a value target. LC2 one move before its cap: whatever White plays,
/// the game ends with a White win after exactly one move.
#[test]
fn terminated_game_has_value_targets() {
    let (_vs, net) = make_net();
    let start = position(
        pogofish_engine::initial_state().cells().clone(),
        Color::White,
        9,
    );
    let rules = RuleSet::LC2 { cap: 10 };
    let game = play_game_from(&net, &start, &rules, &fast_cfg());
    assert_eq!(game.end, GameEnd::Terminated(Outcome::WinWhite));
    assert_eq!(game.examples.len(), 1);
    assert_eq!(game.examples[0].value, Some(1.0));
}

/// Plan task 2.1: a game stopped by the safety limit is `Truncated`; its
/// positions keep their policy targets and have no value target. No uncapped
/// game can end within two moves (White keeps at least 3 tops), so a limit
/// of 2 always truncates.
#[test]
fn truncated_game_keeps_policies_and_drops_values() {
    let (_vs, net) = make_net();
    let cfg = SelfPlayConfig {
        max_moves: 2,
        ..fast_cfg()
    };
    let game = play_one_game(&net, &RuleSet::Uncapped, &cfg);
    assert_eq!(game.end, GameEnd::Truncated);
    assert_eq!(game.examples.len(), 2);
    for ex in &game.examples {
        assert_eq!(ex.value, None);
        let total = f64::try_from(ex.policy.sum(tch::Kind::Float)).unwrap();
        assert!((total - 1.0).abs() < 1e-4, "policy target sums to {total}");
    }
}

/// Regression: the old loop never looked at the position after its last
/// allowed move, so a game won on exactly that move was scored as a
/// truncation (then a draw). With a limit of 1 move, the LC2 position above
/// must still end as a White win.
#[test]
fn a_win_on_the_last_allowed_move_is_not_a_truncation() {
    let (_vs, net) = make_net();
    let start = position(
        pogofish_engine::initial_state().cells().clone(),
        Color::White,
        9,
    );
    let cfg = SelfPlayConfig {
        max_moves: 1,
        ..fast_cfg()
    };
    let game = play_game_from(&net, &start, &RuleSet::LC2 { cap: 10 }, &cfg);
    assert_eq!(game.end, GameEnd::Terminated(Outcome::WinWhite));
}

#[test]
fn value_loss_ignores_positions_without_a_value_target() {
    use pogofish_train::training::masked_value_loss;
    use tch::Tensor;
    let pred = Tensor::from_slice(&[0.5f32, 0.9, -0.2]).unsqueeze(1);
    let target = Tensor::from_slice(&[1.0f32, 0.0, -1.0]).unsqueeze(1);
    let mask = Tensor::from_slice(&[1.0f32, 0.0, 1.0]).unsqueeze(1);
    let loss = f64::try_from(masked_value_loss(&pred, &target, &mask)).unwrap();
    // (0.5^2 + 0.8^2) / 2; the masked 0.9 vs 0.0 must not count.
    assert!((loss - (0.25 + 0.64) / 2.0).abs() < 1e-6, "{loss}");
    let none = Tensor::zeros([3, 1], tch::kind::FLOAT_CPU);
    assert_eq!(
        f64::try_from(masked_value_loss(&pred, &target, &none)).unwrap(),
        0.0
    );
}
