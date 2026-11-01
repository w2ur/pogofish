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

#[test]
fn uncapped_ends_only_on_the_base_rule() {
    let rules = RuleSet::Uncapped;
    // Far past every cap, with the start position repeated many times.
    let s = pogofish_engine::testing::state_at_move_count(5000, pogofish_engine::Color::White);
    let s = pogofish_engine::testing::state_with_repeated_key(&s, s.key(), 10);
    assert_eq!(is_terminal(&s, &rules), None);
    let won = pogofish_engine::testing::state_with_no_red_piles();
    assert_eq!(is_terminal(&won, &rules), Some(Outcome::WinWhite));
}

#[test]
fn rulesets_parse_and_print() {
    for text in ["uncapped", "lc1-2", "lc2-30", "lc3-29"] {
        let r: RuleSet = text.parse().unwrap();
        assert_eq!(r.to_string(), text);
    }
    assert_eq!("lc1-3".parse::<RuleSet>(), Ok(RuleSet::LC1 { repetitions: 3 }));
    for bad in ["", "lc4-3", "lc2-", "lc2-x", "uncapped-1", "lc1-300"] {
        assert!(bad.parse::<RuleSet>().is_err(), "{bad}");
    }
}

/// LC1Draw: same trigger as LC1 (the position occurred `repetitions` times
/// before), but the game is drawn instead of lost by the player who moved.
#[test]
fn lc1_draw_third_occurrence_is_a_draw() {
    let rules = RuleSet::LC1Draw { repetitions: 2 };
    let s0 = initial_state();
    let key = s0.key();
    let second = pogofish_engine::testing::state_with_repeated_key(&s0, key.clone(), 1);
    assert_eq!(is_terminal(&second, &rules), None, "second occurrence: play on");
    let third = pogofish_engine::testing::state_with_repeated_key(&s0, key, 2);
    assert_eq!(is_terminal(&third, &rules), Some(Outcome::DrawEarned));
    // The same state under lc1-2 is a loss for Red, who just moved.
    assert_eq!(
        is_terminal(&third, &RuleSet::LC1 { repetitions: 2 }),
        Some(Outcome::WinWhite)
    );
}

/// A base win is checked before the repetition draw.
#[test]
fn lc1_draw_base_win_comes_first() {
    let rules = RuleSet::LC1Draw { repetitions: 2 };
    let won = pogofish_engine::testing::state_with_no_red_piles();
    let repeated = pogofish_engine::testing::state_with_repeated_key(&won, won.key(), 5);
    assert_eq!(is_terminal(&repeated, &rules), Some(Outcome::WinWhite));
}

#[test]
fn lc1_draw_parses_and_prints() {
    for text in ["lc1d-2", "lc1d-1", "lc1d-3"] {
        let r: RuleSet = text.parse().unwrap();
        assert_eq!(r.to_string(), text);
    }
    assert_eq!("lc1d-2".parse::<RuleSet>(), Ok(RuleSet::LC1Draw { repetitions: 2 }));
    assert_ne!("lc1d-2".parse::<RuleSet>(), "lc1-2".parse::<RuleSet>());
    for bad in ["lc1d", "lc1d-", "lc1d-x", "lc1d-300", "lc1x-2"] {
        assert!(bad.parse::<RuleSet>().is_err(), "{bad}");
    }
}
