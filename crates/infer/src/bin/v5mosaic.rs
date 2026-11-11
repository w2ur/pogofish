//! Round 5: the games of a stage, for the video's mosaics
//! (`docs/experiments/v5-video.md`, "Addendum 2").
//!
//! ```text
//! v5mosaic <table-dir> <player-spec> --out <json> [--pairs 50] [--opponent greedy|random]
//! ```
//!
//! Replays the first `--pairs` pairs of `v4bench`'s arena for this player
//! (arena seed 404, `lc1-2`, 4-ply openings, 1,000-ply limit, the player as
//! White then as Red), with the bench's own generator streams
//! (`arena::pair_games`): these are games the bench measured, not extra ones.
//! Each move of the player is judged by the solved uncapped table: `keep`
//! (it keeps the position's value), `mistake` (it does not), or `lost` (the
//! position was already lost, nothing to keep). The table ignores repetition,
//! so under `lc1-2` the judgment is the uncapped game's, not the live rule's.
//!
//! Exit: 0 written; 2 could not run.

use anyhow::{bail, Context};
use pogofish_engine::{apply_move_under, initial_state, Color, Move, RuleSet};
use pogofish_infer::players::{player_from_spec, TiedAgent};
use pogofish_search::arena::{pair_games, Agent, ArenaConfig};
use pogofish_search::perfect::{keeps_value, Solved};
use pogofish_search::players::Scripted;
use serde_json::{json, Value as Json};
use std::path::Path;
use std::process::ExitCode;

/// `v4bench`'s arena settings.
const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };
const OPENING_PLIES: u32 = 4;
const MAX_PLIES: u32 = 1000;
const SEED: u64 = 404;

fn triple(m: &Move) -> [u8; 3] {
    [m.from_cell, m.num_pieces, m.to_cell]
}

fn run() -> anyhow::Result<()> {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let usage = "usage: v5mosaic <table-dir> <player-spec> --out <json> [--pairs 50] \
                 [--opponent greedy|random]";
    let (Some(table), Some(spec)) = (
        argv.first().filter(|a| !a.starts_with("--")),
        argv.get(1).filter(|a| !a.starts_with("--")),
    ) else {
        bail!("{usage}");
    };
    let (mut out, mut pairs, mut opponent) = (None, 50u32, "greedy".to_string());
    let mut i = 2;
    while i < argv.len() {
        let v = argv
            .get(i + 1)
            .with_context(|| format!("{} needs a value", argv[i]))?;
        match argv[i].as_str() {
            "--out" => out = Some(v.clone()),
            "--pairs" => pairs = v.parse()?,
            "--opponent" => opponent = v.clone(),
            f => bail!("unknown flag {f}\n{usage}"),
        }
        i += 2;
    }
    let out = out.with_context(|| usage.to_string())?;
    let sv = Solved::load(Path::new(table))?;
    let mut player = TiedAgent(player_from_spec(spec, None)?);
    let mut them: Box<dyn Agent> = match opponent.as_str() {
        "greedy" => Box::new(Scripted::Greedy),
        "random" => Box::new(TiedAgent(player_from_spec("random", None)?)),
        o => bail!("--opponent must be greedy or random, got {o}"),
    };
    // The arena's settings with as many pairs as the bench: the pairs are
    // independent (one generator each), so the count does not change them.
    let cfg = ArenaConfig::new(RULES, 1000, OPENING_PLIES, MAX_PLIES, SEED);
    ensure_pairs(pairs, cfg.pairs)?;

    let mut games = Vec::new();
    let (mut wins, mut losses, mut draws, mut unfinished) = (0u32, 0u32, 0u32, 0u32);
    let (mut keeps, mut mistakes, mut lost_moves) = (0u32, 0u32, 0u32);
    let mut pair_scores = Vec::new();
    for pair in 0..pairs {
        let both =
            pair_games(&mut player, them.as_mut(), &cfg, pair).map_err(anyhow::Error::msg)?;
        let mut scores = Vec::new();
        for g in &both {
            let colour = if g.a_white { Color::White } else { Color::Red };
            let result = g
                .record
                .white_result
                .map(|w| if g.a_white { w } else { 1.0 - w });
            let label = match result {
                None => {
                    unfinished += 1;
                    "unfinished"
                }
                Some(x) if x > 0.5 => {
                    wins += 1;
                    "win"
                }
                Some(x) if x < 0.5 => {
                    losses += 1;
                    "loss"
                }
                Some(_) => {
                    draws += 1;
                    "draw"
                }
            };
            scores.push(result);
            // Replay on the real history and judge each of the player's moves.
            let mut s = initial_state();
            for m in &g.record.opening {
                s = apply_move_under(&s, *m, &RULES).context("an opening move is illegal")?;
            }
            let mut judged = Vec::new();
            for (k, m) in g.record.moves.iter().enumerate() {
                let next = apply_move_under(&s, *m, &RULES).context("a game move is illegal")?;
                if s.to_move() == colour {
                    let verdict = match keeps_value(sv.state_value(&s), sv.state_value(&next)) {
                        Some(true) => {
                            keeps += 1;
                            "keep"
                        }
                        Some(false) => {
                            mistakes += 1;
                            "mistake"
                        }
                        None => {
                            lost_moves += 1;
                            "lost"
                        }
                    };
                    judged.push(json!({
                        "ply": g.record.opening.len() + k + 1,
                        "verdict": verdict,
                    }));
                }
                s = next;
            }
            let moves: Vec<[u8; 3]> = g
                .record
                .opening
                .iter()
                .chain(g.record.moves.iter())
                .map(triple)
                .collect();
            games.push(json!({
                "pair": pair,
                "player_colour": format!("{colour:?}"),
                "result": label,
                "plies": moves.len(),
                "opening_plies": g.record.opening.len(),
                "ended_by_repetition_rule": g.record.by_variant_rule,
                "moves": moves,
                "player_moves": judged,
            }));
        }
        if let [Some(x), Some(y)] = scores[..] {
            pair_scores.push((x + y) / 2.0);
        }
    }
    let judged_total = keeps + mistakes;
    let doc = json!({
        "spec": spec,
        "player": player.name(),
        "opponent": opponent,
        "rules": RULES.to_string(),
        "arena_seed": SEED,
        "pairs": pairs,
        "games": games.len(),
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "unfinished": unfinished,
        "score_over_these_pairs": if pair_scores.is_empty() {
            Json::Null
        } else {
            json!(pair_scores.iter().sum::<f64>() / pair_scores.len() as f64)
        },
        "judgment": "the solved uncapped table (repetition ignored)",
        "player_moves_keep": keeps,
        "player_moves_mistake": mistakes,
        "player_moves_from_lost": lost_moves,
        "mistake_share": if judged_total == 0 {
            Json::Null
        } else {
            json!(mistakes as f64 / judged_total as f64)
        },
        "game_list": games,
    });
    if let Some(dir) = Path::new(&out).parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&out, serde_json::to_string(&doc)? + "\n")?;
    eprintln!(
        "{spec} vs {opponent}: {wins} won, {losses} lost, {unfinished} unfinished of {}; \
         {mistakes} mistakes of {judged_total} judged moves -> {out}",
        games.len()
    );
    Ok(())
}

fn ensure_pairs(pairs: u32, bench: u32) -> anyhow::Result<()> {
    if pairs == 0 || pairs > bench {
        bail!("--pairs must be 1 to {bench} (the bench's pairs)");
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("v5mosaic: {e:#}");
            ExitCode::from(2)
        }
    }
}
