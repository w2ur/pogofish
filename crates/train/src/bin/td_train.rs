//! TD(λ) self-play training (plan task 4.1). Resumable: rerun the same
//! command after Ctrl+C (or with a larger --iterations to extend the run).
//!
//! Usage: td_train <out_dir> [--rules R] [--iterations N] [--games G] [--lambda L] [--lr LR]
//!                 [--hidden 128x64] [--features mover-relative|mover-relative-repetition|absolute] [--temp-start T] [--temp-end T] [--temp-decay N]
//!                 [--eval-every K] [--eval-pairs P] [--checkpoint-every K]
//!                 [--max-plies P] [--seed S]

use anyhow::{bail, Context};
use pogofish_train::td::{parse_hidden, train_td, TdConfig, TdStop};
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let Some(dir) = raw.first().filter(|a| !a.starts_with("--")) else {
        bail!("usage: td_train <out_dir> [--iterations N] [--games G] [--lambda L] [--lr LR] [--hidden 128x64] [--features mover-relative|mover-relative-repetition|absolute] [--temp-start T] [--temp-end T] [--temp-decay N] [--eval-every K] [--eval-pairs P] [--checkpoint-every K] [--max-plies P] [--seed S]");
    };
    let mut cfg = TdConfig::default();
    let mut i = 1;
    while i < raw.len() {
        let flag = raw[i].as_str();
        let v = raw
            .get(i + 1)
            .with_context(|| format!("{flag} needs a value"))?;
        match flag {
            "--rules" => cfg.rules = v.clone(),
            "--iterations" => cfg.iterations = v.parse()?,
            "--games" => cfg.games_per_iteration = v.parse()?,
            "--lambda" => cfg.lambda = v.parse()?,
            "--lr" => cfg.lr = v.parse()?,
            "--hidden" => cfg.hidden = parse_hidden(v)?,
            "--features" => {
                cfg.features = serde_json::from_value(serde_json::Value::String(v.clone()))
                    .with_context(|| {
                        format!("--features must be absolute or mover-relative, got {v}")
                    })?
            }
            "--temp-start" => cfg.temp_start = v.parse()?,
            "--temp-end" => cfg.temp_end = v.parse()?,
            "--temp-decay" => cfg.temp_decay_iterations = v.parse()?,
            "--eval-every" => cfg.eval_every = v.parse()?,
            "--eval-pairs" => cfg.eval_pairs = v.parse()?,
            "--checkpoint-every" => cfg.checkpoint_every = v.parse()?,
            "--max-plies" => cfg.max_plies = v.parse()?,
            "--seed" => cfg.seed = v.parse()?,
            _ => bail!("unknown flag {flag}"),
        }
        i += 2;
    }
    pogofish_train::interrupt::install();
    match train_td(&cfg, &PathBuf::from(dir))? {
        TdStop::Finished => eprintln!("finished"),
        TdStop::Interrupted => eprintln!("interrupted; rerun the same command to resume"),
    }
    Ok(())
}
