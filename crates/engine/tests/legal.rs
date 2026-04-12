use pogofish_engine::{apply_move, initial_state, legal_moves, Color, Move};

#[test]
fn initial_state_has_moves_for_white() {
    let s = initial_state();
    let moves = legal_moves(&s);
    assert!(!moves.is_empty(), "white must have legal moves from initial state");
}

#[test]
fn apply_move_advances_to_move() {
    let s = initial_state();
    let moves = legal_moves(&s);
    let first = moves[0];
    let s2 = apply_move(&s, first).expect("legal move should apply");
    assert_eq!(s2.to_move(), Color::Red);
    assert_eq!(s2.move_count(), 1);
}

#[test]
fn apply_move_rejects_illegal_source() {
    let s = initial_state();
    // Attempt to move from a red-owned cell as white
    let illegal = Move { from_cell: 8, num_pieces: 1, to_cell: 5 };
    assert!(apply_move(&s, illegal).is_err());
}

#[test]
fn pieces_are_conserved_after_move() {
    let s = initial_state();
    let total_before: usize = s.cells().iter().map(|c| c.len()).sum();
    let m = legal_moves(&s)[0];
    let s2 = apply_move(&s, m).unwrap();
    let total_after: usize = s2.cells().iter().map(|c| c.len()).sum();
    assert_eq!(total_before, total_after, "total pieces must be conserved");
}

#[test]
fn move_onto_enemy_stack_changes_owner() {
    // From initial: white at cells 0-2 (height 2), red at 6-8 (height 2)
    // Move 1 piece from cell 0 to cell 3 (d=1), then red moves from cell 6 to cell 3 (d=1)
    let s0 = initial_state();
    let m1 = Move { from_cell: 0, num_pieces: 1, to_cell: 3 };
    let s1 = apply_move(&s0, m1).unwrap();
    // Cell 3 is now [W], owned by white
    assert_eq!(s1.cell_owner(3), Some(Color::White));

    let m2 = Move { from_cell: 6, num_pieces: 1, to_cell: 3 };
    let s2 = apply_move(&s1, m2).unwrap();
    // Cell 3 is now [W, R], owned by red (top piece)
    assert_eq!(s2.cell_owner(3), Some(Color::Red));
    assert_eq!(s2.cells()[3].len(), 2);
}

#[test]
fn distance_rules_match_pogo() {
    let s = initial_state();
    let moves = legal_moves(&s);

    // Verify distance constraints
    for m in &moves {
        let row_from = m.from_cell / 3;
        let col_from = m.from_cell % 3;
        let row_to = m.to_cell / 3;
        let col_to = m.to_cell % 3;
        let d = row_from.abs_diff(row_to) + col_from.abs_diff(col_to);

        let valid_dists = match m.num_pieces {
            1 => vec![1],
            2 => vec![2],
            3 => vec![1, 3],
            _ => panic!("unexpected num_pieces"),
        };
        assert!(
            valid_dists.contains(&d),
            "move {:?} has distance {} which is not in {:?}",
            m, d, valid_dists
        );
    }
}

#[test]
fn apply_move_same_cell_rejected() {
    let s = initial_state();
    let m = Move { from_cell: 0, num_pieces: 1, to_cell: 0 };
    assert!(apply_move(&s, m).is_err());
}

/// Regression test: picking pieces from a stack must take from the TOP,
/// including any opponent-colored pieces below the top. A prior implementation
/// incorrectly restricted pickup to only same-colored pieces.
#[test]
fn pickup_includes_mixed_color_pieces() {
    // Build a mixed-color stack using a test helper, then verify we can pick
    // mixed-color groups from the top.
    let s = pogofish_engine::testing::mixed_stack_position();

    // State: cell 4 = [W, R, W] (White-topped, height 3), White to move.
    assert_eq!(s.to_move(), Color::White);
    assert_eq!(s.cells()[4], vec![Color::White, Color::Red, Color::White]);
    assert_eq!(s.cell_owner(4), Some(Color::White));

    // Pick 2 from cell 4: should take [R, W] (the top 2 pieces).
    // 2 pieces → distance 2. Cell 4 (row=1,col=1) → cell 0 (row=0,col=0): d=2. Valid.
    let m = Move { from_cell: 4, num_pieces: 2, to_cell: 0 };
    let legal = legal_moves(&s);
    assert!(legal.contains(&m), "picking 2 mixed-color pieces must be legal");

    let s2 = apply_move(&s, m).unwrap();

    // Source cell 4: was [W, R, W], removed top 2 [R, W] → [W]
    assert_eq!(s2.cells()[4], vec![Color::White]);
    assert_eq!(s2.cell_owner(4), Some(Color::White));

    // Destination cell 0: received [R, W] on top of whatever was there.
    // The R piece is in the middle — this proves mixed-color pickup works.
    let dest = &s2.cells()[0];
    assert!(dest.len() >= 2);
    // The top 2 pieces of destination must be [R, W] (the group we moved)
    let top_two = &dest[dest.len() - 2..];
    assert_eq!(top_two, &[Color::Red, Color::White]);

    // Pick 3 from cell 4 in original state: should take [W, R, W] (all 3).
    // 3 pieces → distance 1 or 3. Cell 4 → cell 1 (d=1). Valid.
    let m3 = Move { from_cell: 4, num_pieces: 3, to_cell: 1 };
    assert!(legal.contains(&m3), "picking 3 mixed-color pieces must be legal");

    let s3 = apply_move(&s, m3).unwrap();
    // Source cell 4: emptied
    assert!(s3.cells()[4].is_empty());
    // Destination cell 1: received [W, R, W] — mixed colors in a single pickup
    let dest1 = &s3.cells()[1];
    let top_three = &dest1[dest1.len() - 3..];
    assert_eq!(top_three, &[Color::White, Color::Red, Color::White]);
}
