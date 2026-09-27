use pogofish_engine::{initial_state, Color};

#[test]
fn initial_state_has_six_pieces_per_color() {
    let s = initial_state();
    let white: usize = s.cells().iter()
        .flat_map(|c| c.iter())
        .filter(|&&p| p == Color::White)
        .count();
    let red: usize = s.cells().iter()
        .flat_map(|c| c.iter())
        .filter(|&&p| p == Color::Red)
        .count();
    assert_eq!(white, 6);
    assert_eq!(red, 6);
}

#[test]
fn initial_state_row0_is_white_row2_is_red() {
    let s = initial_state();
    for i in 0..3 {
        assert_eq!(s.cell_owner(i), Some(Color::White), "cell {} should be white-topped", i);
        assert_eq!(s.cells()[i].len(), 2, "cell {} should have 2 pieces", i);
    }
    for i in 3..6 {
        assert!(s.cells()[i].is_empty(), "cell {} should be empty", i);
    }
    for i in 6..9 {
        assert_eq!(s.cell_owner(i), Some(Color::Red), "cell {} should be red-topped", i);
        assert_eq!(s.cells()[i].len(), 2, "cell {} should have 2 pieces", i);
    }
}

#[test]
fn initial_state_to_move_is_white() {
    assert_eq!(initial_state().to_move(), Color::White);
}

#[test]
fn initial_state_move_count_is_zero() {
    assert_eq!(initial_state().move_count(), 0);
}

#[test]
fn initial_state_history_is_empty() {
    assert_eq!(initial_state().history_len(), 0);
}

#[test]
fn forget_history_keeps_the_position() {
    use pogofish_engine::{apply_move, legal_moves};
    let s0 = pogofish_engine::initial_state();
    let mut s1 = apply_move(&s0, legal_moves(&s0)[0]).unwrap();
    assert_eq!(s1.history_len(), 1);
    let before = (s1.cells().clone(), s1.to_move(), s1.move_count(), s1.key());
    s1.forget_history();
    assert_eq!(s1.history_len(), 0);
    assert_eq!((s1.cells().clone(), s1.to_move(), s1.move_count(), s1.key()), before);
}

#[test]
fn apply_move_under_keeps_history_only_where_the_rule_reads_it() {
    use pogofish_engine::{apply_move_under, legal_moves, RuleSet};
    let s0 = pogofish_engine::initial_state();
    let m = legal_moves(&s0)[0];
    for rules in [RuleSet::Uncapped, RuleSet::LC2 { cap: 30 }, RuleSet::LC3 { cap: 30 }] {
        let mut s = s0.clone();
        for _ in 0..3 {
            let mv = legal_moves(&s)[0];
            s = apply_move_under(&s, mv, &rules).unwrap();
        }
        assert_eq!(s.history_len(), 0, "{rules}");
        assert_eq!(s.move_count(), 3, "{rules}");
    }
    let lc1 = RuleSet::LC1 { repetitions: 1 };
    let s1 = apply_move_under(&s0, m, &lc1).unwrap();
    assert_eq!(s1.history_len(), 1);
    assert_eq!(s1.key(), pogofish_engine::apply_move(&s0, m).unwrap().key());
}
