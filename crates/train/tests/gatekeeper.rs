use pogofish_engine::RuleSet;
use pogofish_train::gatekeeper::gatekeeper;
use pogofish_train::net::{make_var_store, ArchConfig, AzNet};
use pogofish_train::training::TrainConfig;

/// Review finding: gate games stopped by the safety limit counted as draws
/// (half a point each), so a challenger could be adopted on unfinished games.
/// With a 2-ply limit no uncapped game can finish: all are unfinished and
/// the score is 0, not 0.5.
#[test]
fn unfinished_gate_games_are_not_draws() {
    let (vs_a, vs_b) = (make_var_store(), make_var_store());
    let a = AzNet::from_config(&vs_a.root(), &ArchConfig::mlp_tiny());
    let b = AzNet::from_config(&vs_b.root(), &ArchConfig::mlp_tiny());
    let r = gatekeeper(&a, &b, &RuleSet::Uncapped, 4, 5, 1.5, 2, 0.0);
    assert_eq!(r.unfinished, 4);
    assert_eq!((r.wins, r.draws, r.losses), (0, 0, 0));
    assert_eq!(r.win_rate, 0.0);
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
