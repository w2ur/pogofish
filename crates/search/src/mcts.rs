use pogofish_engine::{
    apply_move_under, is_terminal, legal_moves, search_key, GameState, Move, Outcome, RuleSet,
    StateKey,
};
use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy)]
pub struct MctsConfig {
    pub simulations: u32,
    pub c_puct: f32,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct MctsStats {
    pub total_simulations: u32,
}

pub struct Mcts {
    cfg: MctsConfig,
    stats: MctsStats,
    nodes: HashMap<StateKey, Node>,
}

#[derive(Debug, Clone)]
struct Edge {
    mv: Move,
    #[allow(dead_code)]
    child_key: StateKey,
    visits: u32,
    value_sum: f32,
    prior: f32,
}

#[derive(Debug, Clone)]
struct Node {
    edges: Vec<Edge>,
}

impl Mcts {
    pub fn new(cfg: MctsConfig) -> Self {
        Self {
            cfg,
            stats: MctsStats::default(),
            nodes: HashMap::new(),
        }
    }

    pub fn stats(&self) -> &MctsStats {
        &self.stats
    }

    pub fn search(&mut self, root: &GameState, rules: &RuleSet) -> Move {
        for _ in 0..self.cfg.simulations {
            self.simulate(root, rules, &mut HashSet::new());
            self.stats.total_simulations += 1;
        }
        let root_key = search_key(root, rules);
        let root_node = self
            .nodes
            .get(&root_key)
            .expect("root must be expanded after simulations");
        root_node
            .edges
            .iter()
            .max_by_key(|e| e.visits)
            .map(|e| e.mv)
            .expect("root must have edges")
    }

    /// One simulation. `path` holds the keys already visited by this
    /// simulation: under rules that allow a position to recur (the uncapped
    /// game), the search graph has cycles, and following one would recurse
    /// forever. A position met again on the path is evaluated as a leaf
    /// (value 0: no estimate is available) and not expanded further.
    fn simulate(
        &mut self,
        state: &GameState,
        rules: &RuleSet,
        path: &mut HashSet<StateKey>,
    ) -> f32 {
        if let Some(outcome) = is_terminal(state, rules) {
            return outcome_value(outcome, state);
        }

        let key = search_key(state, rules);
        if !path.insert(key.clone()) {
            return 0.0;
        }
        if let Entry::Vacant(slot) = self.nodes.entry(key.clone()) {
            let moves = legal_moves(state);
            let n = moves.len().max(1) as f32;
            let uniform_prior = 1.0 / n;
            let edges: Vec<Edge> = moves
                .iter()
                .map(|m| {
                    let next = apply_move_under(state, *m, rules).expect("legal move");
                    Edge {
                        mv: *m,
                        child_key: search_key(&next, rules),
                        visits: 0,
                        value_sum: 0.0,
                        prior: uniform_prior,
                    }
                })
                .collect();
            slot.insert(Node { edges });
            return 0.0;
        }

        // Selection via PUCT — pick edge with highest score
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

        let chosen_move = self.nodes.get(&key).unwrap().edges[best_idx].mv;
        let next = apply_move_under(state, chosen_move, rules).expect("legal move");
        let child_value = self.simulate(&next, rules, path);
        let value = -child_value; // Negate: child's value is from opponent's perspective

        // Backpropagate on the edge
        let node = self.nodes.get_mut(&key).unwrap();
        node.edges[best_idx].visits += 1;
        node.edges[best_idx].value_sum += value;

        value
    }
}

fn outcome_value(outcome: Outcome, state: &GameState) -> f32 {
    match outcome {
        Outcome::DrawEarned => 0.0,
        o => {
            let mover = state.to_move();
            match o.winner() {
                Some(w) if w == mover => 1.0,
                Some(_) => -1.0,
                None => 0.0,
            }
        }
    }
}
