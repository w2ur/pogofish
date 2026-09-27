//! AlphaZero training, corrected (plan task 4.2). Resumable: rerun the same
//! command after Ctrl+C, or with a larger --iterations to extend the run.
//!
//! Usage: train <out_dir> [--rules uncapped] [--features absolute|mover-relative]
//!              [--arch mlp_small] [--iterations N] [--games G] [--sims S]
//!              [--buffer P] [--train-steps K] [--batch B] [--lr LR] [--momentum M]
//!              [--weight-decay W] [--no-augment] [--max-moves P]
//!              [--checkpoint-every K] [--eval-every K] [--eval-pairs P] [--eval-sims S]
//!              [--truncation-stop-rate R] [--truncation-stop-iterations N (0 = off)]
//!              [--seed S]

use anyhow::{bail, Context};
use pogofish_train::training::{train, TrainConfig, TrainStop};
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let Some(dir) = raw.first().filter(|a| !a.starts_with("--")) else {
        bail!("usage: train <out_dir> [--rules R] [--features F] [--arch A] [--iterations N] [--games G] [--sims S] [--buffer P] [--train-steps K] [--batch B] [--lr LR] [--momentum M] [--weight-decay W] [--no-augment] [--max-moves P] [--checkpoint-every K] [--eval-every K] [--eval-pairs P] [--eval-sims S] [--seed S]");
    };
    let mut cfg = TrainConfig::default();
    let mut i = 1;
    while i < raw.len() {
        let flag = raw[i].as_str();
        if flag == "--no-augment" {
            cfg.augment = false;
            i += 1;
            continue;
        }
        let v = raw
            .get(i + 1)
            .with_context(|| format!("{flag} needs a value"))?;
        match flag {
            "--rules" => cfg.rules = v.clone(),
            "--features" => {
                cfg.features = serde_json::from_value(serde_json::Value::String(v.clone()))
                    .with_context(|| {
                        format!("--features must be absolute or mover-relative, got {v}")
                    })?
            }
            "--arch" => cfg.arch = v.clone(),
            "--iterations" => cfg.iterations = v.parse()?,
            "--games" => cfg.games_per_iteration = v.parse()?,
            "--sims" => cfg.num_simulations = v.parse()?,
            "--buffer" => cfg.buffer_positions = v.parse()?,
            "--train-steps" => cfg.train_steps = v.parse()?,
            "--batch" => cfg.batch_size = v.parse()?,
            "--lr" => cfg.lr = v.parse()?,
            "--momentum" => cfg.momentum = v.parse()?,
            "--weight-decay" => cfg.weight_decay = v.parse()?,
            "--max-moves" => cfg.max_moves = v.parse()?,
            "--checkpoint-every" => cfg.checkpoint_every = v.parse()?,
            "--eval-every" => cfg.eval_every = v.parse()?,
            "--eval-pairs" => cfg.eval_pairs = v.parse()?,
            "--eval-sims" => cfg.eval_sims = v.parse()?,
            "--truncation-stop-rate" => cfg.truncation_stop_rate = v.parse()?,
            "--truncation-stop-iterations" => cfg.truncation_stop_iterations = v.parse()?,
            "--seed" => cfg.seed = v.parse()?,
            _ => bail!("unknown flag {flag}"),
        }
        i += 2;
    }
    pogofish_train::interrupt::install();
    match train(&cfg, &PathBuf::from(dir))? {
        TrainStop::Finished => eprintln!("finished"),
        TrainStop::Interrupted => eprintln!("interrupted; rerun the same command to resume"),
        TrainStop::TruncationRule => {
            eprintln!(
                "stopped by the switch rule: more than {:.0}% of self-play games truncated for {} consecutive iterations (docs/experiments/v2-ruleset.md)",
                cfg.truncation_stop_rate * 100.0,
                cfg.truncation_stop_iterations
            );
            std::process::exit(3);
        }
    }
    Ok(())
}
