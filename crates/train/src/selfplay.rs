use crate::encoding::{legal_move_mask, move_to_index, state_to_tensor, ACTION_SIZE};
use crate::net::AzNet;
use pogofish_engine::{
    apply_move_under, is_terminal, legal_moves, search_key, Color, GameState, Move, Outcome, RuleSet,
    StateKey,
};
use rand::Rng;
use std::collections::{HashMap, HashSet};
use tch::{Kind, Tensor};

pub struct SelfPlayConfig {
    pub num_simulations: u32,
    pub c_puct: f32,
    pub max_moves: u16,
    pub dirichlet_alpha: f32,
    pub dirichlet_epsilon: f32,
}

impl Default for SelfPlayConfig {
    fn default() -> Self {
        Self {
            num_simulations: 100,
            c_puct: 1.5,
            max_moves: 1000,
            dirichlet_alpha: 0.3,
            dirichlet_epsilon: 0.25,
        }
    }
}

/// One training example produced from a self-play game.
pub struct TrainingExample {
    /// Encoded state tensor [STATE_SIZE].
    pub state: Tensor,
    /// MCTS visit-count distribution [ACTION_SIZE].
    pub policy: Tensor,
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

    /// Run `num_simulations` from `root`, then return the visit-count distribution
    /// and (optionally) add Dirichlet noise to the root priors.
    fn run(&mut self, root: &GameState, rules: &RuleSet, add_noise: bool) -> [f32; ACTION_SIZE] {
        // Expand root first if needed, applying Dirichlet noise
        self.expand_if_needed(root, rules);
        if add_noise {
            self.apply_dirichlet(root, rules);
        }

        for _ in 0..self.cfg.num_simulations {
            self.simulate(root, rules, &mut HashSet::new());
        }

        let root_key = search_key(root, rules);
        let mut dist = [0f32; ACTION_SIZE];
        if let Some(node) = self.nodes.get(&root_key) {
            for edge in &node.edges {
                dist[move_to_index(&edge.mv)] = edge.visits as f32;
            }
        }
        // Normalise to a probability distribution
        let total: f32 = dist.iter().sum();
        if total > 0.0 {
            for v in dist.iter_mut() {
                *v /= total;
            }
        }
        dist
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

        // Get policy priors from the net
        let state_tensor = state_to_tensor(state);
        let mask = legal_move_mask(state);
        let priors = {
            let _guard = tch::no_grad_guard();
            let (logits, _) = self.net.forward_single(&state_tensor);
            // Zero out illegal actions with a large negative bias, then softmax
            let masked = logits + (mask - 1.0) * 1e9;
            let probs: Vec<f32> = masked.softmax(-1, Kind::Float).try_into().unwrap();
            probs
        };

        let edges: Vec<Edge> = moves
            .iter()
            .map(|m| {
                let idx = move_to_index(m);
                Edge {
                    mv: *m,
                    visits: 0,
                    value_sum: 0.0,
                    prior: priors[idx],
                }
            })
            .collect();
        self.nodes.insert(key, Node { edges });
    }

    fn apply_dirichlet(&mut self, state: &GameState, rules: &RuleSet) {
        let key = search_key(state, rules);
        let node = match self.nodes.get_mut(&key) {
            Some(n) => n,
            None => return,
        };
        let alpha = self.cfg.dirichlet_alpha;
        let epsilon = self.cfg.dirichlet_epsilon;
        let n = node.edges.len();
        if n == 0 {
            return;
        }
        let noise = dirichlet_sample(alpha, n);
        for (edge, &noise_val) in node.edges.iter_mut().zip(noise.iter()) {
            edge.prior = (1.0 - epsilon) * edge.prior + epsilon * noise_val;
        }
    }

    /// One simulation. `path` holds the keys already visited by this
    /// simulation: under rules that allow a position to recur (the uncapped
    /// game), the search graph has cycles, and following one would recurse
    /// forever. A position met again on the path is evaluated as a leaf
    /// (the network's value estimate) and not expanded further.
    fn simulate(&mut self, state: &GameState, rules: &RuleSet, path: &mut HashSet<StateKey>) -> f32 {
        if let Some(outcome) = is_terminal(state, rules) {
            return outcome_value_for_mover(outcome, state);
        }

        let key = search_key(state, rules);
        let revisit = !path.insert(key.clone());
        if revisit || !self.nodes.contains_key(&key) {
            // Leaf (or a cycle back onto the path): expand if new, and return
            // the net's value estimate.
            self.expand_if_needed(state, rules);
            let state_tensor = state_to_tensor(state);
            let value = {
                let _guard = tch::no_grad_guard();
                let (_, v) = self.net.forward_single(&state_tensor);
                v
            };
            return value;
        }

        // Selection: PUCT
        let total_visits: u32 = self
            .nodes
            .get(&key)
            .unwrap()
            .edges
            .iter()
            .map(|e| e.visits)
            .sum();
        let parent_sqrt = ((total_visits + 1) as f32).sqrt();
        let best_idx = {
            let node = self.nodes.get(&key).unwrap();
            let mut best_score = f32::MIN;
            let mut best = 0;
            for (i, edge) in node.edges.iter().enumerate() {
                let q = if edge.visits == 0 {
                    0.0
                } else {
                    edge.value_sum / edge.visits as f32
                };
                let u = self.cfg.c_puct * edge.prior * parent_sqrt / (1.0 + edge.visits as f32);
                let score = q + u;
                if score > best_score {
                    best_score = score;
                    best = i;
                }
            }
            best
        };

        let chosen_mv = self.nodes.get(&key).unwrap().edges[best_idx].mv;
        let next = apply_move_under(state, chosen_mv, rules).expect("legal move");
        let child_value = self.simulate(&next, rules, path);
        let value = -child_value; // negate: child's value is from opponent's view

        let node = self.nodes.get_mut(&key).unwrap();
        node.edges[best_idx].visits += 1;
        node.edges[best_idx].value_sum += value;

        value
    }

    /// Select a move from the root visit counts.
    /// tau=1.0 → proportional to visit counts; tau=0 → greedy.
    fn select_move(&self, root: &GameState, rules: &RuleSet, tau: f32, rng: &mut impl Rng) -> Move {
        let key = search_key(root, rules);
        let node = self.nodes.get(&key).expect("root must be expanded");
        if tau == 0.0 {
            node.edges
                .iter()
                .max_by_key(|e| e.visits)
                .map(|e| e.mv)
                .expect("root must have edges")
        } else {
            let visits: Vec<f32> = node.edges.iter().map(|e| e.visits as f32).collect();
            let total: f32 = visits.iter().sum();
            let r: f32 = rng.gen_range(0.0..1.0);
            let mut cum = 0.0;
            for (edge, &v) in node.edges.iter().zip(visits.iter()) {
                cum += v / total;
                if r < cum {
                    return edge.mv;
                }
            }
            node.edges.last().map(|e| e.mv).expect("edges not empty")
        }
    }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/// Run MCTS from `state` and return the greedy (most-visited) move.
/// Used by the gatekeeper evaluation (tau=0, no Dirichlet noise).
pub fn neural_mcts_greedy_move(
    net: &AzNet,
    state: &pogofish_engine::GameState,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
) -> pogofish_engine::Move {
    let mut mcts = NeuralMcts::new(net, cfg);
    let _dist = mcts.run(state, rules, false); // no Dirichlet noise
    let mut rng = rand::thread_rng();
    mcts.select_move(state, rules, 0.0, &mut rng) // tau=0: greedy
}

/// Run MCTS from `state` and return a move sampled with the given temperature.
/// tau=0.0 → greedy; tau=0.1 → slight randomness to break determinism.
/// No Dirichlet noise is added (used for evaluation/gatekeeper).
pub fn neural_mcts_move_with_tau(
    net: &AzNet,
    state: &pogofish_engine::GameState,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
    tau: f32,
    rng: &mut impl Rng,
) -> pogofish_engine::Move {
    let mut mcts = NeuralMcts::new(net, cfg);
    let _dist = mcts.run(state, rules, false); // no Dirichlet noise
    mcts.select_move(state, rules, tau, rng)
}

/// Play one full self-play game from the initial position using neural MCTS.
pub fn play_one_game(net: &AzNet, rules: &RuleSet, cfg: &SelfPlayConfig) -> SelfPlayGame {
    play_game_from(net, &pogofish_engine::initial_state(), rules, cfg)
}

/// Play a self-play game from `start`. It stops when the rules end it
/// (`Terminated`, every example gets a value target) or after
/// `cfg.max_moves` moves (`Truncated`, examples keep their policy targets and
/// get no value target).
pub fn play_game_from(
    net: &AzNet,
    start: &GameState,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
) -> SelfPlayGame {
    let mut rng = rand::thread_rng();
    let mut state = start.clone();
    // Store (state_tensor, policy_dist, current_player) — value assigned retroactively
    let mut history: Vec<(Tensor, [f32; ACTION_SIZE], Color)> = Vec::new();

    let end = loop {
        if let Some(o) = is_terminal(&state, rules) {
            break GameEnd::Terminated(o);
        }
        if history.len() >= cfg.max_moves as usize {
            break GameEnd::Truncated;
        }

        let mut mcts = NeuralMcts::new(net, cfg);
        let tau = if history.len() < 10 { 1.0 } else { 0.0 };
        let dist = mcts.run(&state, rules, true);
        let mv = mcts.select_move(&state, rules, tau, &mut rng);

        history.push((state_to_tensor(&state), dist, state.to_move()));
        state = apply_move_under(&state, mv, rules).expect("legal move selected by MCTS");
    };

    let examples = history
        .into_iter()
        .map(|(state_tensor, dist, player)| TrainingExample {
            state: state_tensor,
            policy: Tensor::from_slice(&dist),
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

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

fn outcome_value_for_mover(outcome: Outcome, state: &GameState) -> f32 {
    match outcome {
        Outcome::DrawEarned => 0.0,
        o => match o.winner() {
            Some(w) if w == state.to_move() => 1.0,
            Some(_) => -1.0,
            None => 0.0,
        },
    }
}

/// Sample from a symmetric Dirichlet(alpha) distribution.
///
/// Uses the Gamma distribution approximation via the Ahrens-Dieter method:
/// for alpha >= 1 use standard Gamma sampling; for small alpha use the
/// Marsaglia-Tsang squeeze.  Since this is only for Dirichlet noise (alpha ~0.3)
/// we implement a simple rejection-based Gamma(alpha, 1) sampler.
fn dirichlet_sample(alpha: f32, n: usize) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let mut samples: Vec<f32> = (0..n).map(|_| gamma_sample(alpha, &mut rng)).collect();
    let total: f32 = samples.iter().sum();
    if total > 0.0 {
        for s in samples.iter_mut() {
            *s /= total;
        }
    }
    samples
}

/// Sample one value from Gamma(shape=alpha, scale=1) using Marsaglia-Tsang (2000).
/// Works for alpha > 0.
fn gamma_sample(alpha: f32, rng: &mut impl Rng) -> f32 {
    // For small alpha: use Gamma(alpha+1, 1) * U^(1/alpha)
    if alpha < 1.0 {
        let u: f32 = rng.gen::<f32>().powf(1.0 / alpha);
        return gamma_sample(1.0 + alpha, rng) * u;
    }
    let d = alpha - 1.0 / 3.0;
    let c = 1.0 / (9.0 * d).sqrt();
    loop {
        // Box-Muller standard normal from two uniforms
        let u: f32 = rng.gen::<f32>();
        let v: f32 = rng.gen::<f32>();
        let z = (-2.0 * u.ln()).sqrt() * (2.0 * std::f32::consts::PI * v).cos();

        let v_cube = (1.0 + c * z).powi(3);
        if v_cube <= 0.0 {
            continue;
        }
        let u2: f32 = rng.gen::<f32>();
        if u2 < 1.0 - 0.0331 * z.powi(4) {
            return d * v_cube;
        }
        if u2.ln() < 0.5 * z * z + d * (1.0 - v_cube + v_cube.ln()) {
            return d * v_cube;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::{make_var_store, AzNet};
    use pogofish_engine::RuleSet;
    use tch::nn;

    fn make_net_and_cfg() -> (nn::VarStore, AzNet, SelfPlayConfig) {
        let vs = make_var_store();
        let net = AzNet::new(&vs.root(), &[64, 32], 32, 32);
        let cfg = SelfPlayConfig {
            num_simulations: 10,
            c_puct: 1.5,
            max_moves: 20,
            dirichlet_alpha: 0.3,
            dirichlet_epsilon: 0.25,
        };
        (vs, net, cfg)
    }

    #[test]
    fn play_one_game_nonempty() {
        let (_vs, net, cfg) = make_net_and_cfg();
        let rules = RuleSet::LC1 { repetitions: 1 };
        let examples = play_one_game(&net, &rules, &cfg).examples;
        assert!(
            !examples.is_empty(),
            "game should produce at least one training example"
        );
    }

    #[test]
    fn training_example_policy_len() {
        let (_vs, net, cfg) = make_net_and_cfg();
        let rules = RuleSet::LC1 { repetitions: 1 };
        let examples = play_one_game(&net, &rules, &cfg).examples;
        for ex in &examples {
            assert_eq!(ex.policy.size(), vec![ACTION_SIZE as i64]);
        }
    }

    #[test]
    fn training_example_value_bounded() {
        let (_vs, net, cfg) = make_net_and_cfg();
        let rules = RuleSet::LC1 { repetitions: 1 };
        let examples = play_one_game(&net, &rules, &cfg).examples;
        for ex in &examples {
            assert!(ex.value.map_or(true, |v| (-1.0..=1.0).contains(&v)));
        }
    }
}
