//! Reference outputs of an exported net on 100 lc1-2 positions, for the web
//! app's ONNX parity test (plan task 6.4).
//!
//!     cargo run --release -p pogofish-infer --example parity_fixture -- \
//!         crates/cli/assets/az-lc1-s1.pfw app/src/ai/parity-lc1-2.json
//!
//! Positions come from seeded random lc1-2 playouts. A third of them are
//! positions seen once before, so the repetition input is exercised. Each is
//! stored as the moves that reach it from the start, so the app's test builds
//! the position (and its history) through its own engine path, as in a game.

use pogofish_engine::{
    apply_move_under, initial_state, is_terminal, legal_moves, GameState, Move, RuleSet,
};
use pogofish_infer::mlp::Mlp;
use pogofish_search::rng::SplitMix64;

const FRESH: usize = 67;
const REPEATED: usize = 33;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    anyhow::ensure!(args.len() == 2, "usage: parity_fixture NET.pfw OUT.json");
    let net = Mlp::from_bytes(&std::fs::read(&args[0])?)?;
    let rules = RuleSet::LC1 { repetitions: 2 };
    let mut rng = SplitMix64::new(64);
    type Sample = (GameState, Vec<Move>);
    let (mut fresh, mut repeated): (Vec<Sample>, Vec<Sample>) = (Vec::new(), Vec::new());
    while fresh.len() < FRESH || repeated.len() < REPEATED {
        let mut s = initial_state();
        let mut path = Vec::new();
        for ply in 0..200 {
            if is_terminal(&s, &rules).is_some() {
                break;
            }
            // Sample sparsely so the positions spread over many games.
            if rng.below(8) == 0 {
                match s.occurrences_before() {
                    0 if fresh.len() < FRESH && ply > 0 => fresh.push((s.clone(), path.clone())),
                    n if n > 0 && repeated.len() < REPEATED => {
                        repeated.push((s.clone(), path.clone()))
                    }
                    _ => {}
                }
            }
            let moves = legal_moves(&s);
            let m = moves[rng.below(moves.len())];
            path.push(m);
            s = apply_move_under(&s, m, &rules)?;
        }
    }
    let positions: Vec<_> = fresh
        .into_iter()
        .chain(repeated)
        .map(|(state, moves)| {
            let (logits, value) = net.forward(&net.features.encode(&state));
            serde_json::json!({
                "moves": moves.iter().map(|m| [m.from_cell, m.num_pieces, m.to_cell]).collect::<Vec<_>>(),
                "cells": state.cells(),
                "occurrences_before": state.occurrences_before(),
                "logits": logits,
                "value": value,
            })
        })
        .collect();
    let out = serde_json::json!({
        "net": args[0],
        "features": net.features,
        "rules": "lc1-2",
        "positions": positions,
    });
    std::fs::write(&args[1], serde_json::to_string(&out)? + "\n")?;
    Ok(())
}
