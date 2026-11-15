//! Reference outputs for the article figures (`figures/`), whose TypeScript
//! must equal the Rust: every number those tests check comes from here.
//!
//!     cargo run --release -p pogofish-infer --example figures_fixture -- \
//!         crates/cli/assets/az-lc1-s1.pfw models/v4-td-lc1-s1/td.pfv \
//!         figures/fixtures/reference.json
//!
//! Positions: seeded uniform playouts under lc1-2, every state of the
//! `openingWin` line of `figures/fixtures/lines.json`, and puzzle 5 of
//! round 5, rebuilt from its diagram. For each: the state (engine JSON, so the
//! TypeScript reads it as is), its input features, the AlphaZero logits and
//! value, the TD value, and per legal move (engine order) the prior, the MCTS visits
//! (100 simulations, no noise) and greedy's score, all under lc1-2. For the
//! line: its exact outcome, which replaces the last TD value as training
//! does, and the λ-returns.

use anyhow::{bail, ensure, Context};
use pogofish_engine::notation::move_to_notation;
use pogofish_engine::{
    apply_move, apply_move_under, initial_state, is_terminal, legal_moves, GameState, Move,
    Outcome, RuleSet,
};
use pogofish_infer::mcts::{search, Evaluator, MctsConfig};
use pogofish_infer::mlp::Mlp;
use pogofish_infer::returns::lambda_returns;
use pogofish_infer::value::ValueMlp;
use pogofish_search::players::greedy_score;
use pogofish_search::retro::Board;
use pogofish_search::rng::SplitMix64;
use serde::Serialize;
use serde_json::Value;
use std::path::Path;

const SOURCE: &str = "cargo run --release -p pogofish-infer --example figures_fixture -- \
crates/cli/assets/az-lc1-s1.pfw models/v4-td-lc1-s1/td.pfv figures/fixtures/reference.json";
const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };
const SEED: u64 = 20261115;
const PLAYOUTS: usize = 40;
const MAX_PLIES: usize = 40;
const SIMULATIONS: u32 = 100;
const LAMBDA: f32 = 0.7;
const PUZZLES: &str = "docs/experiments/v5/puzzles/az-s1-p100.json";
const PUZZLE: u64 = 5;

fn triple(m: &Move) -> [u8; 3] {
    [m.from_cell, m.num_pieces, m.to_cell]
}

/// One position for every playout: a ply count drawn in 1..=MAX_PLIES, then
/// uniform moves; a playout that ends first, or lands on a state of `skip`
/// (the openingWin line), is drawn again.
fn playouts(skip: &[GameState]) -> anyhow::Result<Vec<GameState>> {
    let mut rng = SplitMix64::new(SEED);
    let mut out = Vec::new();
    while out.len() < PLAYOUTS {
        let plies = 1 + rng.below(MAX_PLIES);
        let mut s = initial_state();
        for _ in 0..plies {
            let moves = legal_moves(&s);
            s = apply_move_under(&s, moves[rng.below(moves.len())], &RULES)?;
            if is_terminal(&s, &RULES).is_some() {
                break;
            }
        }
        if is_terminal(&s, &RULES).is_none() && !skip.contains(&s) {
            out.push(s);
        }
    }
    Ok(out)
}

/// The states of the `openingWin` line, checked to be a White win in game A
/// that no earlier position ends.
fn opening_win(root: &Path) -> anyhow::Result<Vec<GameState>> {
    let path = root.join("figures/fixtures/lines.json");
    let lines: Value = serde_json::from_slice(&std::fs::read(&path)?)
        .with_context(|| format!("parsing {}", path.display()))?;
    let moves: Vec<[u8; 3]> = serde_json::from_value(lines["openingWin"].clone())
        .context("lines.json: openingWin must be a list of [from, n, to]")?;
    let mut states = vec![initial_state()];
    for &[from_cell, num_pieces, to_cell] in &moves {
        let s = states.last().expect("non-empty");
        ensure!(
            is_terminal(s, &RuleSet::Uncapped).is_none(),
            "openingWin ends before its last move"
        );
        let m = Move {
            from_cell,
            num_pieces,
            to_cell,
        };
        states.push(apply_move(s, m)?);
    }
    let last = states.last().expect("non-empty");
    ensure!(
        is_terminal(last, &RuleSet::Uncapped) == Some(Outcome::WinWhite),
        "openingWin must end in a White win, got {:?}",
        is_terminal(last, &RuleSet::Uncapped)
    );
    Ok(states)
}

/// Puzzle 5's position, rebuilt from its diagram and refused unless the
/// engine's legal moves equal the file's list.
fn puzzle(root: &Path) -> anyhow::Result<GameState> {
    let file: Value = serde_json::from_slice(&std::fs::read(root.join(PUZZLES))?)?;
    let list = file["puzzle_list"].as_array().context("no puzzle_list")?;
    let p = list
        .iter()
        .find(|p| p["puzzle"] == PUZZLE)
        .with_context(|| format!("no puzzle {PUZZLE}"))?;
    let diagram = p["diagram"].as_str().context("no diagram")?;
    let s = Board::from_diagram(diagram)
        .context("the diagram does not read back")?
        .to_state();
    let mut names: Vec<String> = legal_moves(&s).into_iter().map(move_to_notation).collect();
    let mut listed: Vec<String> = serde_json::from_value(p["moves"].clone())?;
    names.sort();
    listed.sort();
    if names != listed {
        bail!("puzzle {PUZZLE}: legal moves {names:?} differ from the file's {listed:?}");
    }
    Ok(s)
}

// Structs rather than `json!`, so each f32 is written in its shortest exact
// form rather than widened to an f64's digits.
#[derive(Serialize)]
struct Net {
    logits: Vec<f32>,
    value: f32,
}

#[derive(Serialize)]
struct Position<'a> {
    label: String,
    state: &'a GameState,
    features: Vec<f32>,
    az: Net,
    td: f32,
    legal: Vec<[u8; 3]>,
    /// Softmax of the logits over `legal`, as the search's evaluator computes it.
    priors: Vec<f32>,
    visits: Vec<u32>,
    greedy: Vec<i32>,
}

#[derive(Serialize)]
struct Line {
    /// Index in `positions` of the line's first state; the moves are in
    /// `lines.json`, the TD values in each position's `td`.
    first: usize,
    /// The exact outcome for the player to move at the last state, which
    /// replaces its TD value, as training does.
    outcome: f32,
    lambda: f32,
    returns: Vec<f32>,
}

#[derive(Serialize)]
struct Playouts {
    seed: u64,
    count: usize,
    max_plies: usize,
}

#[derive(Serialize)]
struct Puzzle {
    file: &'static str,
    number: u64,
}

#[derive(Serialize)]
struct Out<'a> {
    source: &'static str,
    az: &'a str,
    td: &'a str,
    rules: String,
    simulations: u32,
    playouts: Playouts,
    puzzle: Puzzle,
    positions: Vec<Position<'a>>,
    #[serde(rename = "openingWin")]
    opening_win: Line,
}

fn position<'a>(label: String, s: &'a GameState, az: &Mlp, td: &ValueMlp) -> Position<'a> {
    let features = az.features.encode(s);
    let (logits, value) = az.forward(&features);
    let moves = legal_moves(s);
    let priors = if moves.is_empty() {
        Vec::new()
    } else {
        az.evaluate(s, &moves).0
    };
    let cfg = MctsConfig {
        num_simulations: SIMULATIONS,
        ..MctsConfig::default()
    };
    let result = search(az, s, &RULES, &cfg, None);
    let visits: Vec<u32> = if moves.is_empty() {
        Vec::new()
    } else {
        assert!(result.visits.iter().map(|v| v.0).eq(moves.iter().copied()));
        result.visits.iter().map(|v| v.1).collect()
    };
    Position {
        label,
        state: s,
        td: td.forward(&td.features.encode(s)),
        features,
        az: Net { logits, value },
        legal: moves.iter().map(triple).collect(),
        priors,
        visits,
        greedy: moves.iter().map(|&m| greedy_score(s, m, &RULES)).collect(),
    }
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    ensure!(
        args.len() == 3,
        "usage: figures_fixture AZ.pfw TD.pfv OUT.json"
    );
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let az = Mlp::from_bytes(&std::fs::read(&args[0])?)?;
    let td = ValueMlp::load(Path::new(&args[1]))?;
    ensure!(
        az.features == td.features && az.features.encode(&initial_state()).len() == 127,
        "both nets must read the same 127 features"
    );

    let states = opening_win(&root)?;
    let samples = playouts(&states)?;
    let riddle = puzzle(&root)?;
    let mut positions: Vec<Position> = samples
        .iter()
        .enumerate()
        .map(|(i, s)| position(format!("playout {i}"), s, &az, &td))
        .collect();
    let first = positions.len();
    for (ply, s) in states.iter().enumerate() {
        positions.push(position(format!("openingWin ply {ply}"), s, &az, &td));
    }
    positions.push(position(format!("puzzle {PUZZLE}"), &riddle, &az, &td));

    // As td.rs `game_targets`: the net's values, the last replaced by the
    // exact outcome for its player to move.
    let mut values: Vec<f32> = states
        .iter()
        .map(|s| td.forward(&td.features.encode(s)))
        .collect();
    let last = states.last().expect("non-empty");
    let won =
        is_terminal(last, &RuleSet::Uncapped).and_then(|o| o.winner()) == Some(last.to_move());
    let outcome = if won { 1.0 } else { -1.0 };
    *values.last_mut().expect("non-empty") = outcome;
    let returns = lambda_returns(&values, LAMBDA);

    let out = Out {
        source: SOURCE,
        az: &args[0],
        td: &args[1],
        rules: RULES.to_string(),
        simulations: SIMULATIONS,
        playouts: Playouts {
            seed: SEED,
            count: PLAYOUTS,
            max_plies: MAX_PLIES,
        },
        puzzle: Puzzle {
            file: PUZZLES,
            number: PUZZLE,
        },
        positions,
        opening_win: Line {
            first,
            outcome,
            lambda: LAMBDA,
            returns,
        },
    };
    std::fs::write(&args[2], serde_json::to_string(&out)? + "\n")?;
    Ok(())
}
