//! Round 3: `lc1-2` from the start, through the draw graph of the uncapped
//! table. See `docs/experiments/v3-lc1-solve.md`.
//!
//! ```text
//! lc1solve graph  <table.bin>                 structure of G (nodes, edges, SCCs)
//! lc1solve exits  <table.bin> [--samples N --max-dist D --max-walk L]
//!                                             claim 2 checked on the engine
//! lc1solve probe  <table.bin> [--limit N --min-size A --max-size B --order --plain]
//!                                             counts search per component class
//! lc1solve deepen <table.bin> [--node-limit N --memo-cap M --max-depth D]
//!                                             short forced wins from the start
//! lc1solve pilot  <table.bin> [--lazy --plain --node-limit N --memo-limit M]
//!                                             the full solve, with limits
//! lc1solve dump   <table.bin> --size N        diagrams of a component
//! ```
//! Every command takes `--out FILE` (JSON; stdout otherwise).

use anyhow::bail;
use pogofish_engine::{apply_move, initial_state, is_terminal, legal_moves, GameState, RuleSet};
use pogofish_search::lc1solve::{build_graph, components, BaseCase, Bounded, DrawGraph, Solver};
use pogofish_search::retro::{decode, load_table, Board, Game, Value, DRAW};
use pogofish_search::rng::SplitMix64;
use serde_json::{json, Value as Json};
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

fn peak_rss_mib() -> f64 {
    let mut u: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut u) };
    u.ru_maxrss as f64 / (1024.0 * 1024.0)
}

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1).cloned())
}

/// G from the solved table at `path`; the table is dropped before returning.
fn load_graph(g: &Game, path: &Path) -> anyhow::Result<(DrawGraph, f64)> {
    let t0 = Instant::now();
    let (t, _, done) = load_table(path, g.size())?;
    if !done {
        bail!("{} is not a finished table", path.display());
    }
    let gr = build_graph(g, &t, &g.start());
    Ok((gr, t0.elapsed().as_secs_f64()))
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 2 {
        bail!("usage: lc1solve graph|exits|probe|deepen|pilot|dump <table.bin> [options] [--out FILE]");
    }
    let g = Game::published();
    let t0 = Instant::now();
    let mut out = match args[0].as_str() {
        "graph" => graph(&g, Path::new(&args[1]))?,
        "dump" => dump(&g, Path::new(&args[1]), &args)?,
        "deepen" => deepen(&g, Path::new(&args[1]), &args)?,
        "probe" => probe(&g, Path::new(&args[1]), &args)?,
        "exits" => exits(&g, Path::new(&args[1]), &args)?,
        "pilot" => pilot(&g, Path::new(&args[1]), &args)?,
        other => bail!("unknown command {other}"),
    };
    out["seconds"] = json!(t0.elapsed().as_secs_f64());
    out["peak_rss_mib"] = json!(peak_rss_mib());
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

fn hist<T: Ord>(xs: impl Iterator<Item = T>) -> BTreeMap<T, u64> {
    let mut h = BTreeMap::new();
    for x in xs {
        *h.entry(x).or_default() += 1;
    }
    h
}

fn graph(g: &Game, path: &Path) -> anyhow::Result<Json> {
    let (gr, load_secs) = load_graph(g, path)?;
    let (comp, n_comp) = components(&gr);
    let mut size = vec![0u64; n_comp];
    for &c in &comp {
        size[c as usize] += 1;
    }
    // Internal edges and entry nodes per component.
    let mut internal = vec![0u64; n_comp];
    let mut entered = vec![false; gr.len()];
    entered[gr.root as usize] = true;
    for v in 0..gr.len() as u32 {
        for &w in gr.successors(v) {
            if comp[w as usize] == comp[v as usize] {
                internal[comp[v as usize] as usize] += 1;
            } else {
                entered[w as usize] = true;
            }
        }
    }
    let mut entries = vec![0u64; n_comp];
    for v in 0..gr.len() {
        if entered[v] {
            entries[comp[v] as usize] += 1;
        }
    }
    let nontrivial: Vec<usize> = (0..n_comp).filter(|&c| size[c] > 1).collect();
    let mut by_size: Vec<usize> = nontrivial.clone();
    by_size.sort_by_key(|&c| std::cmp::Reverse(size[c]));
    let top: Vec<Json> = by_size
        .iter()
        .take(20)
        .map(|&c| json!({"nodes": size[c], "internal_edges": internal[c], "entries": entries[c], "contains_start": comp[gr.root as usize] as usize == c}))
        .collect();
    let size_hist = hist(nontrivial.iter().map(|&c| size[c]));
    let outdeg = hist((0..gr.len() as u32).map(|v| gr.successors(v).len()));
    let exits = hist(gr.exits.iter().copied());
    let min_exit = hist(gr.min_exit_dist.iter().copied().filter(|&d| d != u16::MAX));
    let start_comp = comp[gr.root as usize] as usize;
    // Components reachable from the start component, by size (each counted once).
    let mut reach = vec![false; n_comp];
    reach[start_comp] = true;
    let mut members: Vec<Vec<u32>> = vec![Vec::new(); n_comp];
    for v in 0..gr.len() as u32 {
        members[comp[v as usize] as usize].push(v);
    }
    for c in (0..n_comp).rev() {
        if !reach[c] {
            continue;
        }
        for &v in &members[c] {
            for &w in gr.successors(v) {
                reach[comp[w as usize] as usize] = true;
            }
        }
    }
    let direct: std::collections::BTreeSet<u32> = (0..gr.len() as u32)
        .filter(|&v| comp[v as usize] as usize == start_comp)
        .flat_map(|v| gr.successors(v).iter().map(|&w| comp[w as usize]))
        .filter(|&c| c as usize != start_comp)
        .collect();
    let exited_to = hist(direct.iter().map(|&c| size[c as usize]));
    Ok(json!({
        "nodes": gr.len(),
        "edges": gr.edges(),
        "components": n_comp,
        "nontrivial_components": nontrivial.len(),
        "nodes_in_nontrivial_components": nontrivial.iter().map(|&c| size[c]).sum::<u64>(),
        "start_component": {"nodes": size[start_comp], "internal_edges": internal[start_comp], "entries": entries[start_comp]},
        "largest_components": top,
        "nontrivial_component_size_histogram": size_hist,
        "out_degree_histogram": outdeg,
        "exit_moves_per_node_histogram": exits,
        "shortest_exit_distance_histogram": min_exit,
        "load_and_build_seconds": load_secs,
        "components_entered_directly_from_start_component_by_size": exited_to,
        "components_reachable_from_start": reach.iter().filter(|&&r| r).count(),
    }))
}

/// Run `f` on a thread with a large stack (the search recurses once per ply).
fn big_stack<T: Send>(f: impl FnOnce() -> T + Send) -> T {
    std::thread::scope(|s| {
        std::thread::Builder::new()
            .stack_size(4 << 30)
            .spawn_scoped(s, f)
            .expect("spawn")
            .join()
            .expect("search thread")
    })
}

fn pilot(g: &Game, path: &Path, args: &[String]) -> anyhow::Result<Json> {
    let (gr, _) = load_graph(g, path)?;
    let cap: u8 = arg(args, "--cap").map_or(Ok(2), |s| s.parse())?;
    let node_limit: u64 = arg(args, "--node-limit").map_or(Ok(u64::MAX), |s| s.parse())?;
    let memo_limit: usize = arg(args, "--memo-limit").map_or(Ok(20_000_000), |s| s.parse())?;
    let t0 = Instant::now();
    let (r, s_nodes, base, how) = big_stack(|| {
        let mut s = Solver::new(&gr, cap);
        s.node_limit = node_limit;
        s.memo_limit = memo_limit;
        s.on_base_case = Some(Box::new(|b: &BaseCase| {
            if b.nodes >= 10 || b.searched > 100_000 {
                eprintln!("{}", serde_json::to_string(b).unwrap());
            }
        }));
        s.dynamic = !args.iter().any(|a| a == "--plain");
        let r = if args.iter().any(|a| a == "--lazy") {
            s.solve_lazy()
        } else {
            s.solve()
        };
        let how = hist(
            s.how
                .iter()
                .zip(&s.value)
                .map(|(h, v)| format!("{h:?} {v:?}")),
        );
        (r, s.nodes, s.base_cases.clone(), how)
    });
    let mut largest = base.clone();
    largest.sort_by_key(|x| std::cmp::Reverse(x.nodes));
    largest.truncate(10);
    Ok(json!({
        "cap": cap,
        "result_root_mover_wins": r,
        "searched": s_nodes,
        "base_cases": base.len(),
        "base_case_size_histogram": hist(base.iter().map(|b| b.nodes)),
        "largest_base_cases": largest,
        "nodes_by_how_and_value": how,
        "solve_seconds": t0.elapsed().as_secs_f64(),
    }))
}

/// Diagrams and internal edges of the first component of a given size.
fn dump(g: &Game, path: &Path, args: &[String]) -> anyhow::Result<Json> {
    let (gr, _) = load_graph(g, path)?;
    let (comp, _) = components(&gr);
    let want: usize = arg(args, "--size").map_or(Ok(40), |s| s.parse())?;
    let mut size: BTreeMap<u32, usize> = BTreeMap::new();
    for &c in &comp {
        *size.entry(c).or_default() += 1;
    }
    let target = *size
        .iter()
        .find(|(_, &s)| s == want)
        .map(|(c, _)| c)
        .ok_or_else(|| anyhow::anyhow!("no component of that size"))?;
    let nodes: Vec<u32> = (0..gr.len() as u32)
        .filter(|&v| comp[v as usize] == target)
        .collect();
    for &v in &nodes {
        let succ: Vec<u32> = gr
            .successors(v)
            .iter()
            .copied()
            .filter(|&w| comp[w as usize] == target)
            .collect();
        println!("node {v} -> {succ:?}\n{}", gr.boards[v as usize].diagram());
    }
    Ok(json!({}))
}

/// Iterative deepening from the start: is there a forced win for either side
/// within d moves of G? Stops at the first d that proves one, or at the
/// node budget.
fn deepen(g: &Game, path: &Path, args: &[String]) -> anyhow::Result<Json> {
    let (gr, _) = load_graph(g, path)?;
    let cap: u8 = arg(args, "--cap").map_or(Ok(2), |s| s.parse())?;
    let max_d: u16 = arg(args, "--max-depth").map_or(Ok(200), |s| s.parse())?;
    let budget: u64 = arg(args, "--node-limit").map_or(Ok(200_000_000), |s| s.parse())?;
    let memo_cap: usize = arg(args, "--memo-cap").map_or(Ok(10_000_000), |s| s.parse())?;
    let mut rows = Vec::new();
    let mut verdict = Json::Null;
    big_stack(|| {
        let mut b = Bounded::new(&gr, cap, &[(gr.root, 1)]);
        b.memo_cap = memo_cap;
        for d in 1..=max_d {
            let t0 = Instant::now();
            let before = b.nodes;
            let w = b.wins(gr.root, d);
            let l = !w && b.loses(gr.root, d);
            let secs = t0.elapsed().as_secs_f64();
            eprintln!(
                "d {d}: white wins {w} red wins {l} nodes {} memo {} {secs:.1}s",
                b.nodes - before,
                b.memo_len()
            );
            rows.push(json!({"depth": d, "white_wins_within": w, "red_wins_within": l, "nodes": b.nodes - before, "memo": b.memo_len(), "seconds": secs}));
            if w || l {
                verdict = json!({"depth": d, "white_wins": w});
                break;
            }
            if b.nodes > budget {
                break;
            }
        }
    });
    Ok(json!({"cap": cap, "verdict": verdict, "rows": rows}))
}

/// Hardness of the counts search against component size: one component of
/// each (size, internal edges) class, searched closed (exits ignored) from
/// each of its entries, within a budget of searched positions.
fn probe(g: &Game, path: &Path, args: &[String]) -> anyhow::Result<Json> {
    let (gr, _) = load_graph(g, path)?;
    let (comp, n_comp) = components(&gr);
    let cap: u8 = arg(args, "--cap").map_or(Ok(2), |s| s.parse())?;
    let limit: u64 = arg(args, "--limit").map_or(Ok(10_000_000), |s| s.parse())?;
    let plain = args.iter().any(|a| a == "--plain");
    let max_size: usize = arg(args, "--max-size").map_or(Ok(usize::MAX), |s| s.parse())?;
    let min_size: usize = arg(args, "--min-size").map_or(Ok(2), |s| s.parse())?;
    let mut members: Vec<Vec<u32>> = vec![Vec::new(); n_comp];
    for (v, &c) in comp.iter().enumerate() {
        members[c as usize].push(v as u32);
    }
    let internal = |c: &Vec<u32>| -> usize {
        c.iter()
            .map(|&v| {
                gr.successors(v)
                    .iter()
                    .filter(|&&w| comp[w as usize] == comp[v as usize])
                    .count()
            })
            .sum()
    };
    let mut classes: BTreeMap<(usize, usize), usize> = BTreeMap::new();
    let mut copies: BTreeMap<(usize, usize), usize> = BTreeMap::new();
    for (i, c) in members.iter().enumerate() {
        if c.len() >= min_size && c.len() <= max_size {
            let k = (c.len(), internal(c));
            classes.entry(k).or_insert(i);
            *copies.entry(k).or_default() += 1;
        }
    }
    let mut rows = Vec::new();
    big_stack(|| {
        let mut s = Solver::new(&gr, cap);
        s.dynamic = !plain;
        s.order_by_mobility = args.iter().any(|a| a == "--order");
        for (&(size, edges), &i) in &classes {
            let (bc, solved) = s.probe(&members[i], limit);
            eprintln!(
                "size {size} edges {edges}: entries {} solved {solved} searched {} {:.1}s",
                bc.entries, bc.searched, bc.seconds
            );
            rows.push(json!({
                "nodes": size, "internal_edges": edges, "copies": copies[&(size, edges)],
                "entries": bc.entries, "entries_solved": solved,
                "finished": solved == bc.entries,
                "searched": bc.searched, "max_depth": bc.max_depth, "seconds": bc.seconds,
            }));
        }
    });
    Ok(json!({"cap": cap, "limit_per_component": limit, "dynamic": !plain, "rows": rows}))
}

/// Mover wins within `d` plies under `rules`, by plain negamax on the engine
/// with the whole history (no table, no transposition table).
fn engine_wins_within(s: &GameState, rules: &RuleSet, d: u32, nodes: &mut u64) -> bool {
    if d == 0 {
        return false;
    }
    *nodes += 1;
    legal_moves(s).into_iter().any(|m| {
        let c = apply_move(s, m).expect("legal");
        match is_terminal(&c, rules) {
            Some(o) => o.winner() == Some(s.to_move()),
            None => engine_loses_within(&c, rules, d - 1, nodes),
        }
    })
}

/// Mover loses within `d` plies: every move loses at once or leads to a
/// position the opponent wins within `d - 1`.
fn engine_loses_within(s: &GameState, rules: &RuleSet, d: u32, nodes: &mut u64) -> bool {
    if d == 0 {
        return false;
    }
    *nodes += 1;
    legal_moves(s).into_iter().all(|m| {
        let c = apply_move(s, m).expect("legal");
        match is_terminal(&c, rules) {
            Some(o) => o.winner() != Some(s.to_move()),
            None => engine_wins_within(&c, rules, d - 1, nodes),
        }
    })
}

/// Claim 2 checked on the engine: random games that keep to G (each side
/// picks a random draw-keeping move whose position has occurred fewer than
/// twice; repetitions inside G happen), then one random move out of G into
/// a position the opponent wins in d <= `--max-dist` plies under the uncapped
/// rules. Under `lc1-2`, with the real history, the opponent must win within
/// d plies and not within d - 2 (the falsifiable part).
fn exits(g: &Game, path: &Path, args: &[String]) -> anyhow::Result<Json> {
    let samples: usize = arg(args, "--samples").map_or(Ok(200), |s| s.parse())?;
    let max_dist: u16 = arg(args, "--max-dist").map_or(Ok(7), |s| s.parse())?;
    let max_walk: usize = arg(args, "--max-walk").map_or(Ok(400), |s| s.parse())?;
    let (t, _, _) = load_table(path, g.size())?;
    let rules = RuleSet::LC1 { repetitions: 2 };
    let mut rng = SplitMix64::new(11);
    let mut rows: BTreeMap<u16, (u64, u64, u64)> = BTreeMap::new();
    let mut with_repeats = 0u64;
    let mut walk_lengths = Vec::new();
    let mut nodes = 0u64;
    let mut done = 0;
    let mut attempts = 0;
    while done < samples && attempts < 100 * samples {
        attempts += 1;
        let mut s = initial_state();
        let mut seen: HashMap<u64, u8> = HashMap::new();
        seen.insert(g.rank(&Board::from_state(&s)), 1);
        let len = rng.below(max_walk + 1);
        let mut repeated = false;
        for _ in 0..len {
            let keep: Vec<_> = legal_moves(&s)
                .into_iter()
                .filter_map(|m| {
                    let c = apply_move(&s, m).unwrap();
                    let r = g.rank(&Board::from_state(&c));
                    (t[r as usize] == DRAW && seen.get(&r).copied().unwrap_or(0) < 2)
                        .then_some((c, r))
                })
                .collect();
            if keep.is_empty() {
                break;
            }
            let (c, r) = keep[rng.below(keep.len())].clone();
            let n = seen.entry(r).or_default();
            *n += 1;
            repeated |= *n == 2;
            assert!(
                is_terminal(&c, &rules).is_none(),
                "a draw-keeping move ended the game"
            );
            s = c;
        }
        let out: Vec<(GameState, u16)> = legal_moves(&s)
            .into_iter()
            .filter_map(|m| {
                let c = apply_move(&s, m).unwrap();
                match decode(t[g.rank(&Board::from_state(&c)) as usize]) {
                    Value::Win(d) if d <= max_dist => Some((c, d)),
                    _ => None,
                }
            })
            .collect();
        if out.is_empty() {
            continue;
        }
        let (c, d) = out[rng.below(out.len())].clone();
        // The exit itself never triggers the repetition rule (claim 2: c is new).
        let fresh = is_terminal(&c, &rules).is_none() && c.occurrences_before() == 0;
        let wins = fresh && engine_wins_within(&c, &rules, d as u32, &mut nodes);
        let faster = d >= 3 && engine_wins_within(&c, &rules, d as u32 - 2, &mut nodes);
        let e = rows.entry(d).or_default();
        e.0 += 1;
        e.1 += wins as u64;
        e.2 += faster as u64;
        with_repeats += repeated as u64;
        walk_lengths.push(s.move_count());
        done += 1;
    }
    walk_lengths.sort_unstable();
    let by_dist: BTreeMap<String, Json> = rows
        .iter()
        .map(|(d, &(n, ok, fast))| {
            (
                format!("win_in_{d}"),
                json!({"sampled": n, "opponent_wins_within_d": ok, "opponent_wins_within_d_minus_2": fast}),
            )
        })
        .collect();
    Ok(json!({
        "method": "random lc1-2 games inside G on the engine (history kept), then a random exit into an uncapped win in d plies for the opponent; plain negamax on the engine under lc1-2, no table",
        "samples": done,
        "samples_whose_walk_repeated_a_position": with_repeats,
        "walk_plies_median": walk_lengths.get(walk_lengths.len() / 2),
        "walk_plies_max": walk_lengths.last(),
        "by_distance": by_dist,
        "negamax_nodes": nodes,
    }))
}
