//! `lc1-N` solver on the draw graph, checked against a brute-force search on
//! the engine (full history, `RuleSet::LC1`, no table, no reduction) on
//! reduced variants small enough to search exhaustively.

use pogofish_engine::{apply_move, is_terminal, legal_moves, GameState, RuleSet, StateKey};
use pogofish_search::lc1solve::{build_graph, Bounded, DrawGraph, Solver};
use pogofish_search::retro::{decode, solve_in_memory, Board, Game, MoveRule, Status, Value, DRAW};
use std::collections::HashMap;

/// Scores a position out of the draws: `Some(mover wins)`, `None` for a draw.
type Oracle<'a> = &'a (dyn Fn(&GameState) -> Option<bool> + Sync);

/// A 128-bit fingerprint of a position key (two SipHash passes with
/// different salts).
fn fingerprint(k: &StateKey) -> u128 {
    use std::hash::{Hash, Hasher};
    let mut out = 0u128;
    for salt in 0..2u8 {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        salt.hash(&mut h);
        k.hash(&mut h);
        out = (out << 64) | h.finish() as u128;
    }
    out
}

/// Mover at `s` wins under `rules`, by exhaustive negamax on the engine
/// (`legal_moves`, `apply_move`, `is_terminal`; no table, no graph). The
/// engine applies the rule: each child is tested with
/// `with_prior_occurrences(n)`, `n` its occurrences so far in this line
/// (`counts`), which is all `RuleSet::LC1` reads of the history. States are
/// shared only when the position and the multiset of positions so far agree
/// (what `search_key` encodes), hashed as the sum of fingerprints `seen`.
/// `None` past `budget` nodes.
fn brute(
    s: &GameState,
    seen: u128,
    counts: &mut HashMap<u128, usize>,
    rules: &RuleSet,
    oracle: Option<Oracle>,
    memo: &mut HashMap<u128, bool>,
    budget: &mut u64,
) -> Option<bool> {
    let here = fingerprint(&s.key());
    let key = seen
        ^ here
            .rotate_left(1)
            .wrapping_mul(0x9E37_79B9_7F4A_7C15_F39C_C060_5CED_C835);
    if let Some(&x) = memo.get(&key) {
        return Some(x);
    }
    if *budget == 0 {
        return None;
    }
    *budget -= 1;
    let mut win = false;
    for m in legal_moves(s) {
        let mut c = apply_move(s, m).expect("legal");
        c.forget_history();
        let fc = fingerprint(&c.key());
        let prior = counts.get(&fc).copied().unwrap_or(0);
        let r = match is_terminal(&c.with_prior_occurrences(prior), rules) {
            Some(o) => o.winner() == Some(s.to_move()),
            None if oracle.is_some_and(|o| o(&c).is_some()) => !oracle.unwrap()(&c).unwrap(),
            None => {
                *counts.entry(fc).or_default() += 1;
                let opp = brute(
                    &c,
                    seen.wrapping_add(fc),
                    counts,
                    rules,
                    oracle,
                    memo,
                    budget,
                );
                *counts.get_mut(&fc).unwrap() -= 1;
                !opp?
            }
        };
        if r {
            win = true;
            break;
        }
    }
    memo.insert(key, win);
    Some(win)
}

fn big_stack<T: Send>(f: impl FnOnce() -> T + Send) -> T {
    std::thread::scope(|s| {
        std::thread::Builder::new()
            .stack_size(1 << 30)
            .spawn_scoped(s, f)
            .unwrap()
            .join()
            .unwrap()
    })
}

/// Live draws of a variant, every `step`-th one.
fn draw_roots(g: &Game, t: &[u16], step: usize) -> Vec<Board> {
    (0..g.size())
        .filter(|&i| t[i as usize] == DRAW && g.unrank(i).status() == Status::Live)
        .step_by(step)
        .map(|i| g.unrank(i))
        .collect()
}

struct Tally {
    compared: usize,
    agree: usize,
    root_wins: usize,
    skipped: usize,
}

/// Solver (static decomposition, lazy search, plain search) against the
/// engine brute force under `LC1 { repetitions: brute_reps }`, on draw roots
/// whose graph has at most `max_g` nodes (larger ones, and roots the brute
/// force cannot finish within `budget` nodes, are counted as skipped).
///
/// The brute force scores a move out of the draws by the uncapped table
/// (claim 2 of the doc, checked on its own by `lc1solve exits`): searched
/// without it, the lines after such a move do not finish within any budget
/// tried, even on 8-node graphs. Everything else is the engine's: moves,
/// history, the repetition rule.
fn compare(
    white: u8,
    red: u8,
    step: usize,
    cap: u8,
    brute_reps: u8,
    budget: u64,
    max_g: usize,
) -> Tally {
    let g = Game::new(white, red, MoveRule::published());
    let (t, _) = solve_in_memory(&g, 4);
    let table = |c: &GameState| match decode(t[g.rank(&Board::from_state(c)) as usize]) {
        Value::Draw => None,
        Value::Win(_) => Some(true),
        Value::Loss(_) => Some(false),
        v => panic!("unexpected value {v:?}"),
    };
    let oracle: Option<Oracle> = Some(&table);
    let roots = draw_roots(&g, &t, step);
    let rules = RuleSet::LC1 {
        repetitions: brute_reps,
    };
    let mut tally = Tally {
        compared: 0,
        agree: 0,
        root_wins: 0,
        skipped: 0,
    };
    big_stack(|| {
        for root in &roots {
            let gr = build_graph(&g, &t, root);
            if gr.len() > max_g {
                tally.skipped += 1;
                continue;
            }
            let a = Solver::new(&gr, cap).solve().unwrap();
            let b = Solver::new(&gr, cap).solve_lazy().unwrap();
            let mut plain = Solver::new(&gr, cap);
            plain.dynamic = false;
            let c = plain.solve_lazy().unwrap();
            assert_eq!(a, b, "static vs lazy");
            assert_eq!(a, c, "reduced vs plain");
            let mut memo = HashMap::new();
            let mut left = budget;
            let s0 = root.to_state();
            let f0 = fingerprint(&s0.key());
            let mut counts = HashMap::from([(f0, 1usize)]);
            let r = brute(&s0, f0, &mut counts, &rules, oracle, &mut memo, &mut left);
            if std::env::var("LC1_TRACE").is_ok() {
                eprintln!("G {} brute {:?} nodes {}", gr.len(), r, budget - left);
            }
            match r {
                Some(x) => {
                    tally.compared += 1;
                    tally.agree += (x == a) as usize;
                    tally.root_wins += a as usize;
                }
                None => tally.skipped += 1,
            }
        }
    });
    tally
}

#[test]
fn solver_matches_engine_brute_force_on_small_variants() {
    for (w, r, step) in [(3, 2, 1), (2, 1, 1)] {
        for cap in 1..=3u8 {
            let tl = compare(w, r, step, cap, cap, 2_000_000, 50);
            eprintln!(
                "{w}+{r} cap {cap}: compared {} agree {} root wins {} skipped {}",
                tl.compared, tl.agree, tl.root_wins, tl.skipped
            );
            assert!(tl.compared > 0, "{w}+{r}: nothing compared");
            assert_eq!(tl.agree, tl.compared, "{w}+{r} cap {cap}");
        }
    }
}

#[test]
fn bounded_search_agrees_with_the_solver() {
    let g = Game::new(3, 2, MoveRule::published());
    let (t, _) = solve_in_memory(&g, 4);
    big_stack(|| {
        for root in draw_roots(&g, &t, 1) {
            let gr = build_graph(&g, &t, &root);
            if gr.len() > 24 {
                continue;
            }
            let v = Solver::new(&gr, 2).solve().unwrap();
            let mut b = Bounded::new(&gr, 2, &[(gr.root, 1)]);
            let d = (2 * gr.len() + 2) as u16;
            assert_eq!(b.wins(gr.root, d), v);
            assert_eq!(b.loses(gr.root, d), !v);
        }
    });
}

/// The capacity game on an abstract graph, by the definition: the mover
/// picks a successor entered fewer than `cap` times, or loses. Exhaustive,
/// with a table on (node, all counts).
fn abstract_brute(
    succ: &[Vec<u32>],
    v: u32,
    counts: &mut Vec<u8>,
    cap: u8,
    memo: &mut HashMap<(u32, Vec<u8>), bool>,
) -> bool {
    if let Some(&x) = memo.get(&(v, counts.clone())) {
        return x;
    }
    let mut win = false;
    for &w in &succ[v as usize] {
        if counts[w as usize] >= cap {
            continue;
        }
        counts[w as usize] += 1;
        let opp = abstract_brute(succ, w, counts, cap, memo);
        counts[w as usize] -= 1;
        if !opp {
            win = true;
            break;
        }
    }
    memo.insert((v, counts.clone()), win);
    win
}

/// Random digraphs of 3 to 9 nodes, out-degree 0 to 3 (self-loops excluded).
fn random_graphs(count: usize, seed: u64) -> Vec<Vec<Vec<u32>>> {
    let mut rng = pogofish_search::rng::SplitMix64::new(seed);
    (0..count)
        .map(|_| {
            let n = 3 + rng.below(7);
            (0..n)
                .map(|v| {
                    let mut s: Vec<u32> = (0..rng.below(4))
                        .map(|_| rng.below(n) as u32)
                        .filter(|&w| w as usize != v)
                        .collect();
                    s.sort_unstable();
                    s.dedup();
                    s
                })
                .collect()
        })
        .collect()
}

#[test]
fn solver_matches_the_definition_on_random_graphs() {
    // Every node as the root, capacities 1 to 3, all three solver paths.
    let graphs = random_graphs(300, 5);
    let mut differ_by_cap = 0;
    let mut checked = 0;
    big_stack(|| {
        for succ in &graphs {
            for root in 0..succ.len() as u32 {
                let mut by_cap = Vec::new();
                for cap in 1..=3u8 {
                    let gr = DrawGraph::abstract_graph(succ, root);
                    let mut counts = vec![0u8; succ.len()];
                    counts[root as usize] = 1;
                    let want = abstract_brute(succ, root, &mut counts, cap, &mut HashMap::new());
                    let a = Solver::new(&gr, cap).solve().unwrap();
                    let b = Solver::new(&gr, cap).solve_lazy().unwrap();
                    let mut p = Solver::new(&gr, cap);
                    p.dynamic = false;
                    let c = p.solve_lazy().unwrap();
                    let mut o = Solver::new(&gr, cap);
                    o.order_by_mobility = true;
                    let d = o.solve().unwrap();
                    assert_eq!((a, b, c, d), (want, want, want, want), "graph {succ:?} root {root} cap {cap}: static, lazy, plain, ordered vs definition");
                    by_cap.push(want);
                    checked += 1;
                }
                differ_by_cap += (by_cap[0] != by_cap[1] || by_cap[1] != by_cap[2]) as usize;
            }
        }
    });
    eprintln!("random graphs: {checked} (root, cap) cases; roots whose value depends on the cap: {differ_by_cap}");
    // The capacity must matter somewhere, or this test could not catch a solver that ignores it.
    assert!(differ_by_cap > 0);
}

#[test]
fn a_mutated_capacity_disagrees_with_the_definition() {
    for (solver_cap, true_cap) in [(1u8, 2u8), (3, 2)] {
        let mut disagree = 0;
        big_stack(|| {
            for succ in random_graphs(300, 5) {
                for root in 0..succ.len() as u32 {
                    let gr = DrawGraph::abstract_graph(&succ, root);
                    let mut counts = vec![0u8; succ.len()];
                    counts[root as usize] = 1;
                    let want =
                        abstract_brute(&succ, root, &mut counts, true_cap, &mut HashMap::new());
                    disagree += (Solver::new(&gr, solver_cap).solve().unwrap() != want) as usize;
                }
            }
        });
        eprintln!("solver capacity {solver_cap} against lc1-{true_cap}: {disagree} roots disagree");
        assert!(disagree > 0, "capacity {solver_cap} was not caught");
    }
}
