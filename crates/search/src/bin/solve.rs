use anyhow::Context;
use flate2::write::GzEncoder;
use flate2::Compression;
use pogofish_engine::{
    apply_move, initial_state, is_terminal, legal_moves, GameState, RuleSet, StateKey,
};
use pogofish_search::minimax::{solve, SolveConfig};
use std::collections::{HashSet, VecDeque};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::time::Instant;

fn print_usage(prog: &str) {
    eprintln!("Usage: {prog} <variant> <output_path>");
    eprintln!();
    eprintln!("  variant:     lc1-N | lc2-N | lc3-N  (e.g. lc2-15, lc3-30)");
    eprintln!("  output_path: path for the gzipped JSONL output (e.g. solve.jsonl.gz)");
}

fn parse_ruleset(variant: &str) -> anyhow::Result<RuleSet> {
    let parts: Vec<&str> = variant.splitn(2, '-').collect();
    if parts.len() != 2 {
        anyhow::bail!("variant must be in format lc1-N, lc2-N, or lc3-N, got: '{variant}'");
    }
    let n: u16 = parts[1]
        .parse()
        .map_err(|_| anyhow::anyhow!("invalid number in variant: '{variant}'"))?;
    match parts[0] {
        "lc1" => Ok(RuleSet::LC1 { repetitions: n as u8 }),
        "lc2" => Ok(RuleSet::LC2 { cap: n }),
        "lc3" => Ok(RuleSet::LC3 { cap: n }),
        other => anyhow::bail!("unknown rule type: '{other}'"),
    }
}

fn max_depth_for_rules(rules: &RuleSet) -> u16 {
    match *rules {
        RuleSet::LC1 { .. } => 30,
        RuleSet::LC2 { cap } => cap,
        RuleSet::LC3 { cap } => cap,
    }
}

fn state_key_hex(key: &StateKey) -> String {
    key.0.iter().map(|b| format!("{b:02x}")).collect()
}

/// Streaming solve: BFS to enumerate positions, solve each during traversal,
/// write results to gzipped JSONL immediately. Only the visited-key set and
/// BFS frontier stay in memory — no position accumulation.
fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let prog = args.first().map(String::as_str).unwrap_or("solve");

    if args.len() < 3 {
        print_usage(prog);
        std::process::exit(1);
    }

    let variant = &args[1];
    let output_path = PathBuf::from(&args[2]);

    let rules = parse_ruleset(variant)?;
    let max_depth = max_depth_for_rules(&rules);

    println!("Pogofish Full Solve (streaming)");
    println!("  Variant:    {variant}");
    println!("  Max depth:  {max_depth}");
    println!("  Output:     {}", output_path.display());
    println!();

    // Create output file for streaming writes
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .context("creating output directory")?;
        }
    }
    let file = File::create(&output_path)
        .with_context(|| format!("creating {}", output_path.display()))?;
    let mut gz = GzEncoder::new(file, Compression::default());

    let start = Instant::now();
    let cfg = SolveConfig { max_depth, use_tt: true };

    // BFS + solve + stream
    let root = initial_state();
    let mut visited: HashSet<StateKey> = HashSet::new();
    let mut frontier: VecDeque<GameState> = VecDeque::new();

    visited.insert(root.key());
    frontier.push_back(root.clone());

    let mut total = 0usize;
    let mut decisive = 0usize;
    let mut white_wins = 0usize;
    let mut red_wins = 0usize;
    let mut draws = 0usize;
    let mut initial_value: i8 = 0;
    let mut total_nodes = 0u64;
    let mut last_report = Instant::now();

    println!("Solving positions (BFS + minimax)...");
    println!();

    while let Some(state) = frontier.pop_front() {
        let key = state.key();
        let hex = state_key_hex(&key);

        let result = solve(&state, &rules, cfg);

        match result.value {
            1 => { decisive += 1; white_wins += 1; }
            -1 => { decisive += 1; red_wins += 1; }
            0 => { draws += 1; }
            _ => {}
        }
        total_nodes += result.nodes_explored;
        if total == 0 {
            initial_value = result.value;
        }

        // Write to stream
        let best_move_json = match result.best_move {
            Some(mv) => format!(
                "{{\"from_cell\":{},\"num_pieces\":{},\"to_cell\":{}}}",
                mv.from_cell, mv.num_pieces, mv.to_cell
            ),
            None => "null".to_string(),
        };
        writeln!(
            gz,
            "{{\"key\":\"{hex}\",\"value\":{},\"best_move\":{best_move_json}}}",
            result.value
        )?;

        total += 1;

        // Progress every 2 seconds
        if last_report.elapsed().as_secs_f64() >= 2.0 {
            let elapsed = start.elapsed().as_secs_f64();
            let rate = total as f64 / elapsed;
            let pct_decisive = if total > 0 { decisive as f64 / total as f64 * 100.0 } else { 0.0 };
            eprint!(
                "\r  {:>8} solved | {:>6} frontier | {:>6} visited | {:.0}/s | {:.0}% decisive | W:{} R:{} D:{} | {:.0}s  ",
                total, frontier.len(), visited.len(), rate, pct_decisive,
                white_wins, red_wins, draws, elapsed
            );
            use std::io::Write as _;
            let _ = std::io::stderr().flush();
            last_report = Instant::now();
        }

        // Expand children (only if non-terminal)
        if is_terminal(&state, &rules).is_none() {
            for mv in legal_moves(&state) {
                let next = match apply_move(&state, mv) {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                let next_key = next.key();
                if visited.insert(next_key) {
                    frontier.push_back(next);
                }
            }
        }
    }

    gz.finish().context("finalizing gzip")?;

    let elapsed = start.elapsed().as_secs_f64();
    let game_result = match initial_value {
        1 => "white_wins",
        -1 => "red_wins",
        0 => "draw",
        _ => "unknown",
    };

    eprintln!(); // clear the progress line
    println!();
    println!("=== Summary ===");
    println!("  Total positions: {total}");
    println!("  Decisive:        {decisive} ({:.1}%)", decisive as f64 / total.max(1) as f64 * 100.0);
    println!("    White wins:    {white_wins}");
    println!("    Red wins:      {red_wins}");
    println!("    Draws:         {draws}");
    println!("  Initial result:  {game_result}");
    println!("  Minimax nodes:   {total_nodes}");
    println!("  Elapsed:         {elapsed:.1}s");
    println!("  Rate:            {:.0} positions/s", total as f64 / elapsed);
    println!("  Visited keys:    {}", visited.len());

    // Write a separate meta file alongside the main output
    let meta_path = output_path.with_extension("meta.json");
    let meta = serde_json::json!({
        "variant": variant,
        "total_states": total,
        "decisive": decisive,
        "result": game_result,
        "solve_seconds": (elapsed * 10.0).round() / 10.0,
    });
    std::fs::write(&meta_path, serde_json::to_string_pretty(&meta)?)
        .with_context(|| format!("writing {}", meta_path.display()))?;
    println!("  Meta written to: {}", meta_path.display());

    Ok(())
}
