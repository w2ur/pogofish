//! Plan task 2.3: which board symmetries preserve the rules.

use pogofish_engine::symmetry::{preserves_rules, square_symmetries, verified_symmetries, CellMap};
use pogofish_engine::{apply_move, initial_state, is_terminal, legal_moves, GameState, RuleSet};
use proptest::prelude::*;

/// Positions from seeded random playouts, including terminal ones.
fn sample_positions(seed: u64, games: usize) -> Vec<GameState> {
    let mut out = Vec::new();
    let mut rng = seed;
    for _ in 0..games {
        let mut s = initial_state();
        for _ in 0..60 {
            out.push(s.clone());
            if is_terminal(&s, &RuleSet::Uncapped).is_some() {
                break;
            }
            let moves = legal_moves(&s);
            rng = rng
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            s = apply_move(&s, moves[(rng >> 33) as usize % moves.len()]).unwrap();
        }
    }
    out
}

fn swap(a: u8, b: u8) -> CellMap {
    let mut p: CellMap = std::array::from_fn(|i| i as u8);
    p.swap(a as usize, b as usize);
    p
}

#[test]
fn the_eight_square_symmetries_are_distinct_permutations() {
    let syms = square_symmetries();
    for p in &syms {
        let mut sorted = *p;
        sorted.sort_unstable();
        assert_eq!(sorted, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }
    let distinct: std::collections::HashSet<CellMap> = syms.iter().copied().collect();
    assert_eq!(distinct.len(), 8);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(16))]

    /// Every kept symmetry preserves legal moves, move results and outcomes,
    /// under every ruleset that does not read history.
    #[test]
    fn every_verified_symmetry_preserves_the_rules(seed in any::<u64>()) {
        let samples = sample_positions(seed, 2);
        for rules in [RuleSet::Uncapped, RuleSet::LC2 { cap: 30 }, RuleSet::LC3 { cap: 30 }] {
            for (i, p) in verified_symmetries().iter().enumerate() {
                prop_assert!(preserves_rules(p, &samples, &rules), "symmetry {} under {}", i, rules);
            }
        }
    }
}

/// The check must be able to fail: permutations that are not symmetries of
/// the square break Manhattan distance and are rejected.
#[test]
fn permutations_that_are_not_symmetries_are_rejected() {
    let samples = sample_positions(7, 20);
    let impostors: [(&str, CellMap); 4] = [
        ("swap corner and edge", swap(0, 1)),
        ("swap corner and centre", swap(0, 4)),
        ("swap two corners", swap(0, 2)),
        ("cycle the top row", [1, 2, 0, 3, 4, 5, 6, 7, 8]),
    ];
    for (name, p) in impostors {
        assert!(
            !preserves_rules(&p, &samples, &RuleSet::Uncapped),
            "{name} was accepted"
        );
    }
}

/// The kept set is exactly the square's symmetries: among all 9! cell
/// permutations checked on these samples, only those 8 pass.
#[test]
fn only_the_square_symmetries_pass_among_all_permutations() {
    let samples = sample_positions(11, 10);
    let mut passing = Vec::new();
    let mut perm: CellMap = std::array::from_fn(|i| i as u8);
    // Heap's algorithm over all 362,880 permutations.
    let mut c = [0usize; 9];
    let mut check = |p: &CellMap| {
        if preserves_rules(p, &samples[..1], &RuleSet::Uncapped)
            && preserves_rules(p, &samples, &RuleSet::Uncapped)
        {
            passing.push(*p);
        }
    };
    check(&perm);
    let mut i = 0;
    while i < 9 {
        if c[i] < i {
            if i % 2 == 0 {
                perm.swap(0, i);
            } else {
                perm.swap(c[i], i);
            }
            check(&perm);
            c[i] += 1;
            i = 0;
        } else {
            c[i] = 0;
            i += 1;
        }
    }
    passing.sort_unstable();
    let mut expected = verified_symmetries().to_vec();
    expected.sort_unstable();
    assert_eq!(passing, expected);
}
