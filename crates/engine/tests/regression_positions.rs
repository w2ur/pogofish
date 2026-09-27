//! Hand-built positions, one per rule edge (plan task 0.2).
//!
//! Each test names the rule it pins and the engine line that implements it.
//! `docs/rules.md` records which mutation of that line makes the test fail.

use pogofish_engine::testing::position;
use pogofish_engine::{
    apply_move, initial_state, is_terminal, legal_moves, Cell, Color, Move, Outcome, RuleSet,
};
use std::collections::BTreeSet;

const W: Color = Color::White;
const R: Color = Color::Red;

const ALL_RULES: [RuleSet; 3] = [
    RuleSet::LC1 { repetitions: 1 },
    RuleSet::LC2 { cap: 1000 },
    RuleSet::LC3 { cap: 1000 },
];

fn empty() -> [Cell; 9] {
    std::array::from_fn(|_| Vec::new())
}

/// Destinations reachable from `from` carrying `n` pieces.
fn destinations(moves: &[Move], from: u8, n: u8) -> BTreeSet<u8> {
    moves
        .iter()
        .filter(|m| m.from_cell == from && m.num_pieces == n)
        .map(|m| m.to_cell)
        .collect()
}

/// Rule: 1 piece moves distance 1, 2 pieces distance 2, 3 pieces distance 1 or 3
/// (`types.rs` `DISTANCES`). A corner stack of 3 shows every case.
#[test]
fn stack_of_three_moving_one_two_or_three() {
    let mut cells = empty();
    cells[0] = vec![W, W, W];
    cells[8] = vec![R];
    let s = position(cells, W, 0);
    let moves = legal_moves(&s);

    assert_eq!(destinations(&moves, 0, 1), BTreeSet::from([1, 3]));
    assert_eq!(destinations(&moves, 0, 2), BTreeSet::from([2, 4, 6]));
    assert_eq!(destinations(&moves, 0, 3), BTreeSet::from([1, 3, 5, 7]));
    assert_eq!(moves.len(), 9, "no other move exists: {moves:?}");
}

/// Rule: the moved pieces are the top N of the stack, whatever their colour,
/// and they keep their order (`legal.rs` `apply_move`, `split_off`).
#[test]
fn pickup_takes_the_top_pieces_in_order() {
    let mut cells = empty();
    cells[4] = vec![R, W, R, W];
    cells[0] = vec![R];
    let s = position(cells, W, 0);

    let after = apply_move(
        &s,
        Move {
            from_cell: 4,
            num_pieces: 3,
            to_cell: 1,
        },
    )
    .unwrap();
    assert_eq!(after.cells()[4], vec![R]);
    assert_eq!(after.cells()[1], vec![W, R, W]);

    let onto = apply_move(
        &s,
        Move {
            from_cell: 4,
            num_pieces: 1,
            to_cell: 1,
        },
    )
    .unwrap();
    assert_eq!(onto.cells()[4], vec![R, W, R]);
    assert_eq!(
        onto.cell_owner(4),
        Some(R),
        "uncovering a red piece hands red the stack"
    );
}

/// Rule: only a stack topped by the mover's colour can be moved, however many
/// of the mover's pieces lie underneath (`legal.rs` `legal_moves`, top check).
#[test]
fn a_stack_topped_by_the_opponent_cannot_be_moved() {
    let mut cells = empty();
    cells[4] = vec![W, W, W, R];
    cells[0] = vec![W];
    let s = position(cells, W, 0);
    let moves = legal_moves(&s);

    assert!(moves.iter().all(|m| m.from_cell == 0), "{moves:?}");
    assert_eq!(destinations(&moves, 0, 1), BTreeSet::from([1, 3]));
}

/// Rule: a player loses when no stack has their colour on top, even with
/// pieces buried underneath (`rules.rs` `base_terminal`). Here White squeezes
/// Red's last top; the rule holds under every variant.
#[test]
fn win_by_squeeze_with_buried_opponent_pieces() {
    let mut cells = empty();
    cells[0] = vec![W];
    cells[1] = vec![R, R];
    cells[4] = vec![R, W];
    let s = position(cells, W, 0);
    for rules in ALL_RULES {
        assert_eq!(is_terminal(&s, &rules), None);
    }

    let after = apply_move(
        &s,
        Move {
            from_cell: 0,
            num_pieces: 1,
            to_cell: 1,
        },
    )
    .unwrap();
    assert_eq!(after.cells()[1], vec![R, R, W]);
    for rules in ALL_RULES {
        assert_eq!(
            is_terminal(&after, &rules),
            Some(Outcome::WinWhite),
            "{rules:?}"
        );
    }
}

/// Rule: a player with no stack on top has no legal move, and that position is
/// already terminal, won by the other side (`legal.rs` top check,
/// `rules.rs` `base_terminal`). There is no stalemate.
#[test]
fn no_legal_move_only_when_the_game_is_already_lost() {
    let mut cells = empty();
    cells[0] = vec![R, W];
    cells[8] = vec![R, R, W];
    let s = position(cells, R, 7);

    assert!(legal_moves(&s).is_empty());
    for rules in ALL_RULES {
        assert_eq!(
            is_terminal(&s, &rules),
            Some(Outcome::WinWhite),
            "{rules:?}"
        );
    }
}

/// Corollary of the distance table: a lone piece in a corner still has its two
/// orthogonal neighbours, so a player who owns any stack can always move.
#[test]
fn a_lone_corner_piece_still_has_two_moves() {
    let mut cells = empty();
    cells[8] = vec![W];
    cells[0] = vec![W, R, R, R];
    let s = position(cells, W, 0);
    let moves = legal_moves(&s);
    assert_eq!(destinations(&moves, 8, 1), BTreeSet::from([5, 7]));
    assert_eq!(moves.len(), 2);
}

/// Rule: the game starts with 3 stacks of 2 per side on the back rows, White to
/// move (`state.rs` `initial_state`). 7 single-piece moves + 9 two-piece moves.
#[test]
fn initial_position_has_sixteen_moves() {
    let s = initial_state();
    assert_eq!(s.to_move(), W);
    assert_eq!(legal_moves(&s).len(), 16);
}
