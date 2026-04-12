use pogofish_engine::{initial_state, Color, RuleSet};
use pogofish_search::minimax::{solve, SolveConfig};

#[test]
fn terminal_state_solves_instantly() {
    let s = pogofish_engine::testing::state_with_no_red_piles();
    let rules = RuleSet::LC1 { repetitions: 1 };
    let result = solve(&s, &rules, SolveConfig::default());
    // White wins; it's red's turn → from red's perspective, value is -1 (loss).
    assert_eq!(result.value, -1);
}

#[test]
fn mate_in_one_is_found() {
    let s = pogofish_engine::testing::near_mate_in_one(Color::White);
    let rules = RuleSet::LC1 { repetitions: 1 };
    let result = solve(&s, &rules, SolveConfig { max_depth: 2, ..Default::default() });
    assert_eq!(result.value, 1);
    assert!(result.best_move.is_some());
}

#[test]
fn solve_respects_max_depth() {
    let s = initial_state();
    let rules = RuleSet::LC2 { cap: 30 };
    let result = solve(&s, &rules, SolveConfig { max_depth: 2, ..Default::default() });
    assert!(result.nodes_explored < 100_000);
}

#[test]
fn depth_aware_tt_does_not_reuse_shallow_entries() {
    // Solve at depth 1, then at depth 4. The deeper solve should explore
    // more nodes (not just return the shallow result from the TT).
    let s = initial_state();
    let rules = RuleSet::LC2 { cap: 30 };
    let shallow = solve(&s, &rules, SolveConfig { max_depth: 1, use_tt: true });
    let deep = solve(&s, &rules, SolveConfig { max_depth: 4, use_tt: true });
    assert!(deep.nodes_explored > shallow.nodes_explored);
}
