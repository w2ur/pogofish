//! Round 5: what a player sees in the puzzles of the solved game
//! (`docs/experiments/v5-video.md`, "Addendum 2").
//!
//! ```text
//! v5puzzles <answers.json> <table-dir> <player-spec> --out <json>
//! ```
//!
//! Reads the puzzles of round 3 (`docs/experiments/v3-solve/answers.json`:
//! won positions with a single winning move that greedy does not play), each
//! from its diagram, with no history, and checks against the solved table that
//! the recorded key move is the only move to a lost position for the
//! opponent (else exit 2). Then, per legal move (engine order):
//!
//! - `net:<pfw>`: the prior (the net alone), and the visits of a 100-simulation
//!   search without noise (the bench's `net:<pfw>:100` player);
//! - `td:<pfv>` and `qtab:<v.bin>`: the score the one-ply player ranks by (the
//!   exact result if the move ends the game, else −V of the position after it).
//!
//! and whether the player's tied set (the moves it picks from uniformly) is the
//! key move: `solved` is the share of its tied set that is the key move. The
//! puzzles' answers are the uncapped game's; the moves are played under
//! `lc1-2`, where a third occurrence loses, from an empty history.
//!
//! Exit: 0 written; 2 could not run.

use anyhow::{bail, ensure, Context};
use pogofish_engine::notation::move_to_notation;
use pogofish_engine::{apply_move_under, is_terminal, legal_moves, GameState, Move, RuleSet};
use pogofish_infer::mcts::{search, Evaluator, MctsConfig};
use pogofish_infer::mlp::Mlp;
use pogofish_infer::players::{QtabPlayer, TdPlayer, TiedChooser, DEFAULT_SIMS};
use pogofish_infer::value::ValueMlp;
use pogofish_search::perfect::Solved;
use pogofish_search::qtab::{argmax_all, result_for};
use pogofish_search::retro::{Board, Value};
use serde_json::{json, Value as Json};
use std::path::Path;
use std::process::ExitCode;

const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };

/// Share of `tied` (indices into the moves) that is the key move.
fn solved(tied: &[usize], key: usize) -> f64 {
    tied.iter().filter(|&&i| i == key).count() as f64 / tied.len() as f64
}

/// One-ply scores as the bench's `td:`/`qtab:` players rank them.
fn td_scores(net: &ValueMlp, s: &GameState, moves: &[Move]) -> Vec<f32> {
    let mover = s.to_move();
    moves
        .iter()
        .map(|&m| {
            let next = apply_move_under(s, m, &RULES).expect("legal move");
            match is_terminal(&next, &RULES) {
                Some(o) => result_for(o, mover),
                None => -net.forward(&net.features.encode(&next)),
            }
        })
        .collect()
}

fn run() -> anyhow::Result<()> {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let usage = "usage: v5puzzles <answers.json> <table-dir> <player-spec> --out <json>";
    let [answers, table, spec, flag, out] = argv.as_slice() else {
        bail!("{usage}");
    };
    if flag != "--out" {
        bail!("{usage}");
    }
    let doc: Json = serde_json::from_str(
        &std::fs::read_to_string(answers).with_context(|| format!("reading {answers}"))?,
    )?;
    let puzzles = doc["puzzles"]
        .as_array()
        .context("no puzzles in the answers")?;
    let sv = Solved::load(Path::new(table))?;

    enum Kind {
        Net(Box<Mlp>),
        Td(TdPlayer),
        Qtab(QtabPlayer),
    }
    let kind = match spec.split_once(':') {
        Some(("net", path)) => Kind::Net(Box::new(Mlp::from_bytes(
            &std::fs::read(path).with_context(|| format!("reading {path}"))?,
        )?)),
        Some(("td", path)) => Kind::Td(TdPlayer {
            net: ValueMlp::load(path.as_ref())?,
            label: path.to_string(),
        }),
        Some(("qtab", path)) => Kind::Qtab(QtabPlayer::load(path)?),
        _ => bail!("the player must be net:<pfw>, td:<pfv> or qtab:<v.bin>, got {spec}"),
    };

    let mut rows = Vec::new();
    let (mut solved_a, mut solved_b) = (0.0, 0.0);
    for (n, p) in puzzles.iter().enumerate() {
        let diagram = p["diagram"].as_str().context("a puzzle without diagram")?;
        let board = Board::from_diagram(diagram)
            .with_context(|| format!("puzzle {}: the diagram does not read back", n + 1))?;
        let s = board.to_state();
        let moves = legal_moves(&s);
        let names: Vec<String> = moves.iter().map(|&m| move_to_notation(m)).collect();
        let key_name = p["key_move"]
            .as_str()
            .context("a puzzle without key move")?;
        let key = names
            .iter()
            .position(|x| x == key_name)
            .with_context(|| format!("puzzle {}: {key_name} is not legal", n + 1))?;
        // The table must agree: the key move, and it alone, leaves the opponent lost.
        let winning: Vec<usize> = (0..moves.len())
            .filter(|&i| {
                let next = apply_move_under(&s, moves[i], &RULES).expect("legal move");
                matches!(sv.state_value(&next), Value::Loss(_))
            })
            .collect();
        ensure!(
            winning == vec![key],
            "puzzle {}: the table's winning moves are {:?}, not only {key_name}",
            n + 1,
            winning.iter().map(|&i| &names[i]).collect::<Vec<_>>()
        );
        let mut row = json!({
            "puzzle": n + 1,
            "win_in_plies": p["win_in_plies"],
            "diagram": diagram,
            "moves": names,
            "key_move": key_name,
            "greedy_would_play_one_of": p["greedy_would_play_one_of"],
        });
        match &kind {
            Kind::Net(net) => {
                let (priors, value) = net.evaluate(&s, &moves);
                let cfg = MctsConfig {
                    num_simulations: DEFAULT_SIMS,
                    ..MctsConfig::default()
                };
                let r = search(net.as_ref(), &s, &RULES, &cfg, None);
                let visits: Vec<u32> = r.visits.iter().map(|&(_, v)| v).collect();
                ensure!(
                    r.visits.iter().map(|&(m, _)| m).eq(moves.iter().copied()),
                    "the search's moves are not in engine order"
                );
                let a = solved(&argmax_all(&priors), key);
                let b = solved(&argmax_all(&visits), key);
                solved_a += a;
                solved_b += b;
                row["prior"] = json!(priors);
                row["net_value"] = json!(value);
                row["visits"] = json!(visits);
                row["solved_without_search"] = json!(a);
                row["solved_with_search"] = json!(b);
            }
            Kind::Td(td) => {
                let scores = td_scores(&td.net, &s, &moves);
                let a = solved(&argmax_all(&scores), key);
                solved_a += a;
                row["score"] = json!(scores);
                row["solved"] = json!(a);
            }
            Kind::Qtab(q) => {
                let qs = q.table.t.q_values(&q.table.g, &s, &RULES);
                ensure!(
                    qs.iter().map(|&(m, _)| m).eq(moves.iter().copied()),
                    "the table's moves are not in engine order"
                );
                let scores: Vec<f32> = qs.iter().map(|&(_, x)| x).collect();
                let mut chooser = QtabPlayer {
                    table: q.table.clone(),
                    label: q.label.clone(),
                };
                let tied = chooser.tied(&s, &RULES);
                let idx: Vec<usize> = tied
                    .iter()
                    .map(|m| moves.iter().position(|x| x == m).expect("legal"))
                    .collect();
                let a = solved(&idx, key);
                solved_a += a;
                row["score"] = json!(scores);
                row["solved"] = json!(a);
            }
        }
        rows.push(row);
    }
    let mut summary = json!({
        "spec": spec,
        "rules": RULES.to_string(),
        "history": "none",
        "puzzles": rows.len(),
        "source": answers,
    });
    match kind {
        Kind::Net(_) => {
            summary["solved_without_search"] = json!(solved_a);
            summary["solved_with_search"] = json!(solved_b);
            summary["simulations"] = json!(DEFAULT_SIMS);
        }
        _ => summary["solved"] = json!(solved_a),
    }
    summary["puzzle_list"] = json!(rows);
    if let Some(dir) = Path::new(out).parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(out, serde_json::to_string(&summary)? + "\n")?;
    eprintln!("{spec}: puzzles -> {out}");
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("v5puzzles: {e:#}");
            ExitCode::from(2)
        }
    }
}
