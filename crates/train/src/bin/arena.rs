//! Evaluation arena (plan task 3.1): every pair of the given players plays a
//! match with colours swapped over randomised openings.
//!
//! Usage: arena <ruleset> <player> <player> [<player>...]
//!              [--pairs N] [--opening K] [--max-plies P] [--seed S] [--out FILE]
//!
//! Players: random, greedy, first-legal, mcts-uniform:SIMS,
//! net:PATH[:SIMS[:ARCH]]. Writes a JSON array with one report per pairing.

use anyhow::{bail, Context};
use pogofish_engine::RuleSet;
use pogofish_search::arena::{run_match, ArenaConfig};
use pogofish_train::agents::agent_from_spec;

fn main() -> anyhow::Result<()> {
    // The nets are tiny: extra libtorch threads only add overhead.
    tch::set_num_threads(1);
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let mut positional = Vec::new();
    let (mut pairs, mut opening, mut max_plies, mut seed) = (200u32, 4u32, 1000u32, 1u64);
    let mut out: Option<String> = None;
    let mut i = 0;
    while i < raw.len() {
        let flag = raw[i].as_str();
        if !flag.starts_with("--") {
            positional.push(raw[i].clone());
            i += 1;
            continue;
        }
        let value = raw
            .get(i + 1)
            .with_context(|| format!("{flag} needs a value"))?;
        match flag {
            "--pairs" => pairs = value.parse().context("--pairs")?,
            "--opening" => opening = value.parse().context("--opening")?,
            "--max-plies" => max_plies = value.parse().context("--max-plies")?,
            "--seed" => seed = value.parse().context("--seed")?,
            "--out" => out = Some(value.clone()),
            _ => bail!("unknown flag {flag}"),
        }
        i += 2;
    }
    if positional.len() < 3 {
        bail!("usage: arena <ruleset> <player> <player> [<player>...] [--pairs N] [--opening K] [--max-plies P] [--seed S] [--out FILE]");
    }
    let rules: RuleSet = positional[0].parse().map_err(anyhow::Error::msg)?;
    let specs = &positional[1..];
    let cfg = ArenaConfig::new(rules, pairs, opening, max_plies, seed);

    let mut reports = Vec::new();
    for x in 0..specs.len() {
        for y in (x + 1)..specs.len() {
            // Fresh objects per match, so a player can meet itself.
            let mut a = agent_from_spec(&specs[x])?;
            let mut b = agent_from_spec(&specs[y])?;
            let r = run_match(a.as_mut(), b.as_mut(), &cfg);
            eprintln!(
                "{} vs {}: score {:.3} [{:.3}, {:.3}] | W{} D{} L{} U{} | distinct games {} / {}",
                r.player_a,
                r.player_b,
                r.score,
                r.ci95[0],
                r.ci95[1],
                r.a.wins,
                r.a.draws,
                r.a.losses,
                r.a.unfinished,
                r.distinct_games,
                r.games
            );
            reports.push(r);
        }
    }
    let json = serde_json::to_string_pretty(&reports)? + "\n";
    match out {
        Some(path) => std::fs::write(&path, json).with_context(|| format!("writing {path}"))?,
        None => print!("{json}"),
    }
    Ok(())
}
