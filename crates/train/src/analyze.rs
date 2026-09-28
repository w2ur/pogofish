//! Self-play sweep + policy probe analysis for a trained AlphaZero model.
//!
//! Produces a stable JSON payload consumed by the web app's "what the AI learned"
//! scene. Board states are emitted in the TS-friendly `Cell[9]` / `("W"|"R")[]`
//! shape the React `StoryBoard` component already renders.

use std::collections::HashMap;
use std::path::Path;

use anyhow::Context;
use pogofish_engine::{
    apply_move, initial_state, is_terminal, legal_moves, Color, GameState, Move, Outcome, RuleSet,
};
use pogofish_search::rng::SplitMix64;
use serde::{Deserialize, Serialize};
use tch::nn;

use crate::encoding::{move_to_index, state_to_tensor, ACTION_SIZE};
use crate::net::{make_var_store, ArchConfig, AzNet};
use crate::selfplay::{neural_mcts_move_with_tau, SelfPlayConfig};

// ---------------------------------------------------------------------------
// Payload schema (mirrored on the TS side in app/src/story/insights.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightsPayload {
    pub model_id: String,
    pub variant: String,
    pub games_played: usize,
    pub avg_game_length: f64,
    pub draw_rate: f64,
    pub white_win_rate: f64,
    pub red_win_rate: f64,
    pub opening_move_distribution: Vec<OpeningCount>,
    pub capture_timing_histogram: Vec<usize>,
    pub stack_size_at_endgame: Vec<usize>,
    pub policy_probes: Vec<PolicyProbe>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpeningCount {
    pub from_cell: u8,
    pub to_cell: u8,
    pub num_pieces: u8,
    pub count: usize,
    pub frequency: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyProbe {
    pub label: String,
    pub board: StoryBoard,
    pub top_moves: Vec<TopMove>,
    pub value_estimate: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopMove {
    pub from_cell: u8,
    pub to_cell: u8,
    pub num_pieces: u8,
    pub probability: f32,
}

/// TS-friendly board representation: one `Vec<String>` per cell, strings are "W" or "R".
/// Matches the shape consumed by the React `StoryBoard` component.
pub type StoryBoard = Vec<Vec<String>>;

fn game_state_to_story_board(state: &GameState) -> StoryBoard {
    state
        .cells()
        .iter()
        .map(|cell| {
            cell.iter()
                .map(|c| match c {
                    Color::White => "W".to_string(),
                    Color::Red => "R".to_string(),
                })
                .collect()
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub fn run(model_dir: &Path, output: &Path, num_games: usize) -> anyhow::Result<()> {
    let model_path = model_dir.join("model_best.pt");
    anyhow::ensure!(
        model_path.exists() || !model_dir.join("weights.pt").exists(),
        "{} is a round-2 run (weights.pt, no model_best.pt). This analyzer is the round-1 \
         article tool (LC3-29, absolute encoding) and would misread it; it is reworked with \
         the article in plan Phase 7",
        model_dir.display()
    );
    anyhow::ensure!(
        model_path.exists(),
        "model checkpoint not found: {}",
        model_path.display()
    );

    let arch = ArchConfig::mlp_small();
    let (net, _vs) = load_model(&model_path, &arch)?;

    // Variant is hardcoded to LC3-29 (Classic). The analyzer currently targets
    // the one model shipping in the web app; broaden if other variants ship later.
    let rules = RuleSet::LC3 { cap: 29 };
    let variant_label = "LC3-29".to_string();

    let cfg = SelfPlayConfig {
        num_simulations: 200,
        max_moves: 60,
        ..SelfPlayConfig::default()
    };

    eprintln!(
        "analyze: {} games, {} sims/move, variant {}",
        num_games, cfg.num_simulations, variant_label
    );

    let mut rng = SplitMix64::new(42);
    let mut games: Vec<GameRecord> = Vec::with_capacity(num_games);
    for i in 0..num_games {
        let record = play_one(&net, &rules, &cfg, &mut rng);
        games.push(record);
        if (i + 1) % 25 == 0 || i + 1 == num_games {
            eprintln!("  [{}/{}] games complete", i + 1, num_games);
        }
    }

    let model_id = model_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let (avg_len, draw_rate, w_rate, r_rate) = aggregate_outcomes(&games);
    let opening_dist = aggregate_opening_moves(&games);
    let capture_hist = aggregate_capture_timing(&games);
    let stack_endgame = aggregate_endgame_stacks(&games);
    let probes = run_policy_probes(&net, &games, &rules)?;

    let payload = InsightsPayload {
        model_id,
        variant: variant_label,
        games_played: num_games,
        avg_game_length: avg_len,
        draw_rate,
        white_win_rate: w_rate,
        red_win_rate: r_rate,
        opening_move_distribution: opening_dist,
        capture_timing_histogram: capture_hist,
        stack_size_at_endgame: stack_endgame,
        policy_probes: probes,
    };

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create output dir {}", parent.display()))?;
    }
    std::fs::write(output, serde_json::to_string_pretty(&payload)?)
        .with_context(|| format!("failed to write {}", output.display()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Model loading (mirrors tournament.rs pattern)
// ---------------------------------------------------------------------------

fn load_model(path: &Path, arch: &ArchConfig) -> anyhow::Result<(AzNet, nn::VarStore)> {
    let mut vs = make_var_store();
    let net = AzNet::from_config(&vs.root(), arch);
    net.load(&mut vs, path)
        .with_context(|| format!("failed to load model weights from {}", path.display()))?;
    Ok((net, vs))
}

// ---------------------------------------------------------------------------
// Self-play game recording
// ---------------------------------------------------------------------------

struct GameRecord {
    moves: Vec<Move>,
    states: Vec<GameState>, // states[i] is the state BEFORE moves[i]
    terminal: GameState,
    outcome: Option<Outcome>,  // None if max_moves was hit without terminal
    capture_plies: Vec<usize>, // 0-indexed ply positions where a capture occurred
}

fn play_one(
    net: &AzNet,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
    rng: &mut SplitMix64,
) -> GameRecord {
    let mut state = initial_state();
    let mut moves: Vec<Move> = Vec::new();
    let mut states: Vec<GameState> = Vec::new();
    let mut capture_plies: Vec<usize> = Vec::new();

    for ply in 0..(cfg.max_moves as usize) {
        if let Some(outcome) = is_terminal(&state, rules) {
            return GameRecord {
                moves,
                states,
                terminal: state,
                outcome: Some(outcome),
                capture_plies,
            };
        }

        // Tau > 0 for the first few plies adds opening variety across games;
        // greedy thereafter for clean endgame lines.
        let tau = if ply < 6 { 0.5 } else { 0.0 };

        let top_before = cell_top_colors(&state);
        let mv = neural_mcts_move_with_tau(net, &state, rules, cfg, tau, rng);
        states.push(state.clone());
        moves.push(mv);

        state = apply_move(&state, mv).expect("MCTS returned illegal move");

        let top_after = cell_top_colors(&state);
        if top_changed(&top_before, &top_after) {
            capture_plies.push(ply);
        }
    }

    GameRecord {
        moves,
        states,
        terminal: state,
        outcome: None,
        capture_plies,
    }
}

fn cell_top_colors(state: &GameState) -> [Option<Color>; 9] {
    let mut out = [None; 9];
    for (i, cell) in state.cells().iter().enumerate() {
        out[i] = cell.last().copied();
    }
    out
}

/// Did any cell's top-piece owner flip after the move? (Pogo capture detector.)
fn top_changed(before: &[Option<Color>; 9], after: &[Option<Color>; 9]) -> bool {
    for i in 0..9 {
        if let (Some(b), Some(a)) = (before[i], after[i]) {
            if b != a {
                return true;
            }
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

fn aggregate_outcomes(games: &[GameRecord]) -> (f64, f64, f64, f64) {
    let n = games.len().max(1) as f64;
    let mut total_len = 0usize;
    let mut draws = 0usize;
    let mut white = 0usize;
    let mut red = 0usize;
    for g in games {
        total_len += g.moves.len();
        match g.outcome {
            Some(Outcome::WinWhite) => white += 1,
            Some(Outcome::WinRed) => red += 1,
            Some(Outcome::DrawEarned) => draws += 1,
            None => draws += 1, // ran out of plies → treat as draw
        }
    }
    (
        total_len as f64 / n,
        draws as f64 / n,
        white as f64 / n,
        red as f64 / n,
    )
}

fn aggregate_opening_moves(games: &[GameRecord]) -> Vec<OpeningCount> {
    let mut counts: HashMap<(u8, u8, u8), usize> = HashMap::new();
    for g in games {
        if let Some(first) = g.moves.first() {
            *counts
                .entry((first.from_cell, first.num_pieces, first.to_cell))
                .or_default() += 1;
        }
    }
    let total = games.len().max(1) as f64;
    let mut out: Vec<OpeningCount> = counts
        .into_iter()
        .map(|((from_cell, num_pieces, to_cell), count)| OpeningCount {
            from_cell,
            to_cell,
            num_pieces,
            count,
            frequency: count as f64 / total,
        })
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count));
    out
}

fn aggregate_capture_timing(games: &[GameRecord]) -> Vec<usize> {
    // Histogram: index = ply, value = number of games with a capture at that ply.
    let max_ply = games.iter().map(|g| g.moves.len()).max().unwrap_or(0);
    let mut hist = vec![0usize; max_ply];
    for g in games {
        for &p in &g.capture_plies {
            if p < hist.len() {
                hist[p] += 1;
            }
        }
    }
    hist
}

fn aggregate_endgame_stacks(games: &[GameRecord]) -> Vec<usize> {
    // Histogram indexed by stack size (0, 1, 2, 3, …). Counts cells across all terminal states.
    let mut hist: Vec<usize> = Vec::new();
    for g in games {
        for cell in g.terminal.cells() {
            let size = cell.len();
            if hist.len() <= size {
                hist.resize(size + 1, 0);
            }
            hist[size] += 1;
        }
    }
    hist
}

// ---------------------------------------------------------------------------
// Policy probes on canonical positions
// ---------------------------------------------------------------------------

fn run_policy_probes(
    net: &AzNet,
    games: &[GameRecord],
    _rules: &RuleSet,
) -> anyhow::Result<Vec<PolicyProbe>> {
    // Canonical positions: opening + 4 states drawn from the first recorded
    // game at evenly-spaced plies + the terminal of a representative game.
    let mut probes: Vec<PolicyProbe> = Vec::new();

    probes.push(probe_state(net, "opening", &initial_state())?);

    if let Some(first_game) = games.iter().find(|g| g.states.len() >= 20) {
        let checkpoints: &[(usize, &str)] = &[
            (4, "early"),
            (8, "development"),
            (14, "midgame"),
            (20, "deep midgame"),
        ];
        for (ply, label) in checkpoints {
            if let Some(state) = first_game.states.get(*ply) {
                probes.push(probe_state(net, label, state)?);
            }
        }
        probes.push(probe_state(net, "endgame", &first_game.terminal)?);
    }

    Ok(probes)
}

fn probe_state(net: &AzNet, label: &str, state: &GameState) -> anyhow::Result<PolicyProbe> {
    let x = state_to_tensor(state);
    let (policy_logits, value) = net.forward_single(&x);

    // Softmax over ALL actions, then filter to legal moves.
    let probs: Vec<f32> = tch::no_grad(|| {
        let sm = policy_logits.softmax(-1, tch::Kind::Float);
        let mut buf = vec![0f32; ACTION_SIZE];
        sm.copy_data(&mut buf, ACTION_SIZE);
        buf
    });

    let legal = legal_moves(state);
    let mut scored: Vec<(Move, f32)> = legal
        .into_iter()
        .map(|m| {
            let p = probs.get(move_to_index(&m)).copied().unwrap_or(0.0);
            (m, p)
        })
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let total: f32 = scored
        .iter()
        .map(|(_, p)| *p)
        .sum::<f32>()
        .max(f32::EPSILON);
    let top_moves: Vec<TopMove> = scored
        .into_iter()
        .take(5)
        .map(|(m, p)| TopMove {
            from_cell: m.from_cell,
            to_cell: m.to_cell,
            num_pieces: m.num_pieces,
            probability: p / total,
        })
        .collect();

    Ok(PolicyProbe {
        label: label.to_string(),
        board: game_state_to_story_board(state),
        top_moves,
        value_estimate: value,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_serializes_round_trip() {
        let payload = InsightsPayload {
            model_id: "lc3-29".into(),
            variant: "LC3-29".into(),
            games_played: 1,
            avg_game_length: 24.0,
            draw_rate: 0.05,
            white_win_rate: 0.5,
            red_win_rate: 0.45,
            opening_move_distribution: vec![],
            capture_timing_histogram: vec![],
            stack_size_at_endgame: vec![],
            policy_probes: vec![],
        };
        let json = serde_json::to_string(&payload).unwrap();
        let back: InsightsPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(back.model_id, "lc3-29");
        assert_eq!(back.games_played, 1);
    }

    #[test]
    fn story_board_matches_cell_count() {
        let s = initial_state();
        let board = game_state_to_story_board(&s);
        assert_eq!(board.len(), 9);
    }

    #[test]
    fn top_changed_detects_capture() {
        let mut before = [None; 9];
        before[0] = Some(Color::White);
        let mut after = [None; 9];
        after[0] = Some(Color::Red);
        assert!(top_changed(&before, &after));
    }

    #[test]
    fn top_changed_ignores_moves_on_empty_cells() {
        let before = [None; 9];
        let mut after = [None; 9];
        after[0] = Some(Color::White);
        assert!(!top_changed(&before, &after));
    }
}
