//! Neural MCTS and self-play games for AlphaZero training.
//!
//! All randomness (Dirichlet noise, move sampling) comes from a caller-owned
//! `SplitMix64`, so a game is a pure function of the net, the start position
//! and the generator state: runs reproduce and resume exactly.

use crate::encoding::{legal_move_mask, move_to_index, ACTION_SIZE};
use crate::net::AzNet;
use pogofish_engine::{apply_move_under, is_terminal, Color, GameState, Move, Outcome, RuleSet};
pub use pogofish_infer::mcts::visit_distribution;
use pogofish_infer::mcts::{sample, search, Evaluator, MctsConfig};
use pogofish_search::rng::SplitMix64;
use tch::Kind;

#[derive(Debug, Clone)]
pub struct SelfPlayConfig {
    pub num_simulations: u32,
    pub c_puct: f32,
    /// Safety limit: a game still running after this many moves is truncated.
    pub max_moves: u16,
    pub dirichlet_alpha: f32,
    pub dirichlet_epsilon: f32,
    /// Moves sampled at temperature 1 from the visit counts at the start of
    /// a self-play game; after that the most-visited move is played.
    pub temperature_moves: u32,
}

impl Default for SelfPlayConfig {
    fn default() -> Self {
        Self {
            num_simulations: 100,
            c_puct: 1.5,
            max_moves: 1000,
            dirichlet_alpha: 0.3,
            dirichlet_epsilon: 0.25,
            temperature_moves: 10,
        }
    }
}

/// One training example produced from a self-play game.
pub struct TrainingExample {
    /// The position (kept so it can be transformed by a symmetry later).
    pub position: GameState,
    /// MCTS visit-count distribution [ACTION_SIZE].
    pub policy: [f32; ACTION_SIZE],
    /// Game outcome from this position's player's perspective (+1.0 / -1.0 /
    /// 0.0 for a draw). `None` when the game was truncated: a truncation is
    /// not a result, so the position has no value target.
    pub value: Option<f32>,
}

/// How a self-play game stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameEnd {
    /// The rules ended the game.
    Terminated(Outcome),
    /// The safety limit (`SelfPlayConfig::max_moves`) stopped it first.
    Truncated,
}

/// A finished self-play game: how it ended and one example per position.
pub struct SelfPlayGame {
    pub end: GameEnd,
    pub examples: Vec<TrainingExample>,
}

impl SelfPlayConfig {
    pub fn mcts(&self) -> MctsConfig {
        MctsConfig {
            num_simulations: self.num_simulations,
            c_puct: self.c_puct,
            dirichlet_alpha: self.dirichlet_alpha,
            dirichlet_epsilon: self.dirichlet_epsilon,
        }
    }
}

/// The libtorch net as a search evaluator: priors are the softmax of the
/// policy logits with illegal actions pushed to -1e9, computed in libtorch
/// exactly as round 2 trained with.
impl Evaluator for AzNet {
    fn evaluate(&self, state: &GameState, moves: &[Move]) -> (Vec<f32>, f32) {
        let _guard = tch::no_grad_guard();
        let (logits, value) = self.forward_single(&self.encode(state));
        let masked = logits + (legal_move_mask(state) - 1.0) * 1e9;
        let priors: Vec<f32> = masked
            .softmax(-1, Kind::Float)
            .try_into()
            .expect("f32 priors");
        (
            moves.iter().map(|m| priors[move_to_index(m)]).collect(),
            value,
        )
    }
}

fn visits_to_policy(visits: &[(Move, u32)]) -> [f32; ACTION_SIZE] {
    let total: u32 = visits.iter().map(|(_, v)| v).sum();
    let mut dist = [0f32; ACTION_SIZE];
    if total > 0 {
        for (m, v) in visits {
            dist[move_to_index(m)] = *v as f32 / total as f32;
        }
    }
    dist
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/// Run MCTS from `state` without noise and return the most-visited move.
/// Deterministic. Used for evaluation.
pub fn neural_mcts_greedy_move(
    net: &AzNet,
    state: &GameState,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
) -> Move {
    search(net, state, rules, &cfg.mcts(), None).best_move()
}

/// Run MCTS from `state` without noise and sample a move at temperature `tau`.
pub fn neural_mcts_move_with_tau(
    net: &AzNet,
    state: &GameState,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
    tau: f32,
    rng: &mut SplitMix64,
) -> Move {
    let visits = search(net, state, rules, &cfg.mcts(), None).visits;
    let counts: Vec<u32> = visits.iter().map(|&(_, v)| v).collect();
    visits[sample(&visit_distribution(&counts, tau), rng)].0
}

/// Play one full self-play game from the initial position using neural MCTS.
pub fn play_one_game(
    net: &AzNet,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
    rng: &mut SplitMix64,
) -> SelfPlayGame {
    play_game_from(net, &pogofish_engine::initial_state(), rules, cfg, rng)
}

/// Play a self-play game from `start`, with Dirichlet noise at every root and
/// temperature 1 for the first `cfg.temperature_moves` moves. It stops when
/// the rules end it (`Terminated`, every example gets a value target) or
/// after `cfg.max_moves` moves (`Truncated`, examples keep their policy
/// targets and get no value target).
pub fn play_game_from(
    net: &AzNet,
    start: &GameState,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
    rng: &mut SplitMix64,
) -> SelfPlayGame {
    let mut state = start.clone();
    let mut history: Vec<(GameState, [f32; ACTION_SIZE], Color)> = Vec::new();

    let end = loop {
        if let Some(o) = is_terminal(&state, rules) {
            break GameEnd::Terminated(o);
        }
        if history.len() >= cfg.max_moves as usize {
            break GameEnd::Truncated;
        }
        let visits = search(net, &state, rules, &cfg.mcts(), Some(&mut *rng)).visits;
        let counts: Vec<u32> = visits.iter().map(|&(_, v)| v).collect();
        let tau = if (history.len() as u32) < cfg.temperature_moves {
            1.0
        } else {
            0.0
        };
        let mv = visits[sample(&visit_distribution(&counts, tau), rng)].0;
        history.push((state.clone(), visits_to_policy(&visits), state.to_move()));
        state = apply_move_under(&state, mv, rules).expect("legal move selected by MCTS");
    };

    let examples = history
        .into_iter()
        .map(|(position, policy, player)| TrainingExample {
            position,
            policy,
            value: match end {
                GameEnd::Truncated => None,
                GameEnd::Terminated(o) => Some(match o.winner() {
                    Some(winner) if winner == player => 1.0,
                    Some(_) => -1.0,
                    None => 0.0,
                }),
            },
        })
        .collect();
    SelfPlayGame { end, examples }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::make_var_store;
    use pogofish_infer::mcts::dirichlet_sample;

    /// Plan task 4.2 regression: tau = 0.5 must give a strictly sharper move
    /// distribution than tau = 1 on the same visits. Round 1's code returned
    /// the same (raw-visit) distribution for both.
    #[test]
    fn a_lower_temperature_sharpens_the_move_distribution() {
        let visits = [10, 30, 60];
        let t1 = visit_distribution(&visits, 1.0);
        let t05 = visit_distribution(&visits, 0.5);
        assert!(
            (t1[2] - 0.6).abs() < 1e-12,
            "tau 1 is proportional to visits"
        );
        let expected = 3600.0 / (100.0 + 900.0 + 3600.0);
        assert!(
            (t05[2] - expected).abs() < 1e-12,
            "tau 0.5 squares the visits"
        );
        assert!(t05[2] > t1[2] && t05[0] < t1[0]);
        assert_eq!(visit_distribution(&visits, 0.0), vec![0.0, 0.0, 1.0]);
        for d in [t1, t05] {
            assert!((d.iter().sum::<f64>() - 1.0).abs() < 1e-12);
        }
    }

    #[test]
    fn visit_distribution_edge_cases() {
        assert_eq!(
            visit_distribution(&[5, 5], 0.0),
            vec![1.0, 0.0],
            "first among equals"
        );
        assert_eq!(visit_distribution(&[0, 0], 1.0), vec![0.5, 0.5]);
        let tiny = visit_distribution(&[1000, 500], 0.01);
        assert!(tiny.iter().all(|p| p.is_finite()));
        assert!(tiny[0] > 0.99);
        assert!(visit_distribution(&[], 1.0).is_empty());
    }

    #[test]
    fn dirichlet_samples_are_distributions() {
        let mut rng = SplitMix64::new(4);
        for n in [1, 5, 30] {
            let d = dirichlet_sample(0.3, n, &mut rng);
            assert_eq!(d.len(), n);
            assert!(d.iter().all(|&x| x >= 0.0));
            assert!((d.iter().sum::<f64>() - 1.0).abs() < 1e-9);
        }
    }

    #[test]
    fn self_play_is_a_function_of_the_seed() {
        let vs = make_var_store();
        let net = AzNet::new(&vs.root(), &[32], 16, 16);
        let cfg = SelfPlayConfig {
            num_simulations: 8,
            max_moves: 40,
            ..SelfPlayConfig::default()
        };
        let play = |seed| {
            let g = play_one_game(&net, &RuleSet::Uncapped, &cfg, &mut SplitMix64::new(seed));
            (
                g.end,
                g.examples
                    .iter()
                    .map(|e| e.position.key())
                    .collect::<Vec<_>>(),
            )
        };
        assert_eq!(play(3), play(3));
        assert_ne!(play(3).1, play(4).1);
    }
}
