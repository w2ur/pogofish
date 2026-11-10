//! Round 4: the tabular value learner (`pogofish_search::qtab`, see
//! `docs/experiments/v4-evaluation.md`, "Tabular learner").
//!
//! ```text
//! qtrain <out-dir> --games N [--seed 1] [--rules lc1-2] [--alpha 0.1]
//!        [--eps-start 1.0] [--eps-end 0.05] [--max-plies 1000] [--save-every 600]
//!        [--snapshot-at G1,G2,...]
//! ```
//!
//! Self-play from the start position, one value per position of the
//! published game (931 MB in memory and in `<out-dir>/v.bin`). Resumable:
//! Ctrl+C stops at the next game boundary and saves; rerun the same command
//! to resume (bit-identical to an uninterrupted run). A finished run is left
//! untouched. `--save-every` (seconds) also saves during the run.
//! `--snapshot-at` copies the run into `<out-dir>/snapshots/g<games>/` when it
//! has played exactly that many games (0: before the first); the copies do
//! not change the run (round 5, `docs/experiments/v5-video.md`).
//!
//! Exit: 0 finished; 130 interrupted (saved, resumable); 2 could not run.

use anyhow::{bail, Context};
use pogofish_engine::initial_state;
use pogofish_search::interrupt;
use pogofish_search::qtab::{train_with_snapshots, QConfig, QStop};
use pogofish_search::retro::Game;
use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "usage: qtrain <out-dir> --games N [--seed 1] [--rules lc1-2] [--alpha 0.1] \
                     [--eps-start 1.0] [--eps-end 0.05] [--max-plies 1000] [--save-every 600] \
                     [--snapshot-at G1,G2,...]";

fn run() -> anyhow::Result<QStop> {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let Some(dir) = raw.first().filter(|a| !a.starts_with("--")) else {
        bail!("{USAGE}");
    };
    let mut cfg = QConfig::default();
    let mut save_every = 600.0;
    let mut snapshots: Vec<u64> = Vec::new();
    let mut i = 1;
    while i < raw.len() {
        let flag = raw[i].as_str();
        let v = raw
            .get(i + 1)
            .with_context(|| format!("{flag} needs a value"))?;
        match flag {
            "--games" => cfg.games = v.parse()?,
            "--seed" => cfg.seed = v.parse()?,
            "--rules" => cfg.rules = v.clone(),
            "--alpha" => cfg.alpha = v.parse()?,
            "--eps-start" => cfg.eps_start = v.parse()?,
            "--eps-end" => cfg.eps_end = v.parse()?,
            "--max-plies" => cfg.max_plies = v.parse()?,
            "--save-every" => save_every = v.parse()?,
            "--snapshot-at" => {
                snapshots = v
                    .split(',')
                    .map(|x| x.trim().parse::<u64>())
                    .collect::<Result<_, _>>()
                    .with_context(|| format!("--snapshot-at takes game counts, got {v}"))?
            }
            _ => bail!("unknown flag {flag}\n{USAGE}"),
        }
        i += 2;
    }
    interrupt::install();
    let g = Game::published();
    if let Some(&g) = snapshots.iter().find(|&&g| g > cfg.games) {
        bail!("--snapshot-at {g} is beyond --games {}", cfg.games);
    }
    train_with_snapshots(
        &cfg,
        &PathBuf::from(dir),
        &g,
        &initial_state(),
        save_every,
        &snapshots,
        |_| interrupt::requested(),
    )
}

fn main() -> ExitCode {
    match run() {
        Ok(QStop::Finished) => {
            eprintln!("finished");
            ExitCode::SUCCESS
        }
        Ok(QStop::Interrupted) => {
            eprintln!("interrupted; rerun the same command to resume");
            ExitCode::from(130)
        }
        Err(e) => {
            eprintln!("qtrain: {e:#}");
            ExitCode::from(2)
        }
    }
}
