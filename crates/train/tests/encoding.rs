use pogofish_engine::initial_state;
use pogofish_train::encoding::{
    index_to_move, legal_move_mask, move_to_index, state_to_tensor, ACTION_SIZE, MAX_STACK,
    STATE_SIZE,
};

#[test]
fn move_to_index_index_to_move_roundtrip() {
    for idx in 0..ACTION_SIZE {
        let m = index_to_move(idx);
        assert_eq!(move_to_index(&m), idx, "roundtrip failed at index {idx}");
    }
}

#[test]
fn state_to_tensor_shape() {
    let state = initial_state();
    let t = state_to_tensor(&state);
    assert_eq!(t.size(), vec![STATE_SIZE as i64]);
}

#[test]
fn state_to_tensor_initial_encoding() {
    let state = initial_state();
    let t = state_to_tensor(&state);
    let data: Vec<f32> = t.try_into().unwrap();

    // Cells 0-2: 2 white pieces each
    for cell in 0..3usize {
        let base = cell * MAX_STACK;
        assert_eq!(data[base], 1.0, "cell {cell} slot 0");
        assert_eq!(data[base + 1], 1.0, "cell {cell} slot 1");
        for slot in 2..MAX_STACK {
            assert_eq!(data[base + slot], 0.0, "cell {cell} slot {slot}");
        }
    }
    // Cells 3-5: empty
    for cell in 3..6usize {
        let base = cell * MAX_STACK;
        for slot in 0..MAX_STACK {
            assert_eq!(data[base + slot], 0.0, "cell {cell} slot {slot}");
        }
    }
    // Cells 6-8: 2 red pieces each
    for cell in 6..9usize {
        let base = cell * MAX_STACK;
        assert_eq!(data[base], -1.0, "cell {cell} slot 0");
        assert_eq!(data[base + 1], -1.0, "cell {cell} slot 1");
        for slot in 2..MAX_STACK {
            assert_eq!(data[base + slot], 0.0, "cell {cell} slot {slot}");
        }
    }
    // Last element: White to move
    assert_eq!(data[STATE_SIZE - 1], 1.0, "current player");
}

#[test]
fn legal_move_mask_shape() {
    let state = initial_state();
    let mask = legal_move_mask(&state);
    assert_eq!(mask.size(), vec![ACTION_SIZE as i64]);
}

#[test]
fn legal_move_mask_nonzero_count_matches_legal_moves() {
    use pogofish_engine::legal_moves;
    let state = initial_state();
    let moves = legal_moves(&state);
    let mask = legal_move_mask(&state);
    let mask_data: Vec<f32> = mask.try_into().unwrap();
    let set_count = mask_data.iter().filter(|&&v| v == 1.0).count();
    assert_eq!(set_count, moves.len());
}
