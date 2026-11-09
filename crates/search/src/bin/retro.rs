//! Round 3: solve the published game (uncapped) by retrograde analysis.
//! See `docs/experiments/v3-solve.md`.
//!
//! ```text
//! retro reach  <dir> [--threads N]        reachable set from the start (BFS)
//! retro pilot  <dir> [--threads N]        time a slice of each solver phase
//! retro solve  <dir> [--threads N]        resumable solve (Ctrl+C saves)
//! retro check  <dir> [--threads N] --out <json>   controls
//! retro answers <dir> [--threads N] --out <json>  results
//! retro negamax <dir> [--max-dist 9 --per-bucket 100 --draw-depth 7 --shift 0]  deeper independent search
//! retro draws  <dir> [--threads N] --out <json>   the draw region around the start
//! ```

use anyhow::bail;
use pogofish_engine::symmetry::verified_symmetries;
use pogofish_engine::{apply_move, base_outcome, legal_moves, notation, GameState, Move};
use pogofish_search::retro::{
    as_atomic, bfs, check_consistency, check_symmetry, decode, finalize, init_table, load_reachable,
    load_solved, load_table, par_range, principle_comparison, propagate_level, save_table, Bitset,
    Board, Game, Status, Value, DIST_MASK, DRAW, LOSS, WIN,
};
use pogofish_search::interrupt;
use pogofish_search::rng::SplitMix64;
use serde_json::{json, Value as Json};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Instant;

/// Save a checkpoint at the first level boundary after this many seconds.
const SAVE_EVERY_SECS: f64 = 300.0;

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

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 2 {
        bail!("usage: retro reach|pilot|solve|check|answers <dir> [--threads N] [--out FILE]");
    }
    let dir = PathBuf::from(&args[1]);
    std::fs::create_dir_all(&dir)?;
    let threads: usize = arg(&args, "--threads").map_or(Ok(4), |s| s.parse())?;
    let g = Game::published();
    let t0 = Instant::now();
    let out = match args[0].as_str() {
        "reach" => reach(&g, &dir, threads)?,
        "pilot" => pilot(&g, threads)?,
        "solve" => solve(&g, &dir, threads)?,
        "check" => check(&g, &dir, threads)?,
        "answers" => answers(&g, &dir, threads)?,
        "draws" => draws(&g, &dir, threads)?,
        "negamax" => negamax(&g, &dir, threads, &args)?,
        other => bail!("unknown command {other}"),
    };
    let mut out = out;
    out["seconds"] = json!(t0.elapsed().as_secs_f64());
    out["peak_rss_mib"] = json!(peak_rss_mib());
    out["threads"] = json!(threads);
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


// ------------------------------------------------------------------ reach

fn reach(g: &Game, dir: &Path, threads: usize) -> anyhow::Result<Json> {
    let t0 = Instant::now();
    let (seen, per_depth) = bfs(g, &g.start(), threads, false, None);
    let secs = t0.elapsed().as_secs_f64();
    let count = seen.count();
    let by_status = status_counts(g, &seen, threads);
    std::fs::write(dir.join("reachable.bin"), seen.to_bytes())?;
    Ok(json!({
        "positions_total": g.size(),
        "colour_sequences": g.n_colour,
        "compositions": g.n_comp,
        "reachable": count,
        "reachable_by_status": by_status,
        "reachable_first_seen_at_ply": per_depth,
        "bfs_seconds": secs,
    }))
}

fn status_counts(g: &Game, set: &Bitset, threads: usize) -> Json {
    let lost = AtomicU64::new(0);
    let over = AtomicU64::new(0);
    let live = par_range(g.size(), threads, |a, z| {
        let mut live = 0;
        for i in a..z {
            if set.get(i) {
                match g.unrank(i).status() {
                    Status::Live => live += 1,
                    Status::Lost => {
                        lost.fetch_add(1, Ordering::Relaxed);
                    }
                    Status::Over => {
                        over.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
        }
        live
    });
    json!({"live": live, "lost": lost.into_inner(), "over": over.into_inner()})
}

// ------------------------------------------------------------------ pilot

/// Time init and backward expansion on slices, on a full-size table (so
/// cache behaviour is the real one), and extrapolate. The table is not solved.
fn pilot(g: &Game, threads: usize) -> anyhow::Result<Json> {
    let n = g.size();
    let mut t = vec![0u16; n as usize];
    let slice = n / 100;
    let t0 = Instant::now();
    {
        let at = as_atomic(&mut t);
        par_range(slice, threads, |a, z| {
            for i in a..z {
                let b = g.unrank(i);
                let v = if b.status() == Status::Live {
                    g.move_count(&b) as u16
                } else {
                    LOSS
                };
                at[i as usize].store(v, Ordering::Relaxed);
            }
            0
        });
    }
    let init_secs = t0.elapsed().as_secs_f64() * 100.0;
    // Backward expansion of 2 million random indices into the full table.
    let sample = 2_000_000u64;
    let mut rng = SplitMix64::new(7);
    let picks: Vec<u64> = (0..sample).map(|_| rng.next_u64() % n).collect();
    let at = as_atomic(&mut t);
    let edges = AtomicU64::new(0);
    let t1 = Instant::now();
    par_range(sample, threads, |a, z| {
        let mut e = 0;
        for &i in &picks[a as usize..z as usize] {
            g.for_each_parent(&g.unrank(i), |p| {
                // The same atomic read-modify-write the solve does, value unchanged.
                let slot = &at[g.rank(&p) as usize];
                let _ = slot.fetch_update(Ordering::Relaxed, Ordering::Relaxed, Some);
                e += 1;
            });
        }
        edges.fetch_add(e, Ordering::Relaxed);
        0
    });
    let expand_secs = t1.elapsed().as_secs_f64();
    let t2 = Instant::now();
    let scan = par_range(n, threads, |a, z| {
        (a..z)
            .filter(|&i| at[i as usize].load(Ordering::Relaxed) == WIN)
            .count() as u64
    });
    let scan_secs = t2.elapsed().as_secs_f64();
    let per_pos = expand_secs / sample as f64;
    let edges_per_pos = edges.into_inner() as f64 / sample as f64;
    Ok(json!({
        "label": "EXTRAPOLATED from timed slices, not measured end to end",
        "init_extrapolated_secs": init_secs,
        "expansion_secs_per_position": per_pos,
        "parents_per_position_mean": edges_per_pos,
        "expansion_upper_bound_secs": per_pos * n as f64,
        "scan_secs_per_level": scan_secs,
        "scan_check": scan,
        "note": "expansion bound assumes every position is resolved and expanded once; add scan_secs_per_level × number of levels",
    }))
}

// ------------------------------------------------------------------ solve

fn solve(g: &Game, dir: &Path, threads: usize) -> anyhow::Result<Json> {
    interrupt::install();
    let path = dir.join("table.bin");
    let (mut t, mut level, done) = if path.exists() {
        let (t, l, d) = load_table(&path, g.size())?;
        eprintln!(
            "resumed at level {l}{}",
            if d { " (already done)" } else { "" }
        );
        (t, l, d)
    } else {
        let mut t = vec![0u16; g.size() as usize];
        let t0 = Instant::now();
        init_table(g, &mut t, threads);
        eprintln!("init {:.1}s", t0.elapsed().as_secs_f64());
        save_table(&path, &t, 0, false)?;
        (t, 0, false)
    };
    let log_path = dir.join("levels.jsonl");
    if !done {
        let mut log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)?;
        let mut last_save = Instant::now();
        loop {
            let t0 = Instant::now();
            let resolved = propagate_level(g, &mut t, level, threads);
            let secs = t0.elapsed().as_secs_f64();
            writeln!(
                log,
                "{}",
                json!({"level": level, "resolved_next": resolved, "seconds": secs})
            )?;
            eprintln!(
                "level {level}: {resolved} resolved at {} ({secs:.1}s)",
                level + 1
            );
            level += 1;
            if resolved == 0 {
                break;
            }
            if interrupt::requested() {
                save_table(&path, &t, level, false)?;
                eprintln!("interrupted: saved at level {level}; rerun to resume");
                return Ok(json!({"interrupted_at_level": level}));
            }
            if last_save.elapsed().as_secs_f64() > SAVE_EVERY_SECS {
                save_table(&path, &t, level, false)?;
                last_save = Instant::now();
            }
        }
        finalize(&mut t);
        save_table(&path, &t, level, true)?;
    }
    let mut counts: BTreeMap<String, u64> = BTreeMap::new();
    for &v in &t {
        let k = match decode(v) {
            Value::Win(_) => "win",
            Value::Loss(_) => "loss",
            Value::Draw => "draw",
            Value::Over => "over",
            Value::Pending(_) => "pending",
        };
        *counts.entry(k.into()).or_default() += 1;
    }
    let start = decode(t[g.rank(&g.start()) as usize]);
    Ok(json!({"levels": level, "all_positions": counts, "start": format!("{start:?}")}))
}

// ------------------------------------------------------------------ check

/// Plain recursive search on the engine, no table: can the mover force a win within `d` plies?
fn win_within(s: &GameState, d: u32, nodes: &mut u64) -> bool {
    *nodes += 1;
    d > 0
        && legal_moves(s)
            .into_iter()
            .any(|m| loss_within(&apply_move(s, m).unwrap(), d - 1, nodes))
}

fn loss_within(s: &GameState, d: u32, nodes: &mut u64) -> bool {
    *nodes += 1;
    match base_outcome(s) {
        Some(o) => o.winner() != Some(s.to_move()),
        None => {
            d > 0
                && legal_moves(s)
                    .into_iter()
                    .all(|m| win_within(&apply_move(s, m).unwrap(), d - 1, nodes))
        }
    }
}

fn check(g: &Game, dir: &Path, threads: usize) -> anyhow::Result<Json> {
    let mut t = load_solved(g, dir)?;
    let reach = load_reachable(g, dir)?;
    let mut out = json!({});

    let t0 = Instant::now();
    let v = check_consistency(g, &t, threads, None);
    out["consistency_all_positions"] =
        json!({"violations": v, "seconds": t0.elapsed().as_secs_f64()});
    eprintln!("consistency: {} violations", v.total());

    let t0 = Instant::now();
    let perms = verified_symmetries();
    let (board_bad, swap_bad) = check_symmetry(g, &t, &perms[1..], threads);
    out["symmetry_all_positions"] = json!({
        "board_symmetry_mismatches": board_bad, "colour_swap_mismatches": swap_bad,
        "symmetries_checked": perms.len() - 1, "seconds": t0.elapsed().as_secs_f64()});
    eprintln!("symmetry: {board_bad} / {swap_bad}");

    out["independent_search"] = independent_search(
        g,
        &t,
        &reach,
        &Sampling { max_dist: 7, per_bucket: 40, draw_depth: 5, shift: 0 },
        threads,
    );

    // Corrupted entries: each must be caught by the full consistency check.
    let mut corrupt = Vec::new();
    let start = g.rank(&g.start()) as usize;
    let mut cases: Vec<(String, usize, u16)> = Vec::new();
    let find = |pred: &dyn Fn(Value) -> bool| -> Option<usize> {
        (0..t.len()).find(|&i| reach.get(i as u64) && pred(decode(t[i])))
    };
    if let Some(w) = find(&|v| matches!(v, Value::Win(d) if d >= 3)) {
        cases.push(("win set to loss at same distance".into(), w, LOSS | (t[w] & DIST_MASK)));
        cases.push(("win distance +2".into(), w, t[w] + 2));
    }
    if let Some(l) = find(&|v| matches!(v, Value::Loss(d) if d >= 2)) {
        cases.push(("loss set to draw".into(), l, DRAW));
    }
    if let Some(d) = find(&|v| v == Value::Draw) {
        cases.push(("draw set to win in 1".into(), d, WIN | 1));
    }
    cases.push((
        "start position flipped".into(),
        start,
        match decode(t[start]) {
            Value::Draw => LOSS | 2,
            _ => DRAW,
        },
    ));
    for (name, i, code) in cases {
        let orig = t[i];
        t[i] = code;
        let t0 = Instant::now();
        let v = check_consistency(g, &t, threads, None);
        t[i] = orig;
        eprintln!("corruption '{name}': {} violations", v.total());
        corrupt.push(json!({"corruption": name, "index": i, "violations": v.total(), "seconds": t0.elapsed().as_secs_f64()}));
    }
    out["corrupted_entries"] = json!(corrupt);
    out["mutated_rule"] = json!("tested on the 3+3 variant in crates/search/tests/retro.rs (consistency_check_catches_a_table_solved_under_a_mutated_rule)");
    Ok(out)
}

// ------------------------------------------------------------------ answers

fn mv(m: (u8, u8, u8)) -> String {
    notation::move_to_notation(Move {
        from_cell: m.0,
        num_pieces: m.1,
        to_cell: m.2,
    })
}

fn val_json(v: Value) -> Json {
    match v {
        Value::Win(d) => json!({"value": "win", "plies": d}),
        Value::Loss(d) => json!({"value": "loss", "plies": d}),
        Value::Draw => json!({"value": "draw"}),
        Value::Over => json!({"value": "over"}),
        Value::Pending(_) => json!({"value": "pending"}),
    }
}

fn answers(g: &Game, dir: &Path, threads: usize) -> anyhow::Result<Json> {
    let t = load_solved(g, dir)?;
    let reach = load_reachable(g, dir)?;
    let at = |b: &Board| decode(t[g.rank(b) as usize]);
    let start = g.start();
    let mut out = json!({});

    // (a), (b)
    out["start"] = val_json(at(&start));
    let mut first = Vec::new();
    let mut i = 0;
    g.for_each_child(&start, |c| {
        let m = g.moves(&start)[i];
        i += 1;
        // The child's value is Red's; White's result is its opposite.
        let white = match at(&c) {
            Value::Win(d) => Value::Loss(d + 1),
            Value::Loss(d) => Value::Win(d + 1),
            v => v,
        };
        first.push(json!({"move": mv(m), "for_white": val_json(white)}));
    });
    out["first_moves"] = json!(first);

    // (c) counts and distances among reachable positions.
    let (counts, dist) = value_stats(g, &t, &reach, threads);
    out["reachable_values"] = counts;
    out["reachable_distance_histogram"] = dist;

    // (d) strongly connected structure.
    out["structure"] = structure(g, &t, &reach, threads);
    out["unreachable"] = unreachable(g, &t, &reach, threads);

    // (f) principles against perfect play, uniform sample of reachable won positions.
    out["principles_uniform"] = principles_vs_perfect(g, &t, &reach, 20_000, 11);

    // (g) puzzles.
    out["puzzles"] = puzzles(g, &t, &reach);
    Ok(out)
}

fn value_stats(g: &Game, t: &[u16], reach: &Bitset, threads: usize) -> (Json, Json) {
    use std::sync::Mutex;
    let hist: Mutex<BTreeMap<(bool, u16), u64>> = Mutex::new(BTreeMap::new());
    let tally: Mutex<BTreeMap<&'static str, u64>> = Mutex::new(BTreeMap::new());
    par_range(g.size(), threads, |a, z| {
        let mut h: BTreeMap<(bool, u16), u64> = BTreeMap::new();
        let mut c: BTreeMap<&'static str, u64> = BTreeMap::new();
        for i in a..z {
            if !reach.get(i) {
                continue;
            }
            let live = g.unrank(i).status() == Status::Live;
            let k = match decode(t[i as usize]) {
                Value::Win(d) => {
                    *h.entry((true, d)).or_default() += 1;
                    "win"
                }
                Value::Loss(0) => "lost_terminal",
                Value::Loss(d) => {
                    *h.entry((false, d)).or_default() += 1;
                    "loss"
                }
                Value::Draw => "draw",
                _ => "other",
            };
            debug_assert!(live || k == "lost_terminal");
            *c.entry(k).or_default() += 1;
        }
        let mut hh = hist.lock().unwrap();
        for (k, v) in h {
            *hh.entry(k).or_default() += v;
        }
        let mut cc = tally.lock().unwrap();
        for (k, v) in c {
            *cc.entry(k).or_default() += v;
        }
        0
    });
    let hist = hist.into_inner().unwrap();
    let wins: BTreeMap<String, u64> = hist
        .iter()
        .filter(|(k, _)| k.0)
        .map(|(k, v)| (k.1.to_string(), *v))
        .collect();
    let losses: BTreeMap<String, u64> = hist
        .iter()
        .filter(|(k, _)| !k.0)
        .map(|(k, v)| (k.1.to_string(), *v))
        .collect();
    let max_win = hist.keys().filter(|k| k.0).map(|k| k.1).max();
    let max_loss = hist.keys().filter(|k| !k.0).map(|k| k.1).max();
    (
        json!(tally.into_inner().unwrap()),
        json!({"win_by_plies": wins, "loss_by_plies": losses, "longest_win": max_win, "longest_loss": max_loss}),
    )
}

/// SCC of the start position (forward-reachable ∩ can-return-to-start), and
/// what lies outside it.
fn structure(g: &Game, t: &[u16], reach: &Bitset, threads: usize) -> Json {
    let t0 = Instant::now();
    let (back, _) = bfs(g, &g.start(), threads, true, Some(reach));
    let in_scc = back.count();
    let outside: std::sync::Mutex<BTreeMap<String, u64>> = std::sync::Mutex::new(BTreeMap::new());
    let examples: std::sync::Mutex<Vec<u64>> = std::sync::Mutex::new(Vec::new());
    par_range(g.size(), threads, |a, z| {
        let mut m: BTreeMap<String, u64> = BTreeMap::new();
        for i in a..z {
            if reach.get(i) && !back.get(i) {
                let b = g.unrank(i);
                let k = match (b.status(), decode(t[i as usize])) {
                    (Status::Lost, _) => "terminal".to_string(),
                    (_, v) => {
                        let mut ex = examples.lock().unwrap();
                        if ex.len() < 5 {
                            ex.push(i);
                        }
                        format!(
                            "live_{}",
                            match v {
                                Value::Win(_) => "win",
                                Value::Loss(_) => "loss",
                                _ => "draw",
                            }
                        )
                    }
                };
                *m.entry(k).or_default() += 1;
            }
        }
        let mut o = outside.lock().unwrap();
        for (k, v) in m {
            *o.entry(k).or_default() += v;
        }
        0
    });
    let ex: Vec<String> = examples
        .into_inner()
        .unwrap()
        .into_iter()
        .map(|i| g.unrank(i).diagram())
        .collect();
    json!({
        "reachable_that_can_return_to_start": in_scc,
        "reachable_that_cannot": outside.into_inner().unwrap(),
        "examples_live_that_cannot": ex,
        "seconds": t0.elapsed().as_secs_f64(),
    })
}

/// Win in N (N = 3, 5, 7) with exactly one winning first move that greedy
/// (top difference after the move) would not choose.
fn puzzles(g: &Game, t: &[u16], reach: &Bitset) -> Json {
    let mut out = Vec::new();
    let at = |b: &Board| decode(t[g.rank(b) as usize]);
    for n in [3u16, 5, 7] {
        let mut rng = SplitMix64::new(100 + n as u64);
        let mut found = 0;
        let mut tries = 0u64;
        while found < 3 && tries < 500_000_000 {
            tries += 1;
            let i = rng.next_u64() % g.size();
            if !reach.get(i) || decode(t[i as usize]) != Value::Win(n) {
                continue;
            }
            let b = g.unrank(i);
            let moves = g.moves(&b);
            let mut winning = Vec::new();
            let mut tops = Vec::new();
            for &m in &moves {
                let c = b.moved(m.0 as usize, m.1, m.2 as usize);
                if matches!(at(&c), Value::Loss(_)) {
                    winning.push(m);
                }
                tops.push(c.tops(b.red_to_move) as i32 - c.tops(!b.red_to_move) as i32);
            }
            let best = *tops.iter().max().unwrap();
            let greedy: Vec<(u8, u8, u8)> = moves
                .iter()
                .zip(&tops)
                .filter(|(_, &x)| x == best)
                .map(|(m, _)| *m)
                .collect();
            if winning.len() != 1 || greedy.contains(&winning[0]) {
                continue;
            }
            found += 1;
            out.push(json!({
                "win_in_plies": n,
                "diagram": b.diagram(),
                "key_move": mv(winning[0]),
                "moves_available": moves.len(),
                "greedy_would_play_one_of": greedy.iter().map(|&m| mv(m)).collect::<Vec<_>>(),
                "solution": solution_tree(g, t, &b.moved(winning[0].0 as usize, winning[0].1, winning[0].2 as usize), n - 1),
            }));
        }
    }
    json!(out)
}

/// After the key move (`after`, the loser to move, lost in `left` plies):
/// every defence with how fast it loses, and the fastest winning replies.
/// The whole tree is given when two plies remain; deeper, only the longest
/// defence is followed, with its first fastest reply.
fn solution_tree(g: &Game, t: &[u16], after: &Board, left: u16) -> Json {
    let at = |b: &Board| decode(t[g.rank(b) as usize]);
    let mut defences = Vec::new();
    let mut followed = false;
    for m in g.moves(after) {
        let c = after.moved(m.0 as usize, m.1, m.2 as usize);
        let Value::Win(d) = at(&c) else {
            unreachable!("a lost position has only moves to won ones")
        };
        let replies: Vec<((u8, u8, u8), Board, u16)> = g
            .moves(&c)
            .into_iter()
            .filter_map(|r| {
                let cc = c.moved(r.0 as usize, r.1, r.2 as usize);
                match at(&cc) {
                    Value::Loss(x) if x + 1 == d => Some((r, cc, x)),
                    _ => None,
                }
            })
            .collect();
        let mut entry = json!({
            "defence": mv(m),
            "lost_in_plies": d + 1,
            "fastest_replies": replies.iter().map(|(r, _, _)| mv(*r)).collect::<Vec<_>>(),
        });
        let expand = left <= 2 || (!followed && d + 1 == left);
        if expand && replies[0].2 > 0 {
            followed = true;
            entry["after_first_reply"] = solution_tree(g, t, &replies[0].1, replies[0].2);
        } else if expand {
            followed = true;
        }
        defences.push(entry);
    }
    json!(defences)
}

/// Uniform sample of reachable won positions (win in 3 or more, so no move
/// ends the game at once), compared with the principles.
fn principles_vs_perfect(g: &Game, t: &[u16], reach: &Bitset, want: usize, seed: u64) -> Json {
    let mut rng = SplitMix64::new(seed);
    let mut positions = Vec::new();
    let mut tries = 0u64;
    while positions.len() < want && tries < 2_000_000_000 {
        tries += 1;
        let i = rng.next_u64() % g.size();
        if reach.get(i) && matches!(decode(t[i as usize]), Value::Win(d) if d >= 3) {
            positions.push(g.unrank(i).to_state());
        }
    }
    let value = |s: &GameState| decode(t[g.rank(&Board::from_state(s)) as usize]);
    json!({
        "all_moves": principle_comparison(&positions, value, false),
        "greedy_ties_only": principle_comparison(&positions, value, true),
    })
}

// ------------------------------------------------------------------ draws

/// The draws reachable from the start when both sides only play moves that
/// keep the draw, and how much of that region can return to the start.
fn draws(g: &Game, dir: &Path, threads: usize) -> anyhow::Result<Json> {
    let t = load_solved(g, dir)?;
    let draws = Bitset::new(g.size());
    par_range(g.size(), threads, |a, z| {
        for i in a..z {
            if t[i as usize] == DRAW {
                draws.set(i);
            }
        }
        0
    });
    let t0 = Instant::now();
    let (region, depths) = bfs(g, &g.start(), threads, false, Some(&draws));
    let (back, _) = bfs(g, &g.start(), threads, true, Some(&region));
    // Draw-keeping moves per position in the region.
    let hist: std::sync::Mutex<BTreeMap<u32, u64>> = std::sync::Mutex::new(BTreeMap::new());
    par_range(g.size(), threads, |a, z| {
        let mut h: BTreeMap<u32, u64> = BTreeMap::new();
        for i in a..z {
            if region.get(i) {
                let mut k = 0;
                g.for_each_child(&g.unrank(i), |c| k += (t[g.rank(&c) as usize] == DRAW) as u32);
                *h.entry(k).or_default() += 1;
            }
        }
        let mut hh = hist.lock().unwrap();
        for (k, v) in h {
            *hh.entry(k).or_default() += v;
        }
        0
    });
    Ok(json!({
        "draws_all_positions": draws.count(),
        "draw_region_from_start": region.count(),
        "draw_region_first_seen_at_ply": depths,
        "draw_region_that_can_return_to_start": back.count(),
        "draw_keeping_moves_per_position": hist.into_inner().unwrap(),
        "bfs_seconds": t0.elapsed().as_secs_f64(),
    }))
}

// ------------------------------------------------------------- negamax

/// Compare the table with plain recursive search on the engine, on reachable
/// positions sampled uniformly within each value bucket: `per_bucket` each
/// of loss in 0, 2, … and win in 1, 3, … up to `max_dist` plies, and draws
/// (no forced result within `draw_depth` plies).
/// What [`independent_search`] samples and claims.
#[derive(Clone, Copy)]
struct Sampling {
    max_dist: u16,
    per_bucket: usize,
    draw_depth: u32,
    shift: u16,
}

fn independent_search(g: &Game, t: &[u16], reach: &Bitset, p: &Sampling, threads: usize) -> Json {
    let Sampling { max_dist, per_bucket, draw_depth, shift } = *p;
    let t0 = Instant::now();
    let mut rng = SplitMix64::new(3);
    let mut wanted: BTreeMap<String, Vec<u64>> = (0..=max_dist)
        .map(|d| {
            let v = if d % 2 == 1 { Value::Win(d) } else { Value::Loss(d) };
            (format!("{v:?}"), Vec::new())
        })
        .chain([("Draw".to_string(), Vec::new())])
        .collect();
    let mut tries = 0u64;
    while tries < 2_000_000_000 && wanted.values().any(|b| b.len() < per_bucket) {
        tries += 1;
        let i = rng.next_u64() % g.size();
        if !reach.get(i) {
            continue;
        }
        if let Some(b) = wanted.get_mut(&format!("{:?}", decode(t[i as usize]))) {
            if b.len() < per_bucket {
                b.push(i);
            }
        }
    }
    let jobs: Vec<u64> = wanted.values().flatten().copied().collect();
    let agree: Vec<AtomicBool> = jobs.iter().map(|_| AtomicBool::new(false)).collect();
    let nodes = par_range(jobs.len() as u64, threads, |a, z| {
        let mut nodes = 0u64;
        for j in a..z {
            let i = jobs[j as usize];
            let s = g.unrank(i).to_state();
            // `shift` > 0 is the falsification run: claim each distance `shift` plies shorter.
            let claim = match decode(t[i as usize]) {
                Value::Win(d) if d > shift => Value::Win(d - shift),
                Value::Loss(d) if d >= shift => Value::Loss(d - shift),
                v => v,
            };
            let ok = match claim {
                Value::Win(d) => {
                    win_within(&s, d as u32, &mut nodes)
                        && (d < 2 || !win_within(&s, d as u32 - 2, &mut nodes))
                }
                Value::Loss(d) => {
                    loss_within(&s, d as u32, &mut nodes)
                        && (d < 2 || !loss_within(&s, d as u32 - 2, &mut nodes))
                }
                _ => {
                    !win_within(&s, draw_depth, &mut nodes)
                        && !loss_within(&s, draw_depth, &mut nodes)
                }
            };
            agree[j as usize].store(ok, Ordering::Relaxed);
        }
        nodes
    });
    let mut k = 0;
    let by_value: BTreeMap<String, Json> = wanted
        .iter()
        .map(|(name, list)| {
            let ok = (k..k + list.len()).filter(|&j| agree[j].load(Ordering::Relaxed)).count();
            k += list.len();
            (name.clone(), json!({"sampled": list.len(), "agree": ok}))
        })
        .collect();
    json!({
        "method": format!("plain recursive negamax on the engine (legal_moves/apply_move), no table, no transposition table; win in d: forced win within d plies and not within d-2; loss in d: forced loss within d and not within d-2; draw: no forced result within {draw_depth} plies"),
        "by_value": by_value,
        "nodes": nodes,
        "seconds": t0.elapsed().as_secs_f64(),
    })
}

fn negamax(g: &Game, dir: &Path, threads: usize, args: &[String]) -> anyhow::Result<Json> {
    let t = load_solved(g, dir)?;
    let reach = load_reachable(g, dir)?;
    let max_dist: u16 = arg(args, "--max-dist").map_or(Ok(9), |s| s.parse())?;
    let per_bucket: usize = arg(args, "--per-bucket").map_or(Ok(100), |s| s.parse())?;
    let draw_depth: u32 = arg(args, "--draw-depth").map_or(Ok(7), |s| s.parse())?;
    let shift: u16 = arg(args, "--shift").map_or(Ok(0), |s| s.parse())?;
    let p = Sampling { max_dist, per_bucket, draw_depth, shift };
    let mut out = independent_search(g, &t, &reach, &p, threads);
    out["claimed_distance_shortened_by"] = json!(shift);
    Ok(out)
}

/// Positions the start cannot reach, by status and value, with a few
/// examples of those that are not OVER.
fn unreachable(g: &Game, t: &[u16], reach: &Bitset, threads: usize) -> Json {
    let tally: std::sync::Mutex<BTreeMap<String, u64>> = std::sync::Mutex::new(BTreeMap::new());
    let examples: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
    par_range(g.size(), threads, |a, z| {
        let mut m: BTreeMap<String, u64> = BTreeMap::new();
        for i in a..z {
            if reach.get(i) {
                continue;
            }
            let b = g.unrank(i);
            let v = decode(t[i as usize]);
            *m.entry(format!("{:?} {:?}", b.status(), v)).or_default() += 1;
            if b.status() != Status::Over {
                let mut ex = examples.lock().unwrap();
                if ex.len() < 3 {
                    ex.push(b.diagram());
                }
            }
        }
        let mut o = tally.lock().unwrap();
        for (k, v) in m {
            *o.entry(k).or_default() += v;
        }
        0
    });
    json!({"by_status_and_value": tally.into_inner().unwrap(), "examples_not_over": examples.into_inner().unwrap()})
}
