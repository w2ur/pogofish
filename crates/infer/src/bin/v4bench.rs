//! Round 4: one protocol for every player (`docs/experiments/v4-evaluation.md`).
//!
//! ```text
//! v4bench <table-dir> <player-spec> --out <json> [--pairs 1000] [--seed 404]
//!         [--sample-seed 31] [--threads 4] [--sample-cap N] [--opponent greedy|random]
//! ```
//!
//! Measures one player two ways, without libtorch:
//!
//! 1. **Value kept** on round 3's held-out sample of the solved uncapped game
//!    (`perfect learn` draw order: 10,000 won-in-3-or-more and 10,000 drawn
//!    positions after 20,000 + 20,000 training ones): per position, the chance
//!    that a uniform pick from the player's tied set keeps the uncapped value;
//!    mean over positions, 95 % interval over positions (round 3's method).
//!    Positions come from `unrank`: they carry no history, so a net with
//!    repetition features reads "never seen" (`"history": "none"`).
//! 2. **Score against greedy** under `lc1-2` in the arena: colour-swapped
//!    pairs from random 4-ply openings, 1,000-ply limit; unfinished games are
//!    counted apart and never scored. `--opponent random` plays the bench's
//!    `random` player instead (it takes a win and avoids an immediate loss),
//!    not the arena's uniform `Scripted::Random`.
//!
//! For a `qtab:` player the JSON also holds `keep_visited` (the keep rates
//! on the measured positions with at least one move to a visited position,
//! with n) and `coverage` (positions visited, and their share of the
//! reachable ones).
//!
//! Before measuring, falsification controls run on the full held-out sample:
//! the table oracle must keep 1.000 / 1.000, the anti-oracle must equal the
//! share of positions where every move keeps (round 3: 0.008 / 0.000), and
//! random must reproduce round 3's 0.360 / 0.112 to the third decimal.
//! `--sample-cap N` measures the player on the first N positions of each
//! class only (a pilot); the controls still use the full sample.
//!
//! Exit: 0 measured; 2 could not run (bad arguments, a table that is not the
//! documented one, a failed control) — then no JSON is written, and a JSON
//! left at `--out` by an earlier run is deleted first. The bench
//! reports figures and has no finding of its own, so it never exits 1.

use anyhow::{bail, ensure, Context};
use pogofish_engine::RuleSet;
use pogofish_infer::players::{
    keep_of, player_from_spec, rate_stat, AntiOracle, RateStat, TablePlayer, TiedAgent,
    TiedChooser, TABLE_TIEBREAK,
};
use pogofish_search::arena::{run_match, ArenaConfig};
use pogofish_search::perfect::{build_sample, held_out, Sample, Solved};
use pogofish_search::players::Scripted;
use serde_json::{json, Value as Json};
use std::path::Path;
use std::process::{Command, ExitCode};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };
const OPENING_PLIES: u32 = 4;
const MAX_PLIES: u32 = 1000;
const TRAIN_PER_CLASS: usize = 20_000;
const TEST_PER_CLASS: usize = 10_000;
/// SHA-256 of `table.bin` as documented in `docs/experiments/v3-solve.md` and `v4-evaluation.md`.
const TABLE_SHA256: &str = "1690c767b68a6214eb1fb4d74d932198a13f67c744b7c6e61102eeb44c5e3704";
/// The sample seed the round-3 control values belong to.
const ROUND3_SAMPLE_SEED: u64 = 31;
/// Round 3's held-out rates (won, drawn), `v3-principles-perfect.md`.
const ORACLE: (f64, f64) = (1.0, 1.0);
const ANTI_ORACLE: (f64, f64) = (0.008, 0.000);
const RANDOM: (f64, f64) = (0.360, 0.112);

struct Args {
    table: String,
    spec: String,
    out: String,
    pairs: u32,
    seed: u64,
    sample_seed: u64,
    threads: usize,
    sample_cap: Option<usize>,
    opponent: String,
}

fn parse_args(argv: &[String]) -> anyhow::Result<Args> {
    let mut pos = Vec::new();
    let mut out = None;
    let (mut pairs, mut seed, mut sample_seed, mut threads, mut cap) = (1000, 404, 31, 4, None);
    let mut opponent = "greedy".to_string();
    let mut it = argv.iter();
    while let Some(a) = it.next() {
        if !a.starts_with("--") {
            pos.push(a.clone());
            continue;
        }
        let v = it.next().with_context(|| format!("{a} needs a value"))?;
        match a.as_str() {
            "--out" => out = Some(v.clone()),
            "--pairs" => pairs = v.parse()?,
            "--seed" => seed = v.parse()?,
            "--sample-seed" => sample_seed = v.parse()?,
            "--threads" => threads = v.parse()?,
            "--sample-cap" => cap = Some(v.parse()?),
            "--opponent" => opponent = v.clone(),
            _ => bail!("unknown option {a}"),
        }
    }
    let usage = "usage: v4bench <table-dir> <player-spec> --out <json> [--pairs 1000] \
                 [--seed 404] [--sample-seed 31] [--threads 4] [--sample-cap N] \
                 [--opponent greedy|random]";
    ensure!(pos.len() == 2, "{usage}");
    ensure!(
        threads >= 1 && pairs >= 1,
        "--threads and --pairs must be at least 1"
    );
    ensure!(
        opponent == "greedy" || opponent == "random",
        "--opponent must be greedy or random, got {opponent}"
    );
    Ok(Args {
        table: pos[0].clone(),
        spec: pos[1].clone(),
        out: out.context(usage)?,
        pairs,
        seed,
        sample_seed,
        threads,
        sample_cap: cap,
        opponent,
    })
}

fn peak_rss_mib() -> f64 {
    let mut u: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut u) };
    // macOS reports bytes.
    u.ru_maxrss as f64 / (1024.0 * 1024.0)
}

fn sha256(path: &Path) -> anyhow::Result<String> {
    let out = Command::new("shasum")
        .args(["-a", "256"])
        .arg(path)
        .output()
        .context("running shasum")?;
    ensure!(out.status.success(), "shasum failed on {}", path.display());
    let text = String::from_utf8(out.stdout)?;
    Ok(text
        .split_whitespace()
        .next()
        .context("empty shasum output")?
        .to_string())
}

fn git_rev() -> String {
    let run = |args: &[&str]| {
        Command::new("git")
            .arg("-C")
            .arg(env!("CARGO_MANIFEST_DIR"))
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };
    match run(&["rev-parse", "HEAD"]) {
        Some(rev) => {
            let dirty = run(&["status", "--porcelain", "--untracked-files=no"])
                .is_some_and(|s| !s.is_empty());
            if dirty {
                format!("{rev}-dirty")
            } else {
                rev
            }
        }
        None => "unknown".into(),
    }
}

/// Run `job(i)` for `i` in `0..n` on `workers.len()` threads, each owning
/// one worker; results in index order.
fn par_map<W: Send, T: Send>(
    n: usize,
    workers: Vec<W>,
    job: impl Fn(&mut W, usize) -> T + Sync,
) -> Vec<T> {
    let next = AtomicUsize::new(0);
    let out: Mutex<Vec<Option<T>>> = Mutex::new((0..n).map(|_| None).collect());
    std::thread::scope(|s| {
        for mut w in workers {
            let (next, out, job) = (&next, &out, &job);
            s.spawn(move || loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= n {
                    break;
                }
                let r = job(&mut w, i);
                out.lock().unwrap()[i] = Some(r);
            });
        }
    });
    out.into_inner()
        .unwrap()
        .into_iter()
        .map(|x| x.expect("every index done"))
        .collect()
}

/// Keep rates (won, drawn) of a chooser, one instance per thread.
fn keep<'a>(
    won: &[Sample],
    drawn: &[Sample],
    threads: usize,
    make: impl Fn() -> anyhow::Result<Box<dyn TiedChooser + 'a>>,
) -> anyhow::Result<(RateStat, RateStat)> {
    let mut stats = Vec::new();
    for set in [won, drawn] {
        let workers = (0..threads)
            .map(|_| make())
            .collect::<anyhow::Result<Vec<_>>>()?;
        let rates = par_map(set.len(), workers, |p, i| {
            keep_of(&set[i], &p.tied(&set[i].state, &RULES))
        });
        stats.push(rate_stat(&rates));
    }
    Ok((stats[0], stats[1]))
}

fn class_json(r: (RateStat, RateStat)) -> Json {
    json!({"won": r.0, "drawn": r.1})
}

fn round3(x: f64) -> i64 {
    (x * 1000.0).round() as i64
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("v4bench: {e:#}");
            ExitCode::from(2)
        }
    }
}

fn run() -> anyhow::Result<()> {
    let argv: Vec<String> = std::env::args().collect();
    let a = parse_args(&argv[1..])?;
    // A JSON left by an earlier run must not survive a run that fails.
    match std::fs::remove_file(&a.out) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            return Err(e).with_context(|| format!("removing the stale {}", a.out));
        }
        _ => {}
    }
    let t0 = Instant::now();
    // Fail on a bad spec before loading the table.
    if a.spec != "table" {
        player_from_spec(&a.spec, None)?;
    }

    let dir = Path::new(&a.table);
    let t = Instant::now();
    let sha = sha256(&dir.join("table.bin"))?;
    ensure!(
        sha == TABLE_SHA256,
        "table.bin SHA-256 {sha} is not the documented {TABLE_SHA256}"
    );
    let sha_s = t.elapsed().as_secs_f64();
    let t = Instant::now();
    let sv = Solved::load(dir)?;
    let load_s = t.elapsed().as_secs_f64();

    let t = Instant::now();
    let (iw, id) = held_out(&sv, TRAIN_PER_CLASS, TEST_PER_CLASS, a.sample_seed);
    let build = |idx: &[u64]| {
        par_map(idx.len(), vec![(); a.threads], |_, i| {
            build_sample(&sv, idx[i])
        })
    };
    let (won, drawn) = (build(&iw), build(&id));
    let sample_s = t.elapsed().as_secs_f64();
    eprintln!("held-out sample built in {sample_s:.1} s");

    // Controls, on the full held-out sample.
    let t = Instant::now();
    let oracle = keep(&won, &drawn, a.threads, || {
        Ok(Box::new(TablePlayer { sv: &sv }))
    })?;
    let anti = keep(&won, &drawn, a.threads, || {
        Ok(Box::new(AntiOracle { sv: &sv }))
    })?;
    let random = keep(&won, &drawn, a.threads, || player_from_spec("random", None))?;
    let all_keep = |set: &[Sample]| {
        set.iter().filter(|s| s.keeps.iter().all(|&k| k)).count() as f64 / set.len() as f64
    };
    let every = (all_keep(&won), all_keep(&drawn));
    let controls_s = t.elapsed().as_secs_f64();
    let check = |name: &str, got: (RateStat, RateStat), want: (f64, f64)| -> anyhow::Result<()> {
        ensure!(
            round3(got.0.rate) == round3(want.0) && round3(got.1.rate) == round3(want.1),
            "control failed: {name} keeps {:.4} / {:.4}, expected {:.3} / {:.3}",
            got.0.rate,
            got.1.rate,
            want.0,
            want.1
        );
        Ok(())
    };
    check("table oracle", oracle, ORACLE)?;
    ensure!(
        (anti.0.rate - every.0).abs() < 1e-12 && (anti.1.rate - every.1).abs() < 1e-12,
        "control failed: anti-oracle keeps {:.4} / {:.4}, positions where every move keeps \
         {:.4} / {:.4}",
        anti.0.rate,
        anti.1.rate,
        every.0,
        every.1
    );
    let compared = a.sample_seed == ROUND3_SAMPLE_SEED;
    if compared {
        check("anti-oracle", anti, ANTI_ORACLE)?;
        check("random", random, RANDOM)?;
    }
    eprintln!(
        "controls pass: oracle {:.3}/{:.3}, anti-oracle {:.3}/{:.3}, random {:.3}/{:.3}",
        oracle.0.rate, oracle.1.rate, anti.0.rate, anti.1.rate, random.0.rate, random.1.rate
    );

    // The player's keep rates, on the (possibly capped) sample.
    let cap = a.sample_cap.unwrap_or(TEST_PER_CLASS).min(TEST_PER_CLASS);
    let t = Instant::now();
    let player = keep(&won[..cap], &drawn[..cap], a.threads, || {
        player_from_spec(&a.spec, Some(&sv))
    })?;
    let keep_s = t.elapsed().as_secs_f64();
    eprintln!(
        "{} keeps {:.3} / {:.3} in {keep_s:.1} s",
        a.spec, player.0.rate, player.1.rate
    );

    // A table learner's figures on the positions it has seen around.
    let probe = player_from_spec(&a.spec, Some(&sv))?;
    let (keep_visited, coverage) = match probe.coverage(&sv.reach) {
        None => (Json::Null, Json::Null),
        Some((visited, visited_reachable)) => {
            let mut p = player_from_spec(&a.spec, Some(&sv))?;
            let mut class = |set: &[Sample]| -> Json {
                let mut rates: Vec<f64> = Vec::new();
                for x in set {
                    if p.child_visited(&x.state) == Some(true) {
                        rates.push(keep_of(x, &p.tied(&x.state, &RULES)));
                    }
                }
                match rates.len() {
                    0 => json!({"rate": null, "ci95": null, "n": 0}),
                    1 => json!({"rate": rates[0], "ci95": null, "n": 1}),
                    _ => json!(rate_stat(&rates)),
                }
            };
            let kv = json!({"won": class(&won[..cap]), "drawn": class(&drawn[..cap])});
            let reachable = sv.reach.count();
            let cov = json!({
                "visited": visited,
                "visited_reachable": visited_reachable,
                "reachable": reachable,
                "share_of_reachable": visited_reachable as f64 / reachable as f64,
            });
            eprintln!("keep on positions with a visited child: {kv}; coverage {cov}");
            (kv, cov)
        }
    };

    // The arena against the opponent (one thread, deterministic for a seed).
    let t = Instant::now();
    let cfg = ArenaConfig::new(RULES, a.pairs, OPENING_PLIES, MAX_PLIES, a.seed);
    let mut agent = TiedAgent(player_from_spec(&a.spec, Some(&sv))?);
    let report = if a.opponent == "random" {
        let mut them = TiedAgent(player_from_spec("random", None)?);
        run_match(&mut agent, &mut them, &cfg)
    } else {
        run_match(&mut agent, &mut Scripted::Greedy, &cfg)
    }
    .map_err(anyhow::Error::msg)?;
    let arena_s = t.elapsed().as_secs_f64();
    eprintln!(
        "arena vs {}: {:.3} [{:.3}, {:.3}], {} unfinished, in {arena_s:.1} s",
        a.opponent, report.score, report.ci95[0], report.ci95[1], report.a.unfinished
    );

    let name = player_from_spec(&a.spec, Some(&sv))?.name();
    let mut out = json!({
        "player": name,
        "spec": a.spec,
        "command": argv,
        "git_rev": git_rev(),
        "table_sha256": sha,
        "history": "none",
        "rules": RULES.to_string(),
        "table_tiebreak": TABLE_TIEBREAK,
        "sample": {
            "seed": a.sample_seed, "train_per_class": TRAIN_PER_CLASS,
            "test_per_class": TEST_PER_CLASS, "sample_cap": a.sample_cap,
            "measured_per_class": cap, "controls_per_class": TEST_PER_CLASS,
        },
        "keep": class_json(player),
        "opponent": a.opponent,
        "arena": report,
        "controls": {
            "oracle": {"keep": class_json(oracle), "expected": [ORACLE.0, ORACLE.1]},
            "anti_oracle": {"keep": class_json(anti), "expected": [ANTI_ORACLE.0, ANTI_ORACLE.1],
                            "positions_where_every_move_keeps": [every.0, every.1]},
            "random": {"keep": class_json(random), "expected": [RANDOM.0, RANDOM.1]},
            "compared_with_round_3": compared,
        },
        "timings": {
            "sha256": sha_s, "load": load_s, "sample": sample_s, "controls": controls_s,
            "keep": keep_s, "arena": arena_s, "total": t0.elapsed().as_secs_f64(),
        },
        "threads": a.threads,
        "peak_rss_mib": peak_rss_mib(),
    });
    if !coverage.is_null() {
        out["keep_visited"] = keep_visited;
        out["coverage"] = coverage;
    }
    std::fs::write(&a.out, serde_json::to_string_pretty(&out)? + "\n")
        .with_context(|| format!("writing {}", a.out))?;
    eprintln!("wrote {}", a.out);
    Ok(())
}
