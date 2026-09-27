use pogofish_engine::{is_terminal, initial_state, Outcome, RuleSet};

#[test]
fn base_terminal_all_white_tops() {
    let s = pogofish_engine::testing::state_with_no_red_piles();
    // All non-empty cells topped by white → white wins, regardless of rule variant
    let rules = RuleSet::LC1 { repetitions: 1 };
    assert_eq!(is_terminal(&s, &rules), Some(Outcome::WinWhite));
}

#[test]
fn initial_state_is_not_terminal() {
    let s = initial_state();
    let rules = RuleSet::LC1 { repetitions: 1 };
    assert_eq!(is_terminal(&s, &rules), None);
}

#[test]
fn lc1_first_repetition_loses() {
    let rules = RuleSet::LC1 { repetitions: 1 };
    let s0 = initial_state();
    let key = s0.key();
    // Simulate: the key appears once in history → repetition detected
    let s_cycled = pogofish_engine::testing::state_with_repeated_key(&s0, key, 1);
    // to_move is White. The player who caused this repeated position is the
    // one who just moved = opponent of to_move = Red. Red caused the repetition,
    // so Red loses → WinWhite.
    assert_eq!(is_terminal(&s_cycled, &rules), Some(Outcome::WinWhite));
}

#[test]
fn lc2_hard_cap_player_to_move_loses_if_not_winning() {
    let rules = RuleSet::LC2 { cap: 30 };
    let s = pogofish_engine::testing::state_at_move_count(30, pogofish_engine::Color::White);
    // White is to move at move 30; not all towers are white → white loses
    assert_eq!(is_terminal(&s, &rules), Some(Outcome::WinRed));
}

/// At the cap a base win still takes precedence (it is checked first).
#[test]
fn lc2_hard_cap_player_with_all_towers_wins() {
    let rules = RuleSet::LC2 { cap: 30 };
    let s = pogofish_engine::testing::state_at_move_count_with_all_towers(30, pogofish_engine::Color::White);
    assert_eq!(is_terminal(&s, &rules), Some(Outcome::WinWhite));
}

#[test]
fn lc3_soft_cap_player_with_more_towers_wins() {
    let rules = RuleSet::LC3 { cap: 30 };
    let s = pogofish_engine::testing::state_at_move_count_with_tower_lead(30, pogofish_engine::Color::Red);
    assert_eq!(is_terminal(&s, &rules), Some(Outcome::WinRed));
}

#[test]
fn lc3_soft_cap_tie_is_earned_draw() {
    let rules = RuleSet::LC3 { cap: 30 };
    let s = pogofish_engine::testing::state_at_move_count_with_equal_towers(30);
    assert_eq!(is_terminal(&s, &rules), Some(Outcome::DrawEarned));
}

#[test]
fn lc2_before_cap_not_terminal() {
    let rules = RuleSet::LC2 { cap: 30 };
    let s = pogofish_engine::testing::state_at_move_count(29, pogofish_engine::Color::White);
    assert_eq!(is_terminal(&s, &rules), None);
}

/// Regression (plan task 0.3): LC2 used to document "the player to move at
/// the cap wins iff they control all towers", with a branch for it that could
/// never run. The rule as played: the mover at the cap loses, even when they
/// own every stack but one.
#[test]
fn lc2_hard_cap_mover_loses_even_with_a_tower_lead() {
    let rules = RuleSet::LC2 { cap: 30 };
    let s = pogofish_engine::testing::state_at_move_count_with_tower_lead(30, pogofish_engine::Color::Red);
    assert_eq!(s.to_move(), pogofish_engine::Color::Red);
    assert_eq!(is_terminal(&s, &rules), Some(Outcome::WinWhite));
}
