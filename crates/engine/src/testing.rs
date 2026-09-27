use crate::state::{GameState, StateKey, NUM_CELLS};
use crate::types::{Cell, Color};

pub fn with_to_move(state: &GameState, to_move: Color) -> GameState {
    let mut s = state.clone();
    s.set_to_move(to_move);
    s
}

pub fn state_with_no_red_piles() -> GameState {
    let mut cells: [Cell; NUM_CELLS] = std::array::from_fn(|_| Vec::new());
    cells[4] = vec![Color::White];
    GameState::new(cells, Color::Red, 10, Vec::new())
}

pub fn state_with_repeated_key(template: &GameState, key: StateKey, times: usize) -> GameState {
    let mut history = template.history_clone();
    for _ in 0..times {
        history.push(key.clone());
    }
    let mut s = template.clone();
    s.set_history(history);
    s
}

pub fn state_at_move_count(count: u16, to_move: Color) -> GameState {
    let mut s = crate::initial_state();
    s.set_move_count(count);
    s.set_to_move(to_move);
    s
}

pub fn state_at_move_count_with_all_towers(count: u16, color: Color) -> GameState {
    let mut cells: [Cell; NUM_CELLS] = std::array::from_fn(|_| Vec::new());
    for cell in cells.iter_mut() {
        *cell = vec![color];
    }
    GameState::new(cells, color, count, Vec::new())
}

pub fn state_at_move_count_with_tower_lead(count: u16, color: Color) -> GameState {
    let mut cells: [Cell; NUM_CELLS] = std::array::from_fn(|_| Vec::new());
    for cell in cells.iter_mut().take(5) {
        *cell = vec![color];
    }
    for cell in cells.iter_mut().skip(5).take(3) {
        *cell = vec![color.opponent()];
    }
    GameState::new(cells, color, count, Vec::new())
}

/// A position where `mover` can win in one move by jumping onto the
/// opponent's only remaining stack.
pub fn near_mate_in_one(mover: Color) -> GameState {
    let opp = mover.opponent();
    let mut cells: [Cell; NUM_CELLS] = std::array::from_fn(|_| Vec::new());
    // mover at cell 0, opponent at cell 1 (manhattan distance 1)
    cells[0] = vec![mover];
    cells[1] = vec![opp];
    GameState::new(cells, mover, 5, Vec::new())
}

/// A position with a mixed-color stack at cell 4: [W, R, W].
/// White to move. Used to test that pickup takes pieces of any color
/// from the top of the stack, not just same-colored pieces.
pub fn mixed_stack_position() -> GameState {
    let mut cells: [Cell; NUM_CELLS] = std::array::from_fn(|_| Vec::new());
    cells[4] = vec![Color::White, Color::Red, Color::White];
    // Some other pieces so the game isn't trivially terminal
    cells[0] = vec![Color::White];
    cells[8] = vec![Color::Red];
    GameState::new(cells, Color::White, 10, Vec::new())
}

pub fn state_at_move_count_with_equal_towers(count: u16) -> GameState {
    let mut cells: [Cell; NUM_CELLS] = std::array::from_fn(|_| Vec::new());
    for cell in cells.iter_mut().take(4) {
        *cell = vec![Color::White];
    }
    for cell in cells.iter_mut().skip(4).take(4) {
        *cell = vec![Color::Red];
    }
    GameState::new(cells, Color::White, count, Vec::new())
}

/// Build an arbitrary position for hand-written regression tests.
/// `cells` lists stacks bottom to top; history starts empty.
pub fn position(cells: [Cell; NUM_CELLS], to_move: Color, move_count: u16) -> GameState {
    GameState::new(cells, to_move, move_count, Vec::new())
}
