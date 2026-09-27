//! Neural MCTS and self-play games for AlphaZero training.
//!
//! All randomness (Dirichlet noise, move sampling) comes from a caller-owned
//! `SplitMix64`, so a game is a pure function of the net, the start position
//! and the generator state: runs reproduce and resume exactly.

use crate::encoding::{legal_move_mask, move_to_index, ACTION_SIZE};
use crate::net::AzNet;
use pogofish_engine::{
    apply_move_under, is_terminal, legal_moves, search_key, Color, GameState, Move, Outcome,
    RuleSet, StateKey,
};
use pogofish_search::rng::SplitMix64;
use std::collections::{HashMap, HashSet};
use tch::{Kind, Tensor};

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

/// Probability of playing each move given its visit count: proportional to
/// visits^(1/tau). `tau == 0` puts all the mass on the most-visited move
/// (the first one in order among equals).
///
/// Round 1 sampled in proportion to raw visits for every `tau != 0`, i.e.
/// always `tau = 1` (v1 verdict, defect 1).
pub fn visit_distribution(visits: &[u32], tau: f32) -> Vec<f64> {
    let n = visits.len();
    if n == 0 {
        return Vec::new();
    }
    if tau <= 0.0 {
        let best = visits
            .iter()
            .enumerate()
            .max_by_key(|&(i, &v)| (v, std::cmp::Reverse(i)))
            .map(|(i, _)| i);
        return (0..n)
            .map(|i| if Some(i) == best { 1.0 } else { 0.0 })
            .collect();
    }
    let max = *visits.iter().max().expect("non-empty") as f64;
    if max == 0.0 {
        return vec![1.0 / n as f64; n];
    }
    // Scale by the maximum first so large counts and small tau stay finite.
    let weights: Vec<f64> = visits
        .iter()
        .map(|&v| (v as f64 / max).powf(1.0 / tau as f64))
        .collect();
    let total: f64 = weights.iter().sum();
    weights.iter().map(|w| w / total).collect()
}

// --------------------------------------------------------------------------
// Neural MCTS (standalone — does NOT use the search crate's uniform-prior Mcts)
// --------------------------------------------------------------------------

struct Edge {
    mv: Move,
    visits: u32,
    value_sum: f32,
    prior: f32,
}

struct Node {
    edges: Vec<Edge>,
}

struct NeuralMcts<'a> {
    net: &'a AzNet,
    cfg: &'a SelfPlayConfig,
    nodes: HashMap<StateKey, Node>,
}

impl<'a> NeuralMcts<'a> {
    fn new(net: &'a AzNet, cfg: &'a SelfPlayConfig) -> Self {
        Self {
            net,
            cfg,
            nodes: HashMap::new(),
        }
    }

    /// Run the simulations from `root` (with Dirichlet noise on the root
    /// priors if `rng` is given) and return the root's edges' visit counts.
    fn run(
        &mut self,
        root: &GameState,
        rules: &RuleSet,
        noise: Option<&mut SplitMix64>,
    ) -> Vec<(Move, u32)> {
        self.expand_if_needed(root, rules);
        if let Some(rng) = noise {
            self.apply_dirichlet(root, rules, rng);
        }
        for _ in 0..self.cfg.num_simulations {
            self.simulate(root, rules, &mut HashSet::new());
        }
        self.nodes
            .get(&search_key(root, rules))
            .map(|n| n.edges.iter().map(|e| (e.mv, e.visits)).collect())
            .unwrap_or_default()
    }

    /// Policy logits and value for one position.
    fn evaluate(&self, state: &GameState) -> (Tensor, f32) {
        let _guard = tch::no_grad_guard();
        self.net.forward_single(&self.net.encode(state))
    }

    fn expand_if_needed(&mut self, state: &GameState, rules: &RuleSet) {
        let key = search_key(state, rules);
        if self.nodes.contains_key(&key) {
            return;
        }
        let moves = legal_moves(state);
        if moves.is_empty() {
            return;
        }
        let (logits, _) = self.evaluate(state);
        let masked = logits + (legal_move_mask(state) - 1.0) * 1e9;
        let priors: Vec<f32> = masked
            .softmax(-1, Kind::Float)
            .try_into()
            .expect("f32 priors");
        let edges = moves
            .iter()
            .map(|m| Edge {
                mv: *m,
                visits: 0,
                value_sum: 0.0,
                prior: priors[move_to_index(m)],
            })
            .collect();
        self.nodes.insert(key, Node { edges });
    }

    fn apply_dirichlet(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) {
        let (alpha, epsilon) = (self.cfg.dirichlet_alpha, self.cfg.dirichlet_epsilon);
        let Some(node) = self.nodes.get_mut(&search_key(state, rules)) else {
            return;
        };
        let noise = dirichlet_sample(alpha as f64, node.edges.len(), rng);
        for (edge, n) in node.edges.iter_mut().zip(noise) {
            edge.prior = (1.0 - epsilon) * edge.prior + epsilon * n as f32;
        }
    }

    /// One simulation. `path` holds the keys already visited by this
    /// simulation: under rules that allow a position to recur (the uncapped
    /// game), the search graph has cycles, and following one would recurse
    /// forever. A position met again on the path is evaluated as a leaf (the
    /// network's value estimate) and not expanded further.
    fn simulate(
        &mut self,
        state: &GameState,
        rules: &RuleSet,
        path: &mut HashSet<StateKey>,
    ) -> f32 {
        if let Some(outcome) = is_terminal(state, rules) {
            return outcome_value_for_mover(outcome, state);
        }
        let key = search_key(state, rules);
        let revisit = !path.insert(key.clone());
        if revisit || !self.nodes.contains_key(&key) {
            self.expand_if_needed(state, rules);
            return self.evaluate(state).1;
        }

        let best_idx = {
            let node = &self.nodes[&key];
            let total: u32 = node.edges.iter().map(|e| e.visits).sum();
            let parent_sqrt = ((total + 1) as f32).sqrt();
            let mut best = (f32::MIN, 0);
            for (i, e) in node.edges.iter().enumerate() {
                let q = if e.visits == 0 {
                    0.0
                } else {
                    e.value_sum / e.visits as f32
                };
                let score = q + self.cfg.c_puct * e.prior * parent_sqrt / (1.0 + e.visits as f32);
                if score > best.0 {
                    best = (score, i);
                }
            }
            best.1
        };

        let mv = self.nodes[&key].edges[best_idx].mv;
        let next = apply_move_under(state, mv, rules).expect("legal move");
        let value = -self.simulate(&next, rules, path);
        let edge = &mut self.nodes.get_mut(&key).expect("expanded").edges[best_idx];
        edge.visits += 1;
        edge.value_sum += value;
        value
    }
}

fn sample(probs: &[f64], rng: &mut SplitMix64) -> usize {
    let mut r = rng.unit_f64();
    for (i, p) in probs.iter().enumerate() {
        if r < *p {
            return i;
        }
        r -= p;
    }
    probs.iter().rposition(|&p| p > 0.0).unwrap_or(0)
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
    let visits = NeuralMcts::new(net, cfg).run(state, rules, None);
    let counts: Vec<u32> = visits.iter().map(|&(_, v)| v).collect();
    let probs = visit_distribution(&counts, 0.0);
    visits[probs.iter().position(|&p| p == 1.0).expect("a best move")].0
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
    let visits = NeuralMcts::new(net, cfg).run(state, rules, None);
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
        let visits = NeuralMcts::new(net, cfg).run(&state, rules, Some(rng));
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

fn outcome_value_for_mover(outcome: Outcome, state: &GameState) -> f32 {
    match outcome.winner() {
        None => 0.0,
        Some(w) if w == state.to_move() => 1.0,
        Some(_) => -1.0,
    }
}

/// Symmetric Dirichlet(alpha) sample over `n` entries.
fn dirichlet_sample(alpha: f64, n: usize, rng: &mut SplitMix64) -> Vec<f64> {
    let samples: Vec<f64> = (0..n).map(|_| gamma_sample(alpha, rng)).collect();
    let total: f64 = samples.iter().sum();
    if total > 0.0 {
        samples.iter().map(|s| s / total).collect()
    } else {
        vec![1.0 / n as f64; n]
    }
}

/// Gamma(alpha, 1) by Marsaglia–Tsang, with the alpha < 1 boost.
fn gamma_sample(alpha: f64, rng: &mut SplitMix64) -> f64 {
    if alpha < 1.0 {
        let u = rng.unit_f64().max(f64::MIN_POSITIVE);
        return gamma_sample(alpha + 1.0, rng) * u.powf(1.0 / alpha);
    }
    let d = alpha - 1.0 / 3.0;
    let c = 1.0 / (9.0 * d).sqrt();
    loop {
        let u1 = rng.unit_f64().max(f64::MIN_POSITIVE);
        let u2 = rng.unit_f64();
        let z = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
        let v = (1.0 + c * z).powi(3);
        if v <= 0.0 {
            continue;
        }
        let u = rng.unit_f64().max(f64::MIN_POSITIVE);
        if u < 1.0 - 0.0331 * z.powi(4) || u.ln() < 0.5 * z * z + d * (1.0 - v + v.ln()) {
            return d * v;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::make_var_store;

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
