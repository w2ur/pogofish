//! Round 3: principles of Pogo read from perfect play, tested in the arena,
//! and the opening theory of the draw. See
//! `docs/experiments/v3-principles-perfect.md`.
//!
//! ```text
//! perfect pilot   <table-dir> [--per-class 200]           time the sampling, extrapolate
//! perfect learn   <table-dir> --train N --test M --seed S --out <json> --players <json>
//! perfect arena   --players <json> --pairs P --seed S [--table <dir>] --out <json>
//! perfect opening <table-dir> --plies P [--players <json>] --out <json>
//! ```
//!
//! `<table-dir>` holds `table.bin` and `reachable.bin` from `retro`.

use anyhow::bail;
use pogofish_engine::{
    apply_move, apply_move_under, is_terminal, legal_moves, notation, GameState, Move, RuleSet,
    NUM_CELLS,
};
use pogofish_search::arena::{random_opening, run_match, Agent, ArenaConfig};
use pogofish_search::perfect::{
    feature_index, feature_name, feature_shares, keep_rate, keeps_value, learn_rule_list,
    list_score, move_features, position_row, row_of, tree_input, Criterion, Policy, PolicyPlayer,
    Row, Sample, ShareTally, Tree, NF, POS_FEATURES,
};
use pogofish_search::players::Scripted;
use pogofish_search::principles::GreedyTwoPly;
use pogofish_search::retro::{decode, load_reachable, load_solved, Bitset, Board, Game, Value};
use pogofish_search::rng::SplitMix64;
use serde_json::{json, Value as Json};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

const THREADS: usize = 4;
const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };
const OPENING_PLIES: u32 = 4;
const MAX_PLIES: u32 = 1000;
/// Single tie-break rules sent to the arena (pre-set).
const SINGLE_RULES: usize = 6;
/// Longest learnt list, smallest gain for adding a criterion, tree depth,
/// smallest leaf (share of the training weight). Pre-set.
const LIST_LEN: usize = 3;
const LIST_MIN_GAIN: f64 = 0.001;
const TREE_DEPTH: usize = 3;
const TREE_MIN_LEAF: f64 = 0.01;
/// Height buckets (tallest stack): 2–3, 4–5, 6 and more.
const BUCKETS: [&str; 3] = ["max height 2-3", "max height 4-5", "max height 6+"];

fn bucket(h: u8) -> usize {
    match h {
        0..=3 => 0,
        4..=5 => 1,
        _ => 2,
    }
}

fn peak_rss_mib() -> f64 {
    let mut u: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut u) };
    // macOS reports bytes.
    u.ru_maxrss as f64 / (1024.0 * 1024.0)
}

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1).cloned())
}

fn need(args: &[String], name: &str) -> anyhow::Result<String> {
    arg(args, name).ok_or_else(|| anyhow::anyhow!("missing {name}"))
}

fn par_map<T: Send>(n: usize, job: impl Fn(usize) -> T + Sync) -> Vec<T> {
    let next = AtomicUsize::new(0);
    let out: Mutex<Vec<Option<T>>> = Mutex::new((0..n).map(|_| None).collect());
    std::thread::scope(|s| {
        for _ in 0..THREADS {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= n {
                    break;
                }
                let r = job(i);
                out.lock().unwrap()[i] = Some(r);
            });
        }
    });
    out.into_inner()
        .unwrap()
        .into_iter()
        .map(|x| x.unwrap())
        .collect()
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let t0 = Instant::now();
    let mut out = match args.first().map(String::as_str) {
        Some("pilot") => pilot(&args)?,
        Some("learn") => learn(&args)?,
        Some("arena") => arena(&args)?,
        Some("opening") => opening(&args)?,
        _ => bail!("usage: perfect pilot|learn|arena|opening …"),
    };
    out["seconds"] = json!(t0.elapsed().as_secs_f64());
    out["peak_rss_mib"] = json!(peak_rss_mib());
    out["threads"] = json!(THREADS);
    let text = serde_json::to_string_pretty(&out)?;
    match arg(&args, "--out") {
        Some(p) => {
            std::fs::write(&p, text + "\n")?;
            eprintln!("wrote {p}");
        }
        None => println!("{text}"),
    }
    Ok(())
}

fn mv(m: Move) -> String {
    notation::move_to_notation(m)
}

fn tuple_move(m: (u8, u8, u8)) -> Move {
    Move {
        from_cell: m.0,
        num_pieces: m.1,
        to_cell: m.2,
    }
}

struct Solved {
    g: Game,
    t: Vec<u16>,
    reach: Bitset,
}

impl Solved {
    fn load(dir: &str) -> anyhow::Result<Solved> {
        let g = Game::published();
        let dir = PathBuf::from(dir);
        let t = load_solved(&g, &dir)?;
        let reach = load_reachable(&g, &dir)?;
        Ok(Solved { g, t, reach })
    }

    fn value(&self, b: &Board) -> Value {
        decode(self.t[self.g.rank(b) as usize])
    }

    fn state_value(&self, s: &GameState) -> Value {
        self.value(&Board::from_state(s))
    }
}

// ----------------------------------------------------------- sampling

/// Uniform sample of `n` reachable positions of one class (won in 3 or
/// more plies, or drawn), skipping indices in `exclude`. Also returns the
/// number of draws from the index space, to estimate the class size.
fn sample_indices(
    sv: &Solved,
    won: bool,
    n: usize,
    seed: u64,
    exclude: &HashSet<u64>,
) -> (Vec<u64>, u64) {
    let mut rng = SplitMix64::new(seed);
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut tries = 0u64;
    while out.len() < n {
        tries += 1;
        let i = rng.next_u64() % sv.g.size();
        if !sv.reach.get(i) || exclude.contains(&i) || !seen.insert(i) {
            continue;
        }
        let ok = match decode(sv.t[i as usize]) {
            Value::Win(d) => won && d >= 3,
            Value::Draw => !won,
            _ => false,
        };
        if ok {
            out.push(i);
        } else {
            seen.remove(&i);
        }
    }
    (out, tries)
}

fn build_sample(sv: &Solved, idx: u64) -> Sample {
    let b = sv.g.unrank(idx);
    let state = b.to_state();
    let parent = sv.value(&b);
    let mover = state.to_move();
    let moves = legal_moves(&state);
    let mut rows = Vec::with_capacity(moves.len());
    let mut keeps = Vec::with_capacity(moves.len());
    for &m in &moves {
        let next = apply_move(&state, m).expect("legal");
        rows.push(row_of(&state, m, &next));
        keeps.push(keeps_value(parent, sv.state_value(&next)).expect("won or drawn"));
    }
    Sample {
        won: matches!(parent, Value::Win(_)),
        max_height: *b.h.iter().max().unwrap(),
        before: position_row(&state, mover),
        state,
        moves,
        rows,
        keeps,
    }
}

fn build_samples(sv: &Solved, idx: &[u64]) -> Vec<Sample> {
    par_map(idx.len(), |i| build_sample(sv, idx[i]))
}

fn pilot(args: &[String]) -> anyhow::Result<Json> {
    let per: usize = arg(args, "--per-class").map_or(Ok(200), |s| s.parse())?;
    let t0 = Instant::now();
    let sv = Solved::load(&args[1])?;
    let load = t0.elapsed().as_secs_f64();
    let t1 = Instant::now();
    let (w, tw) = sample_indices(&sv, true, per, 1, &HashSet::new());
    let (d, td) = sample_indices(&sv, false, per, 2, &HashSet::new());
    let draw = t1.elapsed().as_secs_f64();
    let t2 = Instant::now();
    let sw = build_samples(&sv, &w);
    let sd = build_samples(&sv, &d);
    let build = t2.elapsed().as_secs_f64();
    let moves: usize = sw.iter().chain(&sd).map(|s| s.rows.len()).sum();
    Ok(json!({
        "per_class": per, "load_seconds": load, "index_draws_won": tw, "index_draws_drawn": td,
        "sampling_seconds": draw, "feature_seconds": build, "moves": moves,
        "seconds_per_position": build / (2 * per) as f64,
        "bytes_per_move_row": std::mem::size_of::<Row>(),
    }))
}

// ------------------------------------------------------------- learn

fn tally_json(used: usize, t: &[ShareTally]) -> Json {
    let rows: Vec<Json> = t
        .iter()
        .enumerate()
        .map(|(f, x)| {
            let (p, ci) = x.share();
            json!({"feature": feature_name(f), "keeping_higher": x.higher, "keeping_lower": x.lower,
                   "equal": x.equal, "share_higher": p, "ci95": ci})
        })
        .collect();
    json!({"positions_used": used, "rows": rows})
}

fn crit_json(c: &[Criterion]) -> Json {
    json!(c.iter().map(|c| json!({"feature": feature_name(c.feature), "direction": if c.sign > 0.0 {"up"} else {"down"}, "reads": c.describe()})).collect::<Vec<_>>())
}

/// Mean keep rate of a move chooser over samples, per class, per height
/// bucket within class, and the mean of the two classes; 95 % intervals over
/// positions.
fn rate_json(samples: &[Sample], rate: &[f64]) -> Json {
    let stat = |pick: &dyn Fn(&Sample) -> bool| -> Json {
        let xs: Vec<f64> = samples
            .iter()
            .zip(rate)
            .filter(|(s, _)| pick(s))
            .map(|(_, &r)| r)
            .collect();
        let n = xs.len() as f64;
        if n < 2.0 {
            return json!({"positions": xs.len()});
        }
        let m = xs.iter().sum::<f64>() / n;
        let v = xs.iter().map(|x| (x - m).powi(2)).sum::<f64>() / (n - 1.0);
        let h = 1.96 * (v / n).sqrt();
        json!({"positions": xs.len(), "rate": m, "ci95": [m - h, m + h]})
    };
    let won = stat(&|s| s.won);
    let drawn = stat(&|s| !s.won);
    let mean = (won["rate"].as_f64().unwrap_or(f64::NAN)
        + drawn["rate"].as_f64().unwrap_or(f64::NAN))
        / 2.0;
    let mut by = BTreeMap::new();
    for (b, name) in BUCKETS.iter().enumerate() {
        by.insert(
            format!("won, {name}"),
            stat(&|s| s.won && bucket(s.max_height) == b),
        );
        by.insert(
            format!("drawn, {name}"),
            stat(&|s| !s.won && bucket(s.max_height) == b),
        );
    }
    json!({"won": won, "drawn": drawn, "mean_of_classes": mean, "by_height": by})
}

/// The keep rate of `chooser` (tied best moves) in each sample.
fn rates(samples: &[Sample], chooser: impl Fn(&Sample) -> Vec<Move> + Sync) -> Vec<f64> {
    par_map(samples.len(), |i| {
        let s = &samples[i];
        let set: Vec<usize> = chooser(s)
            .into_iter()
            .map(|m| s.moves.iter().position(|&x| x == m).expect("a legal move"))
            .collect();
        keep_rate(&set, &s.keeps)
    })
}

/// The table's own choice, recomputed from boards (not from the samples'
/// labels): moves to a loss for the opponent from a win, to a non-win from a
/// draw. `anti` takes the complement, or every move when every move keeps
/// the value (its rate must be the share of such positions).
fn oracle_moves(sv: &Solved, s: &Sample, anti: bool) -> Vec<Move> {
    let b = Board::from_state(&s.state);
    let won = matches!(sv.value(&b), Value::Win(_));
    let all = sv.g.moves(&b);
    let picked: Vec<Move> = all
        .iter()
        .filter(|&&m| {
            let v = sv.value(&b.moved(m.0 as usize, m.1, m.2 as usize));
            let good = if won {
                matches!(v, Value::Loss(_))
            } else {
                !matches!(v, Value::Win(_))
            };
            good != anti
        })
        .map(|&m| tuple_move(m))
        .collect();
    if picked.is_empty() {
        all.into_iter().map(tuple_move).collect()
    } else {
        picked
    }
}

fn class_weights(samples: &[&Sample]) -> Vec<f64> {
    let nw = samples.iter().filter(|s| s.won).count().max(1) as f64;
    let nd = samples.iter().filter(|s| !s.won).count().max(1) as f64;
    samples
        .iter()
        .map(|s| if s.won { 0.5 / nw } else { 0.5 / nd })
        .collect()
}

fn fit_tree(samples: &[&Sample]) -> Tree {
    let pw = class_weights(samples);
    let mut x = Vec::new();
    let mut y = Vec::new();
    let mut w = Vec::new();
    for (s, &p) in samples.iter().zip(&pw) {
        for (r, &k) in s.rows.iter().zip(&s.keeps) {
            x.push(tree_input(&s.before, r));
            y.push(k);
            w.push(p / s.rows.len() as f64);
        }
    }
    let total: f64 = w.iter().sum();
    Tree::fit(&x, &y, &w, TREE_DEPTH, TREE_MIN_LEAF * total)
}

fn learn(args: &[String]) -> anyhow::Result<Json> {
    let n_train: usize = need(args, "--train")?.parse()?;
    let n_test: usize = need(args, "--test")?.parse()?;
    let game_count: usize = need(args, "--games")?.parse()?;
    let seed: u64 = need(args, "--seed")?.parse()?;
    let players_out = need(args, "--players")?;
    let t0 = Instant::now();
    let sv = Solved::load(&args[1])?;
    let load_s = t0.elapsed().as_secs_f64();

    let t1 = Instant::now();
    let none = HashSet::new();
    let (tr_w, draws_w) = sample_indices(&sv, true, n_train, seed, &none);
    let (tr_d, draws_d) = sample_indices(&sv, false, n_train, seed + 1, &none);
    let train_set: HashSet<u64> = tr_w.iter().chain(&tr_d).copied().collect();
    let (te_w, _) = sample_indices(&sv, true, n_test, seed + 2, &train_set);
    let (te_d, _) = sample_indices(&sv, false, n_test, seed + 3, &train_set);
    let mut train = build_samples(&sv, &tr_w);
    train.extend(build_samples(&sv, &tr_d));
    let mut test = build_samples(&sv, &te_w);
    test.extend(build_samples(&sv, &te_d));
    let sample_s = t1.elapsed().as_secs_f64();
    eprintln!("samples built in {sample_s:.1} s");

    let t2 = Instant::now();
    let refs: Vec<&Sample> = train.iter().collect();
    let won: Vec<&Sample> = train.iter().filter(|s| s.won).collect();
    let drawn: Vec<&Sample> = train.iter().filter(|s| !s.won).collect();

    // (a) per-feature shares.
    let mut shares = json!({});
    for (label, set) in [("won", &won), ("drawn", &drawn)] {
        for ties in [false, true] {
            let (used, t) = feature_shares(set, ties);
            let key = format!("{label}_{}", if ties { "greedy_ties" } else { "all_moves" });
            shares[key] = tally_json(used, &t);
        }
        for (b, name) in BUCKETS.iter().enumerate() {
            let sub: Vec<&Sample> = set
                .iter()
                .filter(|s| bucket(s.max_height) == b)
                .copied()
                .collect();
            let (used, t) = feature_shares(&sub, true);
            shares[format!("{label}_greedy_ties, {name}")] = tally_json(used, &t);
        }
    }
    // Direction of each feature as a tie-break: the side of 0.5 of the mean
    // of the two classes' shares (greedy ties).
    let (_, tw) = feature_shares(&won, true);
    let (_, td) = feature_shares(&drawn, true);
    let pw = class_weights(&refs);
    let greedy = vec![Criterion {
        feature: 0,
        sign: 1.0,
    }];
    let greedy_train = list_score(&greedy, &refs, &pw);
    let mut singles: Vec<(f64, Criterion, f64)> = (1..NF)
        .filter_map(|f| {
            let s = (tw[f].share().0 + td[f].share().0) / 2.0;
            if s.is_nan() || (s - 0.5).abs() < 1e-9 {
                return None;
            }
            let c = Criterion {
                feature: f,
                sign: if s > 0.5 { 1.0 } else { -1.0 },
            };
            Some((list_score(&[greedy[0], c], &refs, &pw), c, s))
        })
        .collect();
    singles.sort_by(|a, b| b.0.total_cmp(&a.0));

    // (b) ranked lists and trees.
    let mut lists = Vec::new();
    for (label, set) in [("pooled", &refs), ("won", &won), ("drawn", &drawn)] {
        let w = class_weights(set);
        let (base, steps) = learn_rule_list(set, &w, LIST_LEN, LIST_MIN_GAIN);
        lists.push((label, base, steps));
    }
    let tree = fit_tree(&refs);
    let tree_won = fit_tree(&won);
    let tree_drawn = fit_tree(&drawn);
    let learn_s = t2.elapsed().as_secs_f64();

    // Players.
    let mut players: Vec<(String, PolicyPlayer)> = Vec::new();
    let pp = |name: String, policy: Policy| PolicyPlayer { name, policy };
    for (_, c, _) in singles.iter().take(SINGLE_RULES) {
        let name = format!("greedy, then {}", c.describe());
        let mirror = format!("greedy, then {}", c.negated().describe());
        players.push(("rule".into(), pp(name, Policy::List(vec![greedy[0], *c]))));
        players.push((
            "mirror".into(),
            pp(mirror, Policy::List(vec![greedy[0], c.negated()])),
        ));
    }
    let mut lists_seen: Vec<Vec<Criterion>> = Vec::new();
    for (label, _, steps) in &lists {
        let c: Vec<Criterion> = steps.iter().map(|s| s.criterion).collect();
        // A list learnt twice (e.g. pooled and won-only) is played once.
        if lists_seen.contains(&c) {
            continue;
        }
        lists_seen.push(c.clone());
        let neg: Vec<Criterion> = c.iter().map(|c| c.negated()).collect();
        players.push((
            "list".into(),
            pp(
                format!(
                    "list ({label}): {}",
                    c.iter()
                        .map(|c| c.describe())
                        .collect::<Vec<_>>()
                        .join(", then ")
                ),
                Policy::List(c),
            ),
        ));
        players.push((
            "mirror".into(),
            pp(format!("negated list ({label})"), Policy::List(neg)),
        ));
    }
    players.push((
        "tree".into(),
        pp(
            "tree (pooled, depth 3)".into(),
            Policy::Tree {
                tree: tree.clone(),
                negated: false,
            },
        ),
    ));
    players.push((
        "mirror".into(),
        pp(
            "negated tree (pooled)".into(),
            Policy::Tree {
                tree: tree.clone(),
                negated: true,
            },
        ),
    ));
    let pj: Vec<Json> = players
        .iter()
        .map(|(role, p)| json!({"role": role, "player": p}))
        .collect();
    std::fs::write(&players_out, serde_json::to_string_pretty(&pj)? + "\n")?;
    eprintln!("wrote {players_out}");

    // Held-out scores: uniform positions, and positions met in greedy games.
    let t3 = Instant::now();
    let games = game_positions(&sv, game_count, seed + 4);
    let held = score_players(&sv, &test, &players);
    let held_games = score_players(&sv, &games, &players);
    let held_s = t3.elapsed().as_secs_f64();

    let single_json: Vec<Json> = singles
        .iter()
        .map(|(sc, c, s)| json!({"criterion": c.describe(), "pooled_share_greedy_ties": s, "train_score_after_greedy": sc}))
        .collect();
    let list_json: Vec<Json> = lists
        .iter()
        .map(|(label, base, steps)| {
            json!({"trained_on": label, "uniform_pick_score": base,
                   "steps": steps.iter().map(|s| json!({"reads": s.criterion.describe(), "train_score": s.train_score})).collect::<Vec<_>>(),
                   "criteria": crit_json(&steps.iter().map(|s| s.criterion).collect::<Vec<_>>())})
        })
        .collect();
    let class_size = |draws: u64, n: usize| sv.g.size() as f64 * n as f64 / draws as f64;
    Ok(json!({
        "seed": seed, "train_per_class": n_train, "test_per_class": n_test,
        "estimated_class_size": {"won_in_3_or_more": class_size(draws_w, n_train), "drawn": class_size(draws_d, n_train)},
        "train_height_buckets": BUCKETS.iter().enumerate().map(|(b, n)| json!({"bucket": n,
            "won": won.iter().filter(|s| bucket(s.max_height) == b).count(),
            "drawn": drawn.iter().filter(|s| bucket(s.max_height) == b).count()})).collect::<Vec<_>>(),
        "moves_per_position": {"train": train.iter().map(|s| s.rows.len()).sum::<usize>() as f64 / train.len() as f64},
        "train_keep_share_of_moves": {"won": won.iter().map(|s| keep_rate(&(0..s.rows.len()).collect::<Vec<_>>(), &s.keeps)).sum::<f64>() / won.len() as f64,
                                       "drawn": drawn.iter().map(|s| keep_rate(&(0..s.rows.len()).collect::<Vec<_>>(), &s.keeps)).sum::<f64>() / drawn.len() as f64},
        "greedy_train_score": greedy_train,
        "a_feature_shares": shares,
        "single_tie_breaks": single_json,
        "b_lists": list_json,
        "b_tree_pooled": {"leaves": tree.describe(), "tree": tree},
        "b_tree_won": tree_won.describe(),
        "b_tree_drawn": tree_drawn.describe(),
        "held_out": held,
        "game_positions": {"games": game_count, "positions": games.len(), "won": games.iter().filter(|s| s.won).count(), "players": held_games},
        "timings": {"load": load_s, "samples": sample_s, "learning": learn_s, "held_out_scoring": held_s},
    }))
}

/// The keep rate of every player on `set`, with the controls first: the
/// table oracle (must be 1) and its complement (must equal the share of
/// positions where every move keeps the value).
fn score_players(sv: &Solved, set: &[Sample], players: &[(String, PolicyPlayer)]) -> Vec<Json> {
    let mut out = Vec::new();
    let mut push =
        |name: &str, r: Vec<f64>| out.push(json!({"player": name, "rates": rate_json(set, &r)}));
    push(
        "control: table oracle (expect 1)",
        rates(set, |s| oracle_moves(sv, s, false)),
    );
    let all_keep: Vec<f64> = set
        .iter()
        .map(|s| s.keeps.iter().all(|&k| k) as u8 as f64)
        .collect();
    push(
        "control: positions where every move keeps the value",
        all_keep,
    );
    push(
        "control: anti-oracle (expect the line above)",
        rates(set, |s| oracle_moves(sv, s, true)),
    );
    let random = PolicyPlayer {
        name: String::new(),
        policy: Policy::Random,
    };
    push(
        "random",
        rates(set, |s| random.best_moves(&s.state, &RULES)),
    );
    push("greedy", rates(set, |s| greedy_best(&s.state)));
    push(
        "greedy-2ply",
        rates(set, |s| GreedyTwoPly.best_moves(&s.state, &RULES)),
    );
    for (_, p) in players {
        push(&p.name, rates(set, |s| p.best_moves(&s.state, &RULES)));
    }
    out
}

/// Won (in 3 or more) and drawn positions met in greedy-vs-greedy games
/// under `lc1-2` from random 4-ply openings (the arena's protocol), each
/// distinct position once, collected only until the game's first repeated
/// position (so the uncapped value is the `lc1-2` value for won positions:
/// v3-solve, section e).
fn game_positions(sv: &Solved, games: usize, seed: u64) -> Vec<Sample> {
    let mut seen = HashSet::new();
    let mut idx = Vec::new();
    let mut rng = SplitMix64::new(seed);
    for _ in 0..games {
        let (mut s, _) = random_opening(&RULES, OPENING_PLIES, &mut rng).expect("an opening");
        let mut in_game = HashSet::new();
        while is_terminal(&s, &RULES).is_none() && in_game.insert(s.key()) {
            let i = sv.g.rank(&Board::from_state(&s));
            let v = decode(sv.t[i as usize]);
            let wanted = matches!(v, Value::Win(d) if d >= 3) || v == Value::Draw;
            if wanted && seen.insert(i) {
                idx.push(i);
            }
            let m = Scripted::Greedy.choose(&s, &RULES, &mut rng);
            s = apply_move_under(&s, m, &RULES).expect("legal");
        }
    }
    build_samples(sv, &idx)
}

/// Greedy's tied best set (the list [top_diff up], which reproduces greedy
/// move for move: `perfect::tests::top_diff_list_reproduces_greedy`).
fn greedy_best(s: &GameState) -> Vec<Move> {
    PolicyPlayer {
        name: "greedy".into(),
        policy: Policy::List(vec![Criterion {
            feature: 0,
            sign: 1.0,
        }]),
    }
    .best_moves(s, &RULES)
}

// ------------------------------------------------------------- arena

/// Perfect play of the uncapped game, read from the table: from a win the
/// fastest win, from a draw a uniform pick among the draw-keeping moves,
/// from a loss the longest defence. Under `lc1-2` it first takes a move that
/// wins at once and avoids one that loses at once (repetition), as the
/// scripted players do. A reference, not a principle.
struct Perfect<'a> {
    sv: &'a Solved,
}

impl Agent for Perfect<'_> {
    fn name(&self) -> String {
        "perfect (uncapped table)".into()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        let mover = state.to_move();
        let mut wins = Vec::new();
        let mut losing = Vec::new();
        let mut quiet = Vec::new();
        for m in legal_moves(state) {
            let next = apply_move(state, m).expect("legal");
            match is_terminal(&next, rules) {
                Some(o) if o.winner() == Some(mover) => wins.push(m),
                Some(_) => losing.push(m),
                None => quiet.push((m, self.sv.state_value(&next))),
            }
        }
        if !wins.is_empty() {
            return wins[rng.below(wins.len())];
        }
        if quiet.is_empty() {
            return losing[rng.below(losing.len())];
        }
        // Score from the mover's side: a child lost for the opponent in x is
        // best when x is small; a child won by the opponent in x is least bad
        // when x is large.
        let score = |v: Value| -> i32 {
            match v {
                Value::Loss(x) => 100_000 - x as i32,
                Value::Draw => 0,
                Value::Win(x) => -100_000 + x as i32,
                _ => i32::MIN,
            }
        };
        let best = quiet.iter().map(|&(_, v)| score(v)).max().unwrap();
        let tied: Vec<Move> = quiet
            .iter()
            .filter(|&&(_, v)| score(v) == best)
            .map(|&(m, _)| m)
            .collect();
        tied[rng.below(tied.len())]
    }
}

fn arena(args: &[String]) -> anyhow::Result<Json> {
    let pairs: u32 = need(args, "--pairs")?.parse()?;
    let seed: u64 = need(args, "--seed")?.parse()?;
    let text = std::fs::read_to_string(need(args, "--players")?)?;
    let entries: Vec<Json> = serde_json::from_str(&text)?;
    let sv = match arg(args, "--table") {
        Some(d) => Some(Solved::load(&d)?),
        None => None,
    };
    enum P {
        Greedy,
        Random,
        TwoPly,
        Perfect,
        Policy(PolicyPlayer),
    }
    let greedy_list = PolicyPlayer {
        name: "list [top_diff up] (greedy)".into(),
        policy: Policy::List(vec![Criterion {
            feature: 0,
            sign: 1.0,
        }]),
    };
    let negated = PolicyPlayer {
        name: "list [top_diff down] (negated greedy)".into(),
        policy: Policy::List(vec![Criterion {
            feature: 0,
            sign: -1.0,
        }]),
    };
    let mut matches: Vec<(String, P)> = vec![
        ("control: greedy vs greedy (expect 0.5)".into(), P::Greedy),
        (
            "control: list [top_diff up] vs greedy (expect 0.5, identical)".into(),
            P::Policy(greedy_list),
        ),
        (
            "control: negated greedy vs greedy (expect clearly < 0.5)".into(),
            P::Policy(negated),
        ),
        (
            "control: random vs greedy (expect clearly < 0.5)".into(),
            P::Random,
        ),
        (
            "power reference: two-ply greedy vs greedy".into(),
            P::TwoPly,
        ),
    ];
    if sv.is_some() {
        matches.push((
            "reference: perfect uncapped play vs greedy".into(),
            P::Perfect,
        ));
    }
    for e in &entries {
        let p: PolicyPlayer = serde_json::from_value(e["player"].clone())?;
        matches.push((e["role"].as_str().unwrap_or("?").to_string(), P::Policy(p)));
    }
    let cfg = ArenaConfig::new(RULES, pairs, OPENING_PLIES, MAX_PLIES, seed);
    let results = par_map(matches.len(), |i| {
        let t = Instant::now();
        let mut a: Box<dyn Agent + '_> = match &matches[i].1 {
            P::Greedy => Box::new(Scripted::Greedy),
            P::Random => Box::new(Scripted::Random),
            P::TwoPly => Box::new(GreedyTwoPly),
            P::Perfect => Box::new(Perfect {
                sv: sv.as_ref().unwrap(),
            }),
            P::Policy(p) => Box::new(p.clone()),
        };
        let r = run_match(a.as_mut(), &mut Scripted::Greedy, &cfg).expect("arena");
        eprintln!(
            "{:<60} {:.3} [{:.3}, {:.3}]",
            r.player_a, r.score, r.ci95[0], r.ci95[1]
        );
        json!({"role": matches[i].0, "player": r.player_a, "score": r.score, "ci95": r.ci95,
               "scored_pairs": r.scored_pairs, "unfinished": r.a.unfinished,
               "distinct_openings": r.distinct_openings, "distinct_games": r.distinct_games,
               "white_score": r.white_score, "seconds": t.elapsed().as_secs_f64()})
    });
    Ok(
        json!({"rules": RULES.to_string(), "pairs": pairs, "seed": seed, "opening_plies": OPENING_PLIES,
              "max_plies": MAX_PLIES, "opponent": "greedy", "matches": results}),
    )
}

// ----------------------------------------------------------- opening

/// Left-right reflection, the start position's only symmetry.
const MIRROR: [u8; NUM_CELLS] = [2, 1, 0, 5, 4, 3, 8, 7, 6];

fn mirror_move(m: Move) -> Move {
    Move {
        from_cell: MIRROR[m.from_cell as usize],
        num_pieces: m.num_pieces,
        to_cell: MIRROR[m.to_cell as usize],
    }
}

struct OpeningNode {
    paths: f64,
    parent: Option<(u64, Move)>,
}

/// One legal move of an opening position, from the mover's side.
struct Scored {
    m: Move,
    child: Board,
    keeps: bool,
    /// Plies to the mover's forced loss, counting this move (losing moves only).
    loses_in: Option<u16>,
    greedy_best: bool,
    capture: bool,
    centre: bool,
    advance: f32,
    pieces: f32,
}

fn score_moves(sv: &Solved, b: &Board) -> Vec<Scored> {
    let s = b.to_state();
    let moves: Vec<Move> = sv.g.moves(b).into_iter().map(tuple_move).collect();
    let children: Vec<Board> = moves
        .iter()
        .map(|m| b.moved(m.from_cell as usize, m.num_pieces, m.to_cell as usize))
        .collect();
    let td: Vec<i32> = children
        .iter()
        .map(|c| c.tops(b.red_to_move) as i32 - c.tops(!b.red_to_move) as i32)
        .collect();
    let best = *td.iter().max().unwrap();
    let cap = feature_index("lands_on_opp").unwrap() - POS_FEATURES;
    let adv = feature_index("advance").unwrap() - POS_FEATURES;
    moves
        .iter()
        .zip(children)
        .zip(td)
        .map(|((&m, child), t)| {
            let v = sv.value(&child);
            let f = move_features(&s, m);
            Scored {
                m,
                child,
                keeps: keeps_value(Value::Draw, v).unwrap(),
                loses_in: match v {
                    Value::Win(d) => Some(d + 1),
                    _ => None,
                },
                greedy_best: t == best,
                capture: f[cap] > 0.0,
                centre: m.to_cell == 4,
                advance: f[adv],
                pieces: f[0],
            }
        })
        .collect()
}

#[derive(Default)]
struct Cat {
    moves: u64,
    losing: u64,
    loss_plies: Vec<u16>,
}

impl Cat {
    fn add(&mut self, s: &Scored) {
        self.moves += 1;
        if let Some(d) = s.loses_in {
            self.losing += 1;
            self.loss_plies.push(d);
        }
    }

    fn json(&mut self) -> Json {
        self.loss_plies.sort_unstable();
        let q = |p: f64| {
            self.loss_plies
                .get(((self.loss_plies.len() as f64 - 1.0) * p).round() as usize)
        };
        json!({"moves": self.moves, "losing": self.losing,
               "losing_share": self.losing as f64 / self.moves.max(1) as f64,
               "loses_in_plies_min_median_max": [q(0.0), q(0.5), q(1.0)]})
    }
}

fn canonical(g: &Game, b: &Board) -> u64 {
    g.rank(b).min(g.rank(&b.permuted(&MIRROR)))
}

fn opening(args: &[String]) -> anyhow::Result<Json> {
    let plies: usize = need(args, "--plies")?.parse()?;
    let guide_depth: usize = arg(args, "--guide-depth").map_or(Ok(4), |s| s.parse())?;
    let sv = Solved::load(&args[1])?;
    let g = &sv.g;
    let players: Vec<PolicyPlayer> = match arg(args, "--players") {
        Some(p) => {
            let v: Vec<Json> = serde_json::from_str(&std::fs::read_to_string(p)?)?;
            v.iter()
                .filter(|e| e["role"] != "mirror")
                .map(|e| serde_json::from_value(e["player"].clone()))
                .collect::<Result<_, _>>()?
        }
        None => Vec::new(),
    };
    let start = g.start();
    if sv.value(&start) != Value::Draw {
        bail!("the start is not a draw in this table");
    }
    let mut levels: Vec<HashMap<u64, OpeningNode>> = vec![HashMap::new()];
    levels[0].insert(
        g.rank(&start),
        OpeningNode {
            paths: 1.0,
            parent: None,
        },
    );
    let mut per_ply = Vec::new();
    let mut narrow: Vec<(usize, u64)> = Vec::new();
    let mut player_rates: Vec<Vec<f64>> = vec![Vec::new(); players.len() + 2];
    for p in 0..plies {
        let mut next: HashMap<u64, OpeningNode> = HashMap::new();
        let mut hist: BTreeMap<usize, u64> = BTreeMap::new();
        let mut cats: BTreeMap<&str, Cat> = BTreeMap::new();
        let (mut legal, mut keeping) = (0u64, 0u64);
        let mut keep_feats = [0u64; 6]; // home-row stays, advances, captures, centre, 1/2/3-piece counted below
        let mut keep_pieces = [0u64; 4];
        let mut prates = vec![0.0; players.len() + 2];
        let mut keys: Vec<u64> = levels[p].keys().copied().collect();
        keys.sort_unstable();
        for &k in &keys {
            let paths = levels[p][&k].paths;
            let b = g.unrank(k);
            let sc = score_moves(&sv, &b);
            let kept: Vec<&Scored> = sc.iter().filter(|s| s.keeps).collect();
            *hist.entry(kept.len()).or_default() += 1;
            if kept.len() == 1 {
                narrow.push((p, k));
            }
            legal += sc.len() as u64;
            keeping += kept.len() as u64;
            for s in &sc {
                cats.entry("all moves").or_default().add(s);
                if s.greedy_best {
                    cats.entry("greedy's choice (most tops)")
                        .or_default()
                        .add(s);
                }
                if s.capture {
                    cats.entry("captures a top").or_default().add(s);
                }
                if s.centre {
                    cats.entry("to the centre").or_default().add(s);
                }
                if s.advance > 0.0 {
                    cats.entry("advances").or_default().add(s);
                } else if s.advance == 0.0 {
                    cats.entry("sideways").or_default().add(s);
                } else {
                    cats.entry("backwards").or_default().add(s);
                }
                if s.keeps {
                    keep_feats[0] += (s.advance == 0.0) as u64;
                    keep_feats[1] += (s.advance > 0.0) as u64;
                    keep_feats[2] += s.capture as u64;
                    keep_feats[3] += s.centre as u64;
                    keep_pieces[s.pieces as usize] += 1;
                    let c = next.entry(g.rank(&s.child)).or_insert(OpeningNode {
                        paths: 0.0,
                        parent: Some((k, s.m)),
                    });
                    c.paths += paths;
                }
            }
            // Players' draw-keeping rate on this position.
            let st = b.to_state();
            let keeps_of = |ms: Vec<Move>| -> f64 {
                ms.iter()
                    .filter(|m| sc.iter().any(|s| s.m == **m && s.keeps))
                    .count() as f64
                    / ms.len() as f64
            };
            prates[0] += kept.len() as f64 / sc.len() as f64;
            prates[1] += keeps_of(greedy_best(&st));
            for (i, pl) in players.iter().enumerate() {
                prates[i + 2] += keeps_of(pl.best_moves(&st, &RULES));
            }
        }
        let n = keys.len() as f64;
        for (i, r) in prates.iter().enumerate() {
            player_rates[i].push(r / n);
        }
        let canon: HashSet<u64> = keys.iter().map(|&k| canonical(g, &g.unrank(k))).collect();
        let paths: f64 = levels[p].values().map(|x| x.paths).sum();
        per_ply.push(json!({
            "ply": p + 1, "to_move": if p % 2 == 0 { "White" } else { "Red" },
            "positions": keys.len(), "positions_up_to_mirror": canon.len(), "lines_reaching_them": paths,
            "legal_moves": legal, "draw_keeping_moves": keeping,
            "positions_by_number_of_draw_keeping_moves": hist,
            "draw_keeping_moves_that": {"stay_on_their_row": keep_feats[0], "advance": keep_feats[1],
                "capture_a_top": keep_feats[2], "go_to_the_centre": keep_feats[3],
                "move_1_2_3_pieces": &keep_pieces[1..]},
            "categories": cats.iter_mut().map(|(k, c)| (k.to_string(), c.json())).collect::<BTreeMap<_, _>>(),
        }));
        levels.push(next);
        eprintln!("ply {} done: {} positions", p + 1, keys.len());
    }

    // Narrowest points: positions with a single draw-keeping move, first
    // plies first, one per mirror pair.
    let path_to = |p: usize, k: u64| -> Vec<String> {
        let mut out = Vec::new();
        let (mut p, mut k) = (p, k);
        while let Some((parent, m)) = levels[p][&k].parent {
            out.push(mv(m));
            k = parent;
            p -= 1;
        }
        out.reverse();
        out
    };
    let mut narrow_json = Vec::new();
    let mut seen = HashSet::new();
    let mut narrow_counts: BTreeMap<usize, u64> = BTreeMap::new();
    for &(p, k) in &narrow {
        *narrow_counts.entry(p + 1).or_default() += 1;
        let b = g.unrank(k);
        if !seen.insert(canonical(g, &b)) || narrow_json.len() >= 24 {
            continue;
        }
        let sc = score_moves(&sv, &b);
        let only = sc.iter().find(|s| s.keeps).unwrap();
        let mut alt: Vec<(u16, String)> = sc
            .iter()
            .filter_map(|s| s.loses_in.map(|d| (d, mv(s.m))))
            .collect();
        alt.sort();
        narrow_json.push(json!({
            "ply": p + 1, "line": path_to(p, k), "diagram": b.diagram(), "only_move": mv(only.m),
            "only_move_is_greedy_choice": only.greedy_best, "legal_moves": sc.len(),
            "fastest_losing_alternatives": alt.iter().take(3).map(|(d, m)| json!({"move": m, "loses_in_plies": d})).collect::<Vec<_>>(),
            "slowest_losing_alternative": alt.last().map(|(d, m)| json!({"move": m, "loses_in_plies": d})),
        }));
    }

    // The guide: the draw-keeping tree up to `guide_depth` plies, one
    // position per mirror pair, as indented lines.
    let mut guide = Vec::new();
    guide_lines(&sv, &start, 0, guide_depth, &mut guide, &mut HashSet::new());

    let mut names = vec![
        "share of draw-keeping moves (uniform pick)".to_string(),
        "greedy".to_string(),
    ];
    names.extend(players.iter().map(|p| p.name.clone()));
    Ok(json!({
        "plies": plies, "per_ply": per_ply,
        "single_draw_keeping_move_positions_per_ply": narrow_counts,
        "narrowest_points": narrow_json,
        "guide_depth": guide_depth, "guide": guide,
        "players_draw_keeping_rate_by_ply": names.iter().zip(&player_rates).map(|(n, r)| json!({"player": n, "rate_by_ply": r})).collect::<Vec<_>>(),
    }))
}

/// Indented lines: at each position, the number of draw-keeping moves out of
/// the legal ones, then each draw-keeping move (mirror images merged) with
/// its subtree. A position met again (by transposition) is not expanded twice.
fn guide_lines(
    sv: &Solved,
    b: &Board,
    depth: usize,
    max: usize,
    out: &mut Vec<String>,
    done: &mut HashSet<u64>,
) {
    if depth >= max {
        return;
    }
    let sc = score_moves(sv, b);
    let kept: Vec<&Scored> = sc.iter().filter(|s| s.keeps).collect();
    let pad = "  ".repeat(depth);
    let side = if b.red_to_move { "Red" } else { "White" };
    let fastest = sc.iter().filter_map(|s| s.loses_in).min();
    out.push(format!(
        "{pad}{side}: {} of {} moves keep the draw{}",
        kept.len(),
        sc.len(),
        fastest.map_or(String::new(), |d| format!(
            " (fastest loss among the others: {d} plies)"
        ))
    ));
    let mut shown: HashSet<u64> = HashSet::new();
    let symmetric = sv.g.rank(b) == sv.g.rank(&b.permuted(&MIRROR));
    for s in kept {
        let c = canonical(&sv.g, &s.child);
        if symmetric && !shown.insert(c) {
            continue;
        }
        let twin = if symmetric && mirror_move(s.m) != s.m {
            format!(" (or its mirror {})", mv(mirror_move(s.m)))
        } else {
            String::new()
        };
        let key = sv.g.rank(&s.child);
        if !done.insert(key) {
            out.push(format!(
                "{pad}- {}{twin}: transposes to a position above",
                mv(s.m)
            ));
            continue;
        }
        out.push(format!("{pad}- {}{twin}", mv(s.m)));
        guide_lines(sv, &s.child, depth + 1, max, out, done);
    }
}
