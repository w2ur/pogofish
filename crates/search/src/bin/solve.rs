use anyhow::Context;
use flate2::write::GzEncoder;
use flate2::Compression;
use pogofish_engine::{initial_state, RuleSet};
use pogofish_search::minimax::{solve_full, SolveConfig, TTEntry};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
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

fn write_results(
    output_path: &PathBuf,
    variant: &str,
    tt: &HashMap<pogofish_engine::StateKey, TTEntry>,
    nodes: u64,
    elapsed: f64,
    partial: bool,
) -> anyhow::Result<()> {
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
    let status = if partial { "PARTIAL" } else { "complete" };

    println!();
    println!("=== Summary ({status}) ===");
    println!("  TT entries:      {}", tt.len());
    println!("  Decisive:        {decisive} ({:.1}%)", decisive as f64 / tt.len().max(1) as f64 * 100.0);
    println!("    Mover wins:    {white_wins}");
    println!("    Mover loses:   {red_wins}");
    println!("    Draws/unknown: {draws}");
    println!("  Nodes explored:  {nodes}");
    println!("  Elapsed:         {elapsed:.1}s");
    println!("  Rate:            {:.0} nodes/s", nodes as f64 / elapsed.max(0.001));

    println!();
    println!("Writing {} entries to {}...", tt.len(), output_path.display());

    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).context("creating output directory")?;
        }
    }

    let file = File::create(output_path)
        .with_context(|| format!("creating {}", output_path.display()))?;
    let mut gz = GzEncoder::new(file, Compression::default());

    let mut written = 0usize;
    for (key, entry) in tt {
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

    let file_size = std::fs::metadata(output_path)?.len();
    println!("  Output: {} ({:.1} MB)", output_path.display(), file_size as f64 / 1_048_576.0);

    // Write meta file
    let meta_path = output_path.with_extension("meta.json");
    let meta = serde_json::json!({
        "variant": variant,
        "partial": partial,
        "tt_entries": tt.len(),
        "decisive": decisive,
        "mover_wins": white_wins,
        "mover_loses": red_wins,
        "draws_unknown": draws,
        "nodes_explored": nodes,
        "solve_seconds": (elapsed * 10.0).round() / 10.0,
    });
    std::fs::write(&meta_path, serde_json::to_string_pretty(&meta)?)
        .with_context(|| format!("writing {}", meta_path.display()))?;
    println!("  Meta:   {}", meta_path.display());

    Ok(())
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

    // SIGINT handler — sets flag, solver checks it every 100k nodes
    let interrupted = Arc::new(AtomicBool::new(false));
    unsafe {
        libc::signal(libc::SIGINT, {
            extern "C" fn handler(_: libc::c_int) {
                // Can't access the Arc directly from a signal handler,
                // so we use a global atomic.
                SOLVE_INTERRUPTED.store(true, Ordering::SeqCst);
            }
            handler as *const () as libc::sighandler_t
        });
    }
    // Bridge: a thread that copies the global flag to our local Arc
    let flag2 = interrupted.clone();
    std::thread::spawn(move || loop {
        if SOLVE_INTERRUPTED.load(Ordering::SeqCst) {
            flag2.store(true, Ordering::SeqCst);
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    });

    println!("Pogofish Full Solve");
    println!("  Variant:    {variant}");
    println!("  Max depth:  {max_depth}");
    println!("  Output:     {}", output_path.display());
    println!("  Ctrl+C:     saves partial results");
    println!();
    println!("Solving from initial position (single pass, shared TT)...");
    println!();

    let start = Instant::now();
    let root = initial_state();
    let cfg = SolveConfig { max_depth, use_tt: true };

    let progress = |nodes: u64, tt_size: usize| {
        let elapsed = start.elapsed().as_secs_f64();
        let rate = nodes as f64 / elapsed;
        eprint!(
            "\r  {:>12} nodes | {:>8} TT entries | {:>10.0} nodes/s | {:.0}s  ",
            nodes, tt_size, rate, elapsed
        );
        let _ = std::io::stderr().flush();
    };

    let (result, tt) = solve_full(&root, &rules, cfg, Some(&progress), Some(&interrupted));

    eprintln!(); // clear progress line

    let elapsed = start.elapsed().as_secs_f64();
    let was_interrupted = interrupted.load(Ordering::Relaxed);

    if was_interrupted {
        println!();
        println!("*** Interrupted! Saving partial results... ***");
    } else {
        let game_result = match result.value {
            1 => "white_wins",
            -1 => "red_wins",
            0 => "draw",
            _ => "unknown",
        };
        println!("  Initial result:  {game_result}");
    }

    write_results(&output_path, variant, &tt, result.nodes_explored, elapsed, was_interrupted)?;

    Ok(())
}

static SOLVE_INTERRUPTED: AtomicBool = AtomicBool::new(false);
