//! Elo ladder from arena reports (plan task 3.3).
//!
//! Usage: ladder <arena.json>... [--anchor PLAYER] [--out ladder.json]
//!
//! Reads one or more JSON arrays written by `arena`, fits the ratings
//! (`pogofish_search::elo`) and prints a Markdown table. Plot the JSON with
//! `uv run tools/plot_ladder.py ladder.json ladder.png`.

use anyhow::{bail, Context};
use pogofish_search::elo::{fit, PairResult};
use serde_json::Value;

fn main() -> anyhow::Result<()> {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let (mut files, mut anchor, mut out) = (Vec::new(), "random".to_string(), None);
    let mut i = 0;
    while i < raw.len() {
        match raw[i].as_str() {
            "--anchor" => anchor = raw.get(i + 1).context("--anchor needs a value")?.clone(),
            "--out" => out = Some(raw.get(i + 1).context("--out needs a value")?.clone()),
            f => {
                files.push(f.to_string());
                i += 1;
                continue;
            }
        }
        i += 2;
    }
    if files.is_empty() {
        bail!("usage: ladder <arena.json>... [--anchor PLAYER] [--out ladder.json]");
    }

    let mut results = Vec::new();
    for f in &files {
        let text = std::fs::read_to_string(f).with_context(|| format!("reading {f}"))?;
        let reports: Vec<Value> = serde_json::from_str(&text).with_context(|| format!("parsing {f}"))?;
        for r in reports {
            let num = |k: &str| r["a"][k].as_f64().with_context(|| format!("{f}: missing a.{k}"));
            results.push(PairResult {
                a: r["player_a"].as_str().context("player_a")?.to_string(),
                b: r["player_b"].as_str().context("player_b")?.to_string(),
                a_wins: num("wins")?,
                draws: num("draws")?,
                a_losses: num("losses")?,
            });
        }
    }

    let ladder = fit(&results, &anchor).map_err(anyhow::Error::msg)?;
    println!("| Player | Elo | 95 % interval | Games |");
    println!("|---|---|---|---|");
    for r in &ladder.ratings {
        println!(
            "| {} | {:.0} | [{:.0}, {:.0}] | {} |",
            r.player, r.elo, r.ci95[0], r.ci95[1], r.games
        );
    }
    println!(
        "\nAnchor: {} = 0. One virtual draw per pairing. Intervals assume independent games.",
        ladder.anchor
    );
    if let Some(path) = out {
        std::fs::write(&path, serde_json::to_string_pretty(&ladder)? + "\n")
            .with_context(|| format!("writing {path}"))?;
    }
    Ok(())
}
