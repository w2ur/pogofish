use anyhow::Context;
use flate2::write::GzEncoder;
use flate2::Compression;
use pogofish_engine::{apply_move, initial_state, is_terminal, legal_moves, GameState, RuleSet, StateKey};
use pogofish_search::minimax::{solve, SolveConfig};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::time::Instant;

fn print_usage(prog: &str) {
    eprintln!("Usage: {prog} <variant> <output_path>");
    eprintln!();
    eprintln!("  variant:     lc1-N | lc2-N | lc3-N  (e.g. lc2-15, lc3-30)");
    eprintln!("  output_path: path for the gzipped JSON output (e.g. solve.json.gz)");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  {prog} lc2-15 models/solve_lc2_15.json.gz");
    eprintln!("  {prog} lc3-30 models/solve_lc3_30.json.gz");
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
        other => anyhow::bail!("unknown rule type: '{other}' (expected lc1, lc2, or lc3)"),
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

#[derive(Debug, Serialize, Deserialize)]
struct MoveSerialized {
    from_cell: u8,
    num_pieces: u8,
    to_cell: u8,
}

#[derive(Debug, Serialize, Deserialize)]
struct PositionEntry {
    value: i8,
    best_move: Option<MoveSerialized>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Meta {
    variant: String,
    total_states: usize,
    decisive: usize,
    result: String,
    solve_seconds: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct SolveTable {
    meta: Meta,
    positions: HashMap<String, PositionEntry>,
}

fn enumerate_reachable(rules: &RuleSet) -> Vec<GameState> {
    let root = initial_state();
    let mut visited: HashSet<StateKey> = HashSet::new();
    let mut frontier: VecDeque<GameState> = VecDeque::new();
    let mut all_states: Vec<GameState> = Vec::new();

    let root_key = root.key();
    visited.insert(root_key);
    frontier.push_back(root.clone());
    all_states.push(root);

    while let Some(state) = frontier.pop_front() {
        if is_terminal(&state, rules).is_some() {
            continue;
        }
        for mv in legal_moves(&state) {
            let next = match apply_move(&state, mv) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let key = next.key();
            if visited.insert(key) {
                frontier.push_back(next.clone());
                all_states.push(next);
            }
        }
    }

    all_states
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

    let start = Instant::now();

    println!("Phase 1: Enumerating reachable positions...");
    let states = enumerate_reachable(&rules);
    println!("  Found {} reachable positions", states.len());
    println!();

    println!("Phase 2: Solving each position...");
    let cfg = SolveConfig { max_depth, use_tt: true };
    let mut positions: HashMap<String, PositionEntry> = HashMap::with_capacity(states.len());
    let mut decisive = 0usize;

    for (i, state) in states.iter().enumerate() {
        if i % 1000 == 0 && i > 0 {
            println!("  Solved {i}/{} positions...", states.len());
        }

        let result = solve(state, &rules, cfg);
        let hex_key = state_key_hex(&state.key());

        if result.value != 0 {
            decisive += 1;
        }

        positions.insert(
            hex_key,
            PositionEntry {
                value: result.value,
                best_move: result.best_move.map(|mv| MoveSerialized {
                    from_cell: mv.from_cell,
                    num_pieces: mv.num_pieces,
                    to_cell: mv.to_cell,
                }),
            },
        );
    }

    println!("  Done. Solved {} positions total.", positions.len());
    println!();

    // Determine the game-theoretic result of the initial position
    let initial = initial_state();
    let initial_hex = state_key_hex(&initial.key());
    let game_result = positions
        .get(&initial_hex)
        .map(|entry| match entry.value {
            1 => "white_wins",
            -1 => "red_wins",
            0 => "draw",
            _ => "unknown",
        })
        .unwrap_or("unknown")
        .to_string();

    let elapsed = start.elapsed().as_secs_f64();

    let table = SolveTable {
        meta: Meta {
            variant: variant.clone(),
            total_states: positions.len(),
            decisive,
            result: game_result.clone(),
            solve_seconds: elapsed,
        },
        positions,
    };

    println!("Phase 3: Writing output to {}...", output_path.display());

    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("failed to create directory {}", parent.display()))?;
        }
    }

    let file =
        File::create(&output_path).with_context(|| format!("failed to create {}", output_path.display()))?;
    let mut gz = GzEncoder::new(file, Compression::default());
    let json = serde_json::to_string(&table).context("failed to serialize solve table")?;
    gz.write_all(json.as_bytes()).context("failed to write gzipped JSON")?;
    gz.finish().context("failed to finalize gzip stream")?;

    println!("  Done.");
    println!();
    println!("=== Summary ===");
    println!("  Total states:    {}", table.meta.total_states);
    println!("  Decisive states: {decisive}");
    println!("  Initial result:  {game_result}");
    println!("  Elapsed:         {elapsed:.1}s");

    Ok(())
}
