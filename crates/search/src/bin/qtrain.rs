//! Round 4: the tabular value learner (`pogofish_search::qtab`, see
//! `docs/experiments/v4-evaluation.md`, "Tabular learner").
//!
//! ```text
//! qtrain <out-dir> --games N [--seed 1] [--rules lc1-2] [--alpha 0.1]
//!        [--eps-start 1.0] [--eps-end 0.05] [--max-plies 1000] [--save-every 600]
//! ```
//!
//! Self-play from the start position, one value per position of the
//! published game (931 MB in memory and in `<out-dir>/v.bin`). Resumable:
//! Ctrl+C stops at the next game boundary and saves; rerun the same command
//! to resume (bit-identical to an uninterrupted run). A finished run is left
//! untouched. `--save-every` (seconds) also saves during the run.
//!
//! Exit: 0 finished; 130 interrupted (saved, resumable); 2 could not run.

use anyhow::{bail, Context};
use pogofish_engine::initial_state;
use pogofish_search::interrupt;
use pogofish_search::qtab::{train, QConfig, QStop};
use pogofish_search::retro::Game;
use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "usage: qtrain <out-dir> --games N [--seed 1] [--rules lc1-2] [--alpha 0.1] \
                     [--eps-start 1.0] [--eps-end 0.05] [--max-plies 1000] [--save-every 600]";

fn run() -> anyhow::Result<QStop> {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let Some(dir) = raw.first().filter(|a| !a.starts_with("--")) else {
        bail!("{USAGE}");
    };
    let mut cfg = QConfig::default();
    let mut save_every = 600.0;
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
            _ => bail!("unknown flag {flag}\n{USAGE}"),
        }
        i += 2;
    }
    interrupt::install();
    let g = Game::published();
    train(
        &cfg,
        &PathBuf::from(dir),
        &g,
        &initial_state(),
        save_every,
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
