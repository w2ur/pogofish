use pogofish_engine::{initial_state, legal_moves, RuleSet};
use pogofish_search::mcts::{Mcts, MctsConfig};

#[test]
fn mcts_returns_legal_move() {
    let s = initial_state();
    let rules = RuleSet::LC2 { cap: 30 };
    let mut mcts = Mcts::new(MctsConfig {
        simulations: 50,
        c_puct: 1.4,
    });
    let mv = mcts.search(&s, &rules);
    let legal = legal_moves(&s);
    assert!(legal.contains(&mv), "MCTS returned an illegal move");
}

#[test]
fn mcts_respects_simulation_budget() {
    let s = initial_state();
    let rules = RuleSet::LC2 { cap: 30 };
    let mut mcts = Mcts::new(MctsConfig {
        simulations: 100,
        c_puct: 1.4,
    });
    let _ = mcts.search(&s, &rules);
    assert_eq!(mcts.stats().total_simulations, 100);
}

#[test]
fn mcts_finds_winning_move_in_simple_position() {
    // Near mate-in-one: MCTS should find the winning move with enough simulations.
    // From cell 0 there are two d=1 moves: cell 1 (captures → win) and cell 3 (empty).
    // With enough sims, MCTS should prefer the winning one.
    let s = pogofish_engine::testing::near_mate_in_one(pogofish_engine::Color::White);
    let rules = RuleSet::LC1 { repetitions: 1 };
    let mut mcts = Mcts::new(MctsConfig {
        simulations: 200,
        c_puct: 1.4,
    });
    let mv = mcts.search(&s, &rules);
    assert_eq!(mv.from_cell, 0);
    assert_eq!(mv.to_cell, 1, "MCTS should find the winning capture at cell 1");
}
