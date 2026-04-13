use anyhow::Context;
use flate2::write::GzEncoder;
use flate2::Compression;
use pogofish_engine::{initial_state, RuleSet};
use pogofish_search::minimax::{solve_full, SolveConfig};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::time::Instant;

fn print_usage(prog: &str) {
    eprintln!("Usage: {prog} <variant> <output_path>");
    eprintln!();
    eprintln!("  variant:     lc1-N | lc2-N | lc3-N  (e.g. lc2-15, lc3-30)");
    eprintln!("  output_path: path for gzipped JSONL output (e.g. solve.jsonl.gz)");
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

fn state_key_hex(key: &pogofish_engine::StateKey) -> String {
    key.0.iter().map(|b| format!("{b:02x}")).collect()
}

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

    println!("Pogofish Full Solve");
    println!("  Variant:    {variant}");
    println!("  Max depth:  {max_depth}");
    println!("  Output:     {}", output_path.display());
    println!();
    println!("Solving from initial position (single pass, shared TT)...");
    println!();

    let start = Instant::now();
    let root = initial_state();
    let cfg = SolveConfig { max_depth, use_tt: true };

    // Progress callback: prints a live status line every 100k nodes
    let progress = |nodes: u64, tt_size: usize| {
        let elapsed = start.elapsed().as_secs_f64();
        let rate = nodes as f64 / elapsed;
        eprint!(
            "\r  {:>12} nodes | {:>8} TT entries | {:>10.0} nodes/s | {:.0}s  ",
            nodes, tt_size, rate, elapsed
        );
        let _ = std::io::stderr().flush();
    };

    let (result, tt) = solve_full(&root, &rules, cfg, Some(&progress));

    eprintln!(); // clear progress line
    println!();

    let elapsed = start.elapsed().as_secs_f64();
    let game_result = match result.value {
        1 => "white_wins",
        -1 => "red_wins",
        0 => "draw",
        _ => "unknown",
    };

    // Count decisive positions in the TT
    let mut white_wins = 0usize;
    let mut red_wins = 0usize;
    let mut draws = 0usize;
    for entry in tt.values() {
        match entry.value {
            1 => white_wins += 1,
            -1 => red_wins += 1,
            _ => draws += 1,
        }
    }
    let decisive = white_wins + red_wins;

    println!("=== Summary ===");
    println!("  TT entries:      {}", tt.len());
    println!("  Decisive:        {decisive} ({:.1}%)", decisive as f64 / tt.len().max(1) as f64 * 100.0);
    println!("    Mover wins:    {white_wins}");
    println!("    Mover loses:   {red_wins}");
    println!("    Draws/unknown: {draws}");
    println!("  Initial result:  {game_result}");
    println!("  Nodes explored:  {}", result.nodes_explored);
    println!("  Elapsed:         {elapsed:.1}s");
    println!("  Rate:            {:.0} nodes/s", result.nodes_explored as f64 / elapsed);

    // Export TT to gzipped JSONL
    println!();
    println!("Writing {} entries to {}...", tt.len(), output_path.display());

    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).context("creating output directory")?;
        }
    }

    let file = File::create(&output_path)
        .with_context(|| format!("creating {}", output_path.display()))?;
    let mut gz = GzEncoder::new(file, Compression::default());

    let mut written = 0usize;
    for (key, entry) in &tt {
        let hex = state_key_hex(key);
        let best_move_json = match entry.best_move {
            Some(mv) => format!(
                "{{\"from_cell\":{},\"num_pieces\":{},\"to_cell\":{}}}",
                mv.from_cell, mv.num_pieces, mv.to_cell
            ),
            None => "null".to_string(),
        };
        writeln!(
            gz,
            "{{\"key\":\"{hex}\",\"value\":{},\"best_move\":{best_move_json}}}",
            entry.value
        )?;
        written += 1;
        if written % 100_000 == 0 {
            eprint!("\r  Written {written}/{}...", tt.len());
            let _ = std::io::stderr().flush();
        }
    }
    gz.finish().context("finalizing gzip")?;
    eprintln!();

    let file_size = std::fs::metadata(&output_path)?.len();
    println!("  Output: {} ({:.1} MB)", output_path.display(), file_size as f64 / 1_048_576.0);

    // Write meta file
    let meta_path = output_path.with_extension("meta.json");
    let meta = serde_json::json!({
        "variant": variant,
        "tt_entries": tt.len(),
        "decisive": decisive,
        "mover_wins": white_wins,
        "mover_loses": red_wins,
        "draws_unknown": draws,
        "result": game_result,
        "nodes_explored": result.nodes_explored,
        "solve_seconds": (elapsed * 10.0).round() / 10.0,
    });
    std::fs::write(&meta_path, serde_json::to_string_pretty(&meta)?)
        .with_context(|| format!("writing {}", meta_path.display()))?;
    println!("  Meta:   {}", meta_path.display());

    Ok(())
}
