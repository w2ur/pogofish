//! Measure the uncapped game with scripted players (plan task 1.2).
//!
//! Usage: measure [--games N] [--seed S] [--max-plies P] [--threads T] [--out FILE]
//!
//! Plays N games per pairing (random/random, greedy/random, random/greedy,
//! greedy/greedy) from the initial position under the base rule only. A game
//! still running after P plies is reported as unfinished, never as a draw.
//! Writes a JSON report (stdout if no --out).

use anyhow::{bail, Context};
use pogofish_search::measure::{
    falsification_check, play_many, summarise, FalsificationCheck, PairingReport,
};
use pogofish_search::players::Scripted;
use serde::Serialize;
use std::time::Instant;

#[derive(Serialize)]
struct Machine {
    os: &'static str,
    arch: &'static str,
    cpu: String,
    threads_used: usize,
}

#[derive(Serialize)]
struct Run {
    games_per_pairing: u32,
    seed: u64,
    max_plies: u32,
    wall_seconds: f64,
    games_per_second: f64,
    peak_rss_mib: f64,
}

#[derive(Serialize)]
struct Report {
    what: &'static str,
    machine: Machine,
    run: Run,
    falsification_check: FalsificationCheck,
    pairings: Vec<PairingReport>,
}

struct Args {
    games: u32,
    seed: u64,
    max_plies: u32,
    threads: usize,
    out: Option<String>,
}

fn parse_args() -> anyhow::Result<Args> {
    let mut args = Args {
        games: 1000,
        seed: 1,
        max_plies: 1000,
        threads: std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1),
        out: None,
    };
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < raw.len() {
        let value = raw
            .get(i + 1)
            .with_context(|| format!("{} needs a value", raw[i]));
        match raw[i].as_str() {
            "--games" => args.games = value?.parse().context("--games")?,
            "--seed" => args.seed = value?.parse().context("--seed")?,
            "--max-plies" => args.max_plies = value?.parse().context("--max-plies")?,
            "--threads" => args.threads = value?.parse().context("--threads")?,
            "--out" => args.out = Some(value?.clone()),
            other => bail!("unknown argument {other}"),
        }
        i += 2;
    }
    if args.games == 0 {
        bail!("--games must be positive");
    }
    Ok(args)
}

fn cpu_name() -> String {
    std::fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("model name"))
                .and_then(|l| l.split(':').nth(1))
                .map(|v| v.trim().to_string())
        })
        .unwrap_or_else(|| "unknown".to_string())
}

/// Peak resident set size of this process, in MiB.
fn peak_rss_mib() -> f64 {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) };
    // ru_maxrss is in KiB on Linux and in bytes on macOS.
    let raw = usage.ru_maxrss as f64;
    if cfg!(target_os = "macos") {
        raw / (1024.0 * 1024.0)
    } else {
        raw / 1024.0
    }
}

fn main() -> anyhow::Result<()> {
    let args = parse_args()?;
    let t0 = Instant::now();

    let check = falsification_check(50, args.seed);
    if !check.passed {
        bail!("falsification check failed, refusing to measure: {check:?}");
    }
    eprintln!("falsification check passed ({} games)", check.games);

    let pairings = [
        (Scripted::Random, Scripted::Random),
        (Scripted::Greedy, Scripted::Random),
        (Scripted::Random, Scripted::Greedy),
        (Scripted::Greedy, Scripted::Greedy),
    ];
    let mut reports = Vec::new();
    for (p, &(white, red)) in pairings.iter().enumerate() {
        let t = Instant::now();
        let records = play_many(
            white,
            red,
            args.games,
            args.max_plies,
            args.seed,
            p as u64,
            args.threads,
        );
        let rep = summarise(white, red, &records);
        eprintln!(
            "{}/{}: {} games in {:.1}s, decisive {:.3}, unfinished {}",
            white.name(),
            red.name(),
            rep.games,
            t.elapsed().as_secs_f64(),
            rep.decisive_rate,
            rep.unfinished
        );
        reports.push(rep);
    }

    let wall = t0.elapsed().as_secs_f64();
    let total_games = args.games as f64 * pairings.len() as f64;
    let report = Report {
        what: "Uncapped Pogo (base rule only) between scripted players, from the initial position",
        machine: Machine {
            os: std::env::consts::OS,
            arch: std::env::consts::ARCH,
            cpu: cpu_name(),
            threads_used: args.threads,
        },
        run: Run {
            games_per_pairing: args.games,
            seed: args.seed,
            max_plies: args.max_plies,
            wall_seconds: wall,
            games_per_second: total_games / wall,
            peak_rss_mib: peak_rss_mib(),
        },
        falsification_check: check,
        pairings: reports,
    };
    let json = serde_json::to_string_pretty(&report)?;
    match args.out {
        Some(path) => {
            std::fs::write(&path, json + "\n").with_context(|| format!("writing {path}"))?
        }
        None => println!("{json}"),
    }
    Ok(())
}
