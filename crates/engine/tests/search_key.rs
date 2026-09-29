//! Plan task 2.2: the search key separates two states exactly when the
//! ruleset can tell them apart.

use pogofish_engine::testing::{state_at_move_count, state_with_repeated_key};
use pogofish_engine::{is_terminal, search_key, Color, GameState, RuleSet};

/// Same board and player to move; different move count, different number
/// of earlier occurrences of the position.
fn variants() -> [(&'static str, GameState); 4] {
    let a = state_at_move_count(8, Color::White);
    let b = state_at_move_count(29, Color::White);
    let a_seen_once = state_with_repeated_key(&a, a.key(), 1);
    let a_seen_twice = state_with_repeated_key(&a, a.key(), 2);
    [
        ("move 8", a),
        ("move 29", b),
        ("move 8, seen once", a_seen_once),
        ("move 8, seen twice", a_seen_twice),
    ]
}

fn same_key(rules: &RuleSet, x: &GameState, y: &GameState) -> bool {
    search_key(x, rules) == search_key(y, rules)
}

#[test]
fn uncapped_keeps_every_transposition() {
    let v = variants();
    for (_, x) in &v {
        for (_, y) in &v {
            assert!(same_key(&RuleSet::Uncapped, x, y));
            assert_eq!(search_key(x, &RuleSet::Uncapped), x.key());
        }
    }
}

#[test]
fn caps_separate_move_counts_only() {
    let [(_, m8), (_, m29), (_, m8_once), (_, m8_twice)] = variants();
    for rules in [RuleSet::LC2 { cap: 30 }, RuleSet::LC3 { cap: 30 }] {
        assert!(!same_key(&rules, &m8, &m29), "{rules}");
        assert!(same_key(&rules, &m8, &m8_once), "{rules}");
        assert!(same_key(&rules, &m8_once, &m8_twice), "{rules}");
    }
}

#[test]
fn repetition_rule_separates_histories_not_move_counts() {
    let [(_, m8), (_, m29), (_, m8_once), (_, m8_twice)] = variants();
    let rules = RuleSet::LC1 { repetitions: 2 };
    assert!(same_key(&rules, &m8, &m29));
    assert!(!same_key(&rules, &m8, &m8_once));
    assert!(!same_key(&rules, &m8_once, &m8_twice));
}

/// Review finding: the same board, reached with the current position seen
/// the same number of times, but with a different set of earlier positions.
/// Under LC1 one move then loses in one history and not in the other, so the
/// states must not share a search node. The order of the history does not
/// matter, so equal multisets still share one.
#[test]
fn repetition_rule_separates_histories_that_differ_in_what_comes_next() {
    use pogofish_engine::{apply_move, Move, Outcome};
    let rules = RuleSet::LC1 { repetitions: 1 };
    let base = state_at_move_count(8, Color::White);
    let mv = Move {
        from_cell: 0,
        num_pieces: 1,
        to_cell: 3,
    };
    let q = apply_move(&base, mv).unwrap().key();
    let other = pogofish_engine::initial_state().key();
    let other2 = apply_move(
        &base,
        Move {
            from_cell: 1,
            num_pieces: 1,
            to_cell: 4,
        },
    )
    .unwrap()
    .key();

    let with_q = state_with_repeated_key(&state_with_repeated_key(&base, other.clone(), 0), q, 1);
    let without_q = state_with_repeated_key(&base, other2.clone(), 1);
    assert_eq!(
        is_terminal(&apply_move(&with_q, mv).unwrap(), &rules),
        Some(Outcome::WinRed),
        "the move repeats Q, White loses"
    );
    assert_eq!(
        is_terminal(&apply_move(&without_q, mv).unwrap(), &rules),
        None
    );
    assert!(!same_key(&rules, &with_q, &without_q));

    let ab = state_with_repeated_key(
        &state_with_repeated_key(&base, other.clone(), 1),
        other2.clone(),
        1,
    );
    let ba = state_with_repeated_key(&state_with_repeated_key(&base, other2, 1), other, 1);
    assert!(
        same_key(&rules, &ab, &ba),
        "history order is not part of the key"
    );
}

/// The reason the keys must differ: at the edges below, the rule gives the
/// two states different outcomes. Where keys are equal, outcomes are too.
#[test]
fn keys_differ_where_outcomes_differ() {
    let v = variants();
    let rulesets = [
        RuleSet::Uncapped,
        RuleSet::LC1 { repetitions: 1 },
        RuleSet::LC1 { repetitions: 2 },
        RuleSet::LC2 { cap: 29 },
        RuleSet::LC3 { cap: 29 },
    ];
    let mut separated = 0;
    for rules in &rulesets {
        for (nx, x) in &v {
            for (ny, y) in &v {
                if is_terminal(x, rules) != is_terminal(y, rules) {
                    assert!(!same_key(rules, x, y), "{rules}: {nx} vs {ny} share a key");
                    separated += 1;
                }
            }
        }
    }
    assert!(
        separated > 0,
        "the fixture must exercise at least one difference"
    );
}

#[test]
fn only_uncapped_has_a_markov_board() {
    assert!(RuleSet::Uncapped.board_is_markov());
    for r in [
        RuleSet::LC1 { repetitions: 1 },
        RuleSet::LC2 { cap: 9 },
        RuleSet::LC3 { cap: 9 },
    ] {
        assert!(!r.board_is_markov(), "{r}");
    }
}
