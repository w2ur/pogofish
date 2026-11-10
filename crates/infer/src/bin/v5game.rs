//! Round 5: the game shown for a stage (`docs/experiments/v5-video.md`).
//!
//! ```text
//! v5game <player-spec> --out <json> [--seed 404]
//! ```
//!
//! Replays game 0 of `v4bench`'s arena for this player: pair 0 of arena
//! seed 404 (its first 4-ply random opening), the player as White against
//! greedy, `lc1-2`, 1,000-ply limit, on the bench's own generator stream
//! (`arena::first_game`), so the moves are the ones the bench played. Player
//! specs as in `v4bench`, except `table` (it needs the solved table).
//!
//! The JSON holds the full move list from the initial position, opening
//! included, as `[from_cell, num_pieces, to_cell]` triples (the format
//! `tools/article-visuals/sequence.mjs` replays), and the game's outcome. The
//! game illustrates a stage; the stage's score is the bench's.
//!
//! Exit: 0 written; 2 could not run.

use anyhow::{bail, Context};
use pogofish_engine::{Color, RuleSet};
use pogofish_infer::players::{player_from_spec, TiedAgent};
use pogofish_search::arena::{first_game, ArenaConfig};
use pogofish_search::players::Scripted;
use serde_json::json;
use std::process::ExitCode;

/// `v4bench`'s arena settings.
const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };
const OPENING_PLIES: u32 = 4;
const MAX_PLIES: u32 = 1000;

fn run() -> anyhow::Result<()> {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let usage = "usage: v5game <player-spec> --out <json> [--seed 404]";
    let Some(spec) = argv.first().filter(|a| !a.starts_with("--")) else {
        bail!("{usage}");
    };
    let (mut out, mut seed) = (None, 404u64);
    let mut i = 1;
    while i < argv.len() {
        let v = argv
            .get(i + 1)
            .with_context(|| format!("{} needs a value", argv[i]))?;
        match argv[i].as_str() {
            "--out" => out = Some(v.clone()),
            "--seed" => seed = v.parse()?,
            f => bail!("unknown flag {f}\n{usage}"),
        }
        i += 2;
    }
    let out = out.with_context(|| usage.to_string())?;
    let mut player = TiedAgent(player_from_spec(spec, None)?);
    let cfg = ArenaConfig::new(RULES, 1, OPENING_PLIES, MAX_PLIES, seed);
    let g = first_game(&mut player, &mut Scripted::Greedy, &cfg).map_err(anyhow::Error::msg)?;
    let triples: Vec<[u8; 3]> = g
        .opening
        .iter()
        .chain(g.moves.iter())
        .map(|m| [m.from_cell, m.num_pieces, m.to_cell])
        .collect();
    let result = match g.white_result {
        None => "unfinished",
        Some(x) if x > 0.5 => "win",
        Some(x) if x < 0.5 => "loss",
        Some(_) => "draw",
    };
    let doc = json!({
        "spec": spec,
        "player": pogofish_search::arena::Agent::name(&player),
        "opponent": "greedy",
        "player_colour": format!("{:?}", Color::White),
        "rules": RULES.to_string(),
        "arena_seed": seed,
        "pair": 0,
        "opening_plies": g.opening.len(),
        "plies": triples.len(),
        "moves": triples,
        "player_result": result,
        "ended_by_repetition_rule": g.by_variant_rule,
    });
    if let Some(dir) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(
        &out,
        flat_leaves(&serde_json::to_string_pretty(&doc)?) + "\n",
    )?;
    eprintln!(
        "{spec}: {result} as White in {} plies -> {out}",
        triples.len()
    );
    Ok(())
}

/// Pretty JSON with each innermost array (no array or object inside) on
/// one line, so a move reads `[1, 2, 3]`.
fn flat_leaves(pretty: &str) -> String {
    let b = pretty.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(pretty.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'[' {
            let close = b[i + 1..]
                .iter()
                .position(|&c| matches!(c, b'[' | b']' | b'{'));
            if let Some(k) = close.filter(|&k| b[i + 1 + k] == b']') {
                let inner = &pretty[i + 1..i + 1 + k];
                let items: Vec<&str> = inner.split(',').map(str::trim).collect();
                out.push(b'[');
                out.extend_from_slice(items.join(", ").as_bytes());
                out.push(b']');
                i += k + 2;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).expect("only ASCII bytes were rearranged")
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("v5game: {e:#}");
            ExitCode::from(2)
        }
    }
}
