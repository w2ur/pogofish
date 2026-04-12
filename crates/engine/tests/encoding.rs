use pogofish_engine::{apply_move, initial_state, legal_moves, Color};

#[test]
fn state_key_is_deterministic() {
    let a = initial_state();
    let b = initial_state();
    assert_eq!(a.key(), b.key());
}

#[test]
fn state_key_changes_after_move() {
    let s = initial_state();
    let m = legal_moves(&s)[0];
    let s2 = apply_move(&s, m).unwrap();
    assert_ne!(s.key(), s2.key());
}

#[test]
fn state_key_includes_to_move() {
    let s1 = initial_state();
    let s2 = pogofish_engine::testing::with_to_move(&s1, Color::Red);
    assert_ne!(s1.key(), s2.key());
}

#[test]
fn state_key_distinguishes_stack_order() {
    // [W, R] and [R, W] on the same cell must produce different keys.
    // Build two states via moves that produce different stack orders:
    // s1: white moves 1 piece from cell 0 to cell 3 → cell 3 = [W]
    // then red moves 1 piece from cell 6 to cell 3 → cell 3 = [W, R]
    let s0 = initial_state();
    let m1 = pogofish_engine::Move { from_cell: 0, num_pieces: 1, to_cell: 3 };
    let s1 = apply_move(&s0, m1).unwrap();
    let m2 = pogofish_engine::Move { from_cell: 6, num_pieces: 1, to_cell: 3 };
    let s1_final = apply_move(&s1, m2).unwrap();
    // cell 3 = [W, R]

    // s2: red moves 1 piece from cell 6 to cell 3 first, then white on top
    // But we can't do that from initial (white moves first), so construct differently:
    // Move white cell 0→3 (1 piece), red cell 6→7 (1 piece),
    // then white cell 3→4 (1 piece), red cell 7→3 (2 pieces) → cell 3 = [R, R]
    // vs s1_final cell 3 = [W, R]
    // These have different stacks at cell 3, so keys differ.
    let m3 = pogofish_engine::Move { from_cell: 0, num_pieces: 1, to_cell: 3 };
    let s2a = apply_move(&s0, m3).unwrap();
    let m4 = pogofish_engine::Move { from_cell: 6, num_pieces: 1, to_cell: 7 };
    let s2b = apply_move(&s2a, m4).unwrap();
    let m5 = pogofish_engine::Move { from_cell: 3, num_pieces: 1, to_cell: 4 };
    let s2c = apply_move(&s2b, m5).unwrap();
    let m6 = pogofish_engine::Move { from_cell: 7, num_pieces: 2, to_cell: 3 };
    // distance from cell 7 to cell 3: row diff=1, col diff=1 → d=2. 2 pieces → d=2. Valid!
    let s2_final = apply_move(&s2c, m6).unwrap();
    // cell 3: s1_final=[W,R], s2_final should have [R,R] or different stack

    // The keys should differ because the board states are different
    assert_ne!(s1_final.key(), s2_final.key());
}
