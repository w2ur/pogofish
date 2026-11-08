//! Export a trained TD(λ) value net for the pure-Rust inference of the v4
//! bench (`td:<pfv>`). Features and hidden sizes come from the run's
//! config.json (next to the weights, or one directory above a checkpoint);
//! `--hidden` overrides the sizes. Refuses to write unless the copy matches
//! the checkpoint within 1e-5 on 100 positions.
//!
//! Usage: export_td <weights.pt> <out.pfv> [--hidden 128x64]

use anyhow::{bail, Context};
use pogofish_train::td::{export_td, parse_hidden, TdFeatures};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let usage = "usage: export_td <weights.pt> <out.pfv> [--hidden 128x64]";
    let (weights, out, rest) = match args.as_slice() {
        [w, o, rest @ ..] if !w.starts_with("--") && !o.starts_with("--") => (w, o, rest),
        _ => bail!(usage),
    };
    let mut hidden = None;
    match rest {
        [] => {}
        [flag, v] if flag == "--hidden" => hidden = Some(parse_hidden(v)?),
        _ => bail!(usage),
    }
    let cfg = pogofish_train::agents::run_config(weights.as_ref())?
        .with_context(|| format!("no config.json next to or above {weights}"))?;
    let features: TdFeatures =
        serde_json::from_value(cfg["features"].clone()).context("features in config.json")?;
    let hidden = match hidden {
        Some(h) => h,
        None => serde_json::from_value(cfg["hidden"].clone()).context("hidden in config.json")?,
    };
    let (copy, worst) = export_td(weights.as_ref(), &hidden, features, out.as_ref())?;
    eprintln!(
        "wrote {out}: {:?} features, {} layers; largest difference from the checkpoint \
         on 100 positions: {worst:e}",
        copy.features,
        copy.layers.len()
    );
    Ok(())
}
