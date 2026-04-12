use pogofish_engine::notation::{cell_to_notation, move_to_notation, notation_to_cell};
use pogofish_engine::Move;

#[test]
fn cell_zero_is_a1() {
    assert_eq!(cell_to_notation(0), "a1");
}

#[test]
fn cell_eight_is_c3() {
    assert_eq!(cell_to_notation(8), "c3");
}

#[test]
fn notation_to_cell_inverse() {
    for i in 0..9u8 {
        let n = cell_to_notation(i);
        assert_eq!(notation_to_cell(&n), Some(i));
    }
}

#[test]
fn move_notation_format() {
    let m = Move { from_cell: 0, num_pieces: 2, to_cell: 6 };
    assert_eq!(move_to_notation(m), "a1-2-a3");
}

#[test]
fn all_cells_have_unique_notation() {
    let notations: Vec<String> = (0..9).map(cell_to_notation).collect();
    let unique: std::collections::HashSet<&String> = notations.iter().collect();
    assert_eq!(unique.len(), 9);
}
