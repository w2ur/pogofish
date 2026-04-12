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
