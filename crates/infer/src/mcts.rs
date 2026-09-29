//! Neural MCTS (PUCT), shared by training (through libtorch) and the
//! terminal game (through the pure-Rust [`crate::mlp::Mlp`]).
//!
//! All randomness (Dirichlet noise, move sampling) comes from a caller-owned
//! `SplitMix64`, so a search is a pure function of the evaluator, the
//! position and the generator state.

use crate::actions::move_to_index;
use crate::mlp::Mlp;
use pogofish_engine::{
    apply_move_under, is_terminal, legal_moves, search_key, GameState, Move, Outcome, RuleSet,
    StateKey,
};
use pogofish_search::rng::SplitMix64;
use std::collections::{HashMap, HashSet};

/// What the search asks of a network.
pub trait Evaluator {
    /// Prior probabilities for `moves` (same order, summing to 1) and the
    /// value of `state` in [−1, 1] for its player to move.
    fn evaluate(&self, state: &GameState, moves: &[Move]) -> (Vec<f32>, f32);
}

/// The pure-Rust net as an evaluator: softmax of the policy logits over the
/// legal moves.
impl Evaluator for Mlp {
    fn evaluate(&self, state: &GameState, moves: &[Move]) -> (Vec<f32>, f32) {
        let (logits, value) = self.forward(&self.features.encode(state));
        let picked: Vec<f32> = moves.iter().map(|m| logits[move_to_index(m)]).collect();
        let max = picked.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let exp: Vec<f32> = picked.iter().map(|l| (l - max).exp()).collect();
        let total: f32 = exp.iter().sum();
        (exp.iter().map(|e| e / total).collect(), value)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct MctsConfig {
    pub num_simulations: u32,
    pub c_puct: f32,
    pub dirichlet_alpha: f32,
    pub dirichlet_epsilon: f32,
}

impl Default for MctsConfig {
    fn default() -> Self {
        Self {
            num_simulations: 100,
            c_puct: 1.5,
            dirichlet_alpha: 0.3,
            dirichlet_epsilon: 0.25,
        }
    }
}

/// The outcome of a search from one position.
#[derive(Debug, Clone)]
pub struct SearchResult {
    /// Each legal move with its visit count, in engine order.
    pub visits: Vec<(Move, u32)>,
    /// The mean backed-up value of the root's visited edges, for the player
    /// to move: the search's own estimate of the position.
    pub root_value: f32,
}

impl SearchResult {
    /// The most-visited move (first in engine order among equals).
    pub fn best_move(&self) -> Move {
        let counts: Vec<u32> = self.visits.iter().map(|&(_, v)| v).collect();
        let probs = visit_distribution(&counts, 0.0);
        self.visits[probs.iter().position(|&p| p == 1.0).expect("a best move")].0
    }
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

/// Draw an index from a probability vector.
pub fn sample(probs: &[f64], rng: &mut SplitMix64) -> usize {
    let mut r = rng.unit_f64();
    for (i, p) in probs.iter().enumerate() {
        if r < *p {
            return i;
        }
        r -= p;
    }
    probs.iter().rposition(|&p| p > 0.0).unwrap_or(0)
}

/// Run `cfg.num_simulations` simulations from `root`, with Dirichlet noise on
/// the root priors when `noise` is given.
pub fn search<E: Evaluator + ?Sized>(
    eval: &E,
    root: &GameState,
    rules: &RuleSet,
    cfg: &MctsConfig,
    noise: Option<&mut SplitMix64>,
) -> SearchResult {
    let mut tree = Tree {
        eval,
        cfg,
        nodes: HashMap::new(),
    };
    let _ = tree.expand_if_needed(root, rules);
    if let Some(rng) = noise {
        tree.apply_dirichlet(root, rules, rng);
    }
    for _ in 0..cfg.num_simulations {
        tree.simulate(root, rules, &mut HashSet::new());
    }
    let (visits, root_value) = match tree.nodes.get(&search_key(root, rules)) {
        Some(n) => {
            let visits = n.edges.iter().map(|e| (e.mv, e.visits)).collect();
            let total: u32 = n.edges.iter().map(|e| e.visits).sum();
            let sum: f32 = n.edges.iter().map(|e| e.value_sum).sum();
            (visits, if total > 0 { sum / total as f32 } else { 0.0 })
        }
        None => (Vec::new(), 0.0),
    };
    SearchResult { visits, root_value }
}

struct Edge {
    mv: Move,
    visits: u32,
    value_sum: f32,
    prior: f32,
}

struct Node {
    edges: Vec<Edge>,
}

struct Tree<'a, E: ?Sized> {
    eval: &'a E,
    cfg: &'a MctsConfig,
    nodes: HashMap<StateKey, Node>,
}

impl<E: Evaluator + ?Sized> Tree<'_, E> {
    /// Expand `state` if it is new, returning the network's value for it
    /// when the network was run (so a new leaf costs one evaluation).
    fn expand_if_needed(&mut self, state: &GameState, rules: &RuleSet) -> Option<f32> {
        let key = search_key(state, rules);
        if self.nodes.contains_key(&key) {
            return None;
        }
        let moves = legal_moves(state);
        if moves.is_empty() {
            return None;
        }
        let (priors, value) = self.eval.evaluate(state, &moves);
        let edges = moves
            .iter()
            .zip(priors)
            .map(|(m, prior)| Edge {
                mv: *m,
                visits: 0,
                value_sum: 0.0,
                prior,
            })
            .collect();
        self.nodes.insert(key, Node { edges });
        Some(value)
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
    /// simulation: when a position can recur, the search graph has cycles,
    /// and following one would recurse forever. A position met again on the
    /// path is evaluated as a leaf and not expanded further.
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
            return match self.expand_if_needed(state, rules) {
                Some(value) => value,
                None => self.eval.evaluate(state, &legal_moves(state)).1,
            };
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

fn outcome_value_for_mover(outcome: Outcome, state: &GameState) -> f32 {
    match outcome.winner() {
        None => 0.0,
        Some(w) if w == state.to_move() => 1.0,
        Some(_) => -1.0,
    }
}

/// Symmetric Dirichlet(alpha) sample over `n` entries.
pub fn dirichlet_sample(alpha: f64, n: usize, rng: &mut SplitMix64) -> Vec<f64> {
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
    use pogofish_engine::{initial_state, testing::position, Cell, Color};

    /// Uniform priors, value 0: the search alone must find a one-move win.
    struct Flat;
    impl Evaluator for Flat {
        fn evaluate(&self, _: &GameState, moves: &[Move]) -> (Vec<f32>, f32) {
            (vec![1.0 / moves.len() as f32; moves.len()], 0.0)
        }
    }

    /// Plan task 4.2 regression, kept with the function it tests.
    #[test]
    fn a_lower_temperature_sharpens_the_move_distribution() {
        let visits = [10, 30, 60];
        let t1 = visit_distribution(&visits, 1.0);
        let t05 = visit_distribution(&visits, 0.5);
        assert!((t1[2] - 0.6).abs() < 1e-12);
        assert!((t05[2] - 3600.0 / 4600.0).abs() < 1e-12);
        assert!(t05[2] > t1[2] && t05[0] < t1[0]);
        assert_eq!(visit_distribution(&visits, 0.0), vec![0.0, 0.0, 1.0]);
    }

    #[test]
    fn the_search_finds_a_one_move_win_and_rates_it() {
        let mut cells: [Cell; 9] = std::array::from_fn(|_| Vec::new());
        cells[0] = vec![Color::White];
        cells[1] = vec![Color::Red];
        cells[3] = vec![Color::White, Color::White];
        let s = position(cells, Color::White, 0);
        let cfg = MctsConfig {
            num_simulations: 200,
            ..MctsConfig::default()
        };
        let r = search(&Flat, &s, &RuleSet::Uncapped, &cfg, None);
        let next = apply_move_under(&s, r.best_move(), &RuleSet::Uncapped).unwrap();
        assert_eq!(
            is_terminal(&next, &RuleSet::Uncapped),
            Some(Outcome::WinWhite)
        );
        assert!(r.root_value > 0.5, "{}", r.root_value);
        assert_eq!(r.visits.len(), legal_moves(&s).len());
        assert_eq!(r.visits.iter().map(|v| v.1).sum::<u32>(), 200);
    }

    #[test]
    fn noise_is_reproducible_from_the_seed() {
        let s = initial_state();
        let cfg = MctsConfig {
            num_simulations: 30,
            ..MctsConfig::default()
        };
        let run = |seed| {
            search(
                &Flat,
                &s,
                &RuleSet::LC1 { repetitions: 2 },
                &cfg,
                Some(&mut SplitMix64::new(seed)),
            )
            .visits
        };
        assert_eq!(run(1), run(1));
    }
}
