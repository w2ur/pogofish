//! Retrograde solver: counting, ranking, move generation and un-moves checked
//! against the engine, and the solver's controls on reduced variants small
//! enough to enumerate and solve in a test.

use pogofish_engine::symmetry::verified_symmetries;
use pogofish_engine::{apply_move, base_outcome, legal_moves, Cell, Color, GameState, StateKey};
use pogofish_search::retro::{
    binomial, check_consistency, check_symmetry, decode, solve_in_memory, Board, Game, MoveRule,
    Status, Value, DRAW, LOSS, WIN,
};
use proptest::prelude::*;
use std::collections::{BTreeSet, HashMap, HashSet};

fn key_of(cells: &[Cell; 9], mover: Color) -> StateKey {
    pogofish_engine::testing::position(cells.clone(), mover, 0).key()
}

/// Every board with `white` and `red` pieces, built independently of the
/// ranking: start from the empty board and drop one piece at a time on top of
/// any cell (every stack is built bottom-up this way).
fn brute_force_boards(white: u8, red: u8) -> HashSet<StateKey> {
    let mut level: HashMap<StateKey, ([Cell; 9], u8, u8)> = HashMap::new();
    let empty: [Cell; 9] = std::array::from_fn(|_| Vec::new());
    level.insert(key_of(&empty, Color::White), (empty, 0, 0));
    for _ in 0..(white + red) {
        let mut next = HashMap::new();
        for (cells, w, r) in level.values() {
            for (colour, ok) in [(Color::White, *w < white), (Color::Red, *r < red)] {
                if !ok {
                    continue;
                }
                for i in 0..9 {
                    let mut c = cells.clone();
                    c[i].push(colour);
                    let (nw, nr) = if colour == Color::White {
                        (w + 1, *r)
                    } else {
                        (*w, r + 1)
                    };
                    next.insert(key_of(&c, Color::White), (c, nw, nr));
                }
            }
        }
        level = next;
    }
    let mut out = HashSet::new();
    for (cells, _, _) in level.values() {
        out.insert(key_of(cells, Color::White));
        out.insert(key_of(cells, Color::Red));
    }
    out
}

#[test]
fn position_count_matches_brute_force_on_reduced_variants() {
    for (w, r) in [(1, 1), (2, 1), (2, 2), (3, 2), (3, 3)] {
        let g = Game::new(w, r, MoveRule::published());
        let n = (w + r) as u64;
        let formula = 2 * binomial(n, r as u64) * binomial(n + 8, 8);
        let brute = brute_force_boards(w, r).len() as u64;
        assert_eq!(brute, formula, "{w}+{r}");
        assert_eq!(g.size(), formula, "{w}+{r}");
    }
}

#[test]
fn rank_is_a_bijection_on_the_three_plus_three_variant() {
    let g = Game::new(3, 3, MoveRule::published());
    let mut seen = HashSet::new();
    for i in 0..g.size() {
        let b = g.unrank(i);
        assert_eq!(g.rank(&b), i);
        let s = b.to_state();
        let reds = s
            .cells()
            .iter()
            .flatten()
            .filter(|&&c| c == Color::Red)
            .count();
        let total: usize = s.cells().iter().map(|c| c.len()).sum();
        assert_eq!((reds, total), (3, 6));
        assert!(seen.insert(s.key()), "two indices give one position");
    }
    // Injective into a set of exactly that size (brute-force count above): onto.
    assert_eq!(seen.len() as u64, g.size());
}

/// A full-game board built without the ranking: each of the 12 pieces is
/// dropped on a chosen cell, in a shuffled colour order.
fn arb_board() -> impl Strategy<Value = Board> {
    let colours: Vec<Color> = [Color::White; 6]
        .into_iter()
        .chain([Color::Red; 6])
        .collect();
    (
        prop::collection::vec(0usize..9, 12),
        Just(colours).prop_shuffle(),
        any::<bool>(),
    )
        .prop_map(|(cells, colours, red)| {
            let mut c: [Cell; 9] = std::array::from_fn(|_| Vec::new());
            for (cell, colour) in cells.into_iter().zip(colours) {
                c[cell].push(colour);
            }
            let mover = if red { Color::Red } else { Color::White };
            Board::from_state(&pogofish_engine::testing::position(c, mover, 0))
        })
}

fn engine_children(s: &GameState) -> BTreeSet<Vec<u8>> {
    legal_moves(s)
        .into_iter()
        .map(|m| apply_move(s, m).unwrap().key().0)
        .collect()
}

/// Parents of `child` found without the un-move code: every way of lifting
/// 1–3 pieces off any stack onto any other cell (a superset of the reversed
/// moves), kept when the engine has a legal move from it back to `child` and
/// the game was not already over there.
fn engine_parents(child: &GameState) -> BTreeSet<Vec<u8>> {
    let mut out = BTreeSet::new();
    let back = child.to_move().opponent();
    for a in 0..9 {
        for b in 0..9 {
            if a == b {
                continue;
            }
            for k in 1..=3usize {
                let mut cells = child.cells().clone();
                if cells[a].len() < k {
                    continue;
                }
                let block = cells[a].split_off(cells[a].len() - k);
                cells[b].extend(block);
                let cand = pogofish_engine::testing::position(cells, back, 0);
                if base_outcome(&cand).is_some() {
                    continue;
                }
                if legal_moves(&cand)
                    .into_iter()
                    .any(|m| apply_move(&cand, m).unwrap().key() == child.key())
                {
                    out.insert(cand.key().0);
                }
            }
        }
    }
    out
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(400))]

    #[test]
    fn rank_unrank_round_trip_on_the_full_game(b in arb_board()) {
        let g = Game::published();
        let i = g.rank(&b);
        prop_assert!(i < g.size());
        prop_assert_eq!(g.unrank(i), b);
    }

    #[test]
    fn unrank_rank_round_trip_on_the_full_game(i in 0u64..232_792_560) {
        let g = Game::published();
        prop_assert_eq!(g.rank(&g.unrank(i)), i);
    }

    #[test]
    fn move_generator_matches_the_engine(b in arb_board()) {
        prop_assume!(b.status() == Status::Live);
        let g = Game::published();
        let s = b.to_state();
        let mut mine = BTreeSet::new();
        g.for_each_child(&b, |c| { mine.insert(c.to_state().key().0); });
        prop_assert_eq!(&mine, &engine_children(&s));
        prop_assert_eq!(g.move_count(&b) as usize, legal_moves(&s).len());
        let order: Vec<(u8, u8, u8)> = legal_moves(&s)
            .into_iter()
            .map(|m| (m.from_cell, m.num_pieces, m.to_cell))
            .collect();
        prop_assert_eq!(g.moves(&b), order);
    }

    #[test]
    fn status_matches_the_engine(b in arb_board()) {
        let s = b.to_state();
        let expected = match base_outcome(&s) {
            None => Status::Live,
            Some(o) if o.winner() == Some(s.to_move()) => Status::Over,
            Some(_) => Status::Lost,
        };
        prop_assert_eq!(b.status(), expected);
    }

    #[test]
    fn un_moves_give_exactly_the_engine_parents(b in arb_board()) {
        let g = Game::published();
        let mut mine = BTreeSet::new();
        g.for_each_parent(&b, |p| { mine.insert(p.to_state().key().0); });
        prop_assert_eq!(mine, engine_parents(&b.to_state()));
    }
}

#[test]
fn un_moves_invert_every_move_of_the_three_plus_three_variant() {
    let g = Game::new(3, 3, MoveRule::published());
    let mut forward: HashMap<u64, BTreeSet<u64>> = HashMap::new();
    for i in 0..g.size() {
        let b = g.unrank(i);
        if b.status() == Status::Live {
            g.for_each_child(&b, |c| {
                forward.entry(g.rank(&c)).or_default().insert(i);
            });
        }
    }
    let mut edges = 0;
    for i in 0..g.size() {
        let mut back = BTreeSet::new();
        g.for_each_parent(&g.unrank(i), |p| {
            assert!(back.insert(g.rank(&p)), "a parent found twice");
        });
        edges += back.len();
        assert_eq!(back, forward.remove(&i).unwrap_or_default(), "index {i}");
    }
    assert!(edges > 0);
}

/// Independent exact search on the engine (plain recursion, no table):
/// can the mover force a win within `d` plies?
fn win_within(s: &GameState, d: u32) -> bool {
    d > 0
        && legal_moves(s)
            .into_iter()
            .any(|m| loss_within(&apply_move(s, m).unwrap(), d - 1))
}

/// Must the mover lose within `d` plies whatever it plays?
fn loss_within(s: &GameState, d: u32) -> bool {
    match base_outcome(s) {
        Some(o) => o.winner() != Some(s.to_move()),
        None => {
            d > 0
                && legal_moves(s)
                    .into_iter()
                    .all(|m| win_within(&apply_move(s, m).unwrap(), d - 1))
        }
    }
}

#[test]
fn reduced_variant_solution_passes_every_control() {
    let g = Game::new(3, 3, MoveRule::published());
    let (t, max_level) = solve_in_memory(&g, 4);
    assert!(max_level > 0);
    let v = check_consistency(&g, &t, 4, None);
    assert_eq!(v.total(), 0, "{v:?}");
    let perms = verified_symmetries();
    assert_eq!(check_symmetry(&g, &t, &perms, 4), (0, 0));

    // Agreement with the independent search, distance included, on every
    // decided position within 5 plies and, for draws, to that depth.
    const D: u16 = 5;
    for i in (0..g.size()).step_by(7) {
        let s = g.unrank(i).to_state();
        match decode(t[i as usize]) {
            Value::Win(d) if d <= D => {
                assert!(win_within(&s, d as u32), "{i}");
                assert!(d < 2 || !win_within(&s, d as u32 - 2), "{i} faster");
            }
            Value::Loss(d) if d <= D => {
                assert!(loss_within(&s, d as u32), "{i}");
                assert!(d < 2 || !loss_within(&s, d as u32 - 2), "{i} longer");
            }
            Value::Draw => {
                assert!(
                    !win_within(&s, D as u32) && !loss_within(&s, D as u32),
                    "{i}"
                );
            }
            _ => {}
        }
    }
}

#[test]
fn consistency_check_catches_a_corrupted_entry() {
    let g = Game::new(3, 3, MoveRule::published());
    let (t, _) = solve_in_memory(&g, 4);
    let find = |want: fn(Value) -> bool| t.iter().position(|&v| want(decode(v))).unwrap();
    let cases: [(usize, u16); 4] = [
        { let i = find(|v| matches!(v, Value::Win(_))); (i, LOSS | (t[i] & 0x3FFF)) },
        { let i = find(|v| matches!(v, Value::Loss(d) if d > 0)); (i, WIN | (t[i] & 0x3FFF)) },
        (find(|v| v == Value::Draw), WIN | 1),
        (find(|v| matches!(v, Value::Win(_))), DRAW),
    ];
    for (i, code) in cases {
        let mut bad = t.clone();
        bad[i] = code;
        assert!(check_consistency(&g, &bad, 4, None).total() > 0, "{i} -> {code:#x}");
    }
    // A distance off by two (same parity) is caught too.
    let i = t
        .iter()
        .position(|&v| v & 0xC000 == WIN && v & 0x3FFF == 3)
        .unwrap();
    let mut bad = t.clone();
    bad[i] = WIN | 5;
    assert!(check_consistency(&g, &bad, 4, None).total() > 0);
}

#[test]
fn consistency_check_catches_a_table_solved_under_a_mutated_rule() {
    // Three pieces may only travel 3 steps.
    let mut rule = MoveRule::published();
    rule.allowed[3][1] = false;
    let mutated = Game::new(3, 3, rule);
    let (t, _) = solve_in_memory(&mutated, 4);
    assert_eq!(check_consistency(&mutated, &t, 4, None).total(), 0);
    let truth = Game::new(3, 3, MoveRule::published());
    assert!(check_consistency(&truth, &t, 4, None).total() > 0);
}

/// Round 5: a diagram reads back into the same board, for every position of
/// a sample of the published game; anything else is refused.
#[test]
fn diagrams_read_back() {
    let g = Game::published();
    let mut i = 1u64;
    for _ in 0..2000 {
        i = i.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let b = g.unrank(i % g.size());
        let back = Board::from_diagram(&b.diagram()).expect("a diagram reads back");
        assert_eq!(g.rank(&back), g.rank(&b));
    }
    assert!(Board::from_diagram("not a board").is_none());
    let d = g.unrank(5).diagram().replacen(" to move", " to play", 1);
    assert!(Board::from_diagram(&d).is_none());
}
