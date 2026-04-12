use pogofish_engine::{
    apply_move, is_terminal, legal_moves, GameState, Move, Outcome, RuleSet, StateKey,
};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy)]
pub struct SolveConfig {
    pub max_depth: u16,
    pub use_tt: bool,
}

impl Default for SolveConfig {
    fn default() -> Self {
        Self {
            max_depth: u16::MAX,
            use_tt: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SolveResult {
    /// Value from the perspective of the to-move player:
    /// +1 = mover wins, -1 = mover loses, 0 = draw or undetermined.
    pub value: i8,
    pub best_move: Option<Move>,
    pub nodes_explored: u64,
}

/// Depth-aware transposition table entry.
/// Entries cached at low depth must not be reused at higher depth
/// (the prior minimax bug — see design doc §2).
#[derive(Debug, Clone, Copy)]
struct TTEntry {
    value: i8,
    best_move: Option<Move>,
    depth_remaining: u16,
}

pub fn solve(state: &GameState, rules: &RuleSet, cfg: SolveConfig) -> SolveResult {
    let mut tt: HashMap<StateKey, TTEntry> = HashMap::new();
    let mut nodes = 0u64;
    let (value, best_move) = negamax(
        state,
        rules,
        cfg.max_depth,
        -1,
        1,
        &mut tt,
        cfg.use_tt,
        &mut nodes,
    );
    SolveResult {
        value,
        best_move,
        nodes_explored: nodes,
    }
}

fn negamax(
    state: &GameState,
    rules: &RuleSet,
    depth_remaining: u16,
    mut alpha: i8,
    beta: i8,
    tt: &mut HashMap<StateKey, TTEntry>,
    use_tt: bool,
    nodes: &mut u64,
) -> (i8, Option<Move>) {
    *nodes += 1;

    if let Some(outcome) = is_terminal(state, rules) {
        let v = outcome_value(outcome, state);
        return (v, None);
    }
    if depth_remaining == 0 {
        return (0, None);
    }

    let key = state.key();
    if use_tt {
        if let Some(entry) = tt.get(&key) {
            if entry.depth_remaining >= depth_remaining {
                return (entry.value, entry.best_move);
            }
        }
    }

    let moves = legal_moves(state);
    if moves.is_empty() {
        return (0, None);
    }

    let mut best_value = i8::MIN;
    let mut best_move = None;

    for mv in moves {
        let next = match apply_move(state, mv) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let (child_value, _) = negamax(
            &next,
            rules,
            depth_remaining - 1,
            -beta,
            -alpha,
            tt,
            use_tt,
            nodes,
        );
        let value = -child_value;
        if value > best_value {
            best_value = value;
            best_move = Some(mv);
        }
        if value > alpha {
            alpha = value;
        }
        if alpha >= beta {
            break;
        }
    }

    if use_tt {
        tt.insert(
            key,
            TTEntry {
                value: best_value,
                best_move,
                depth_remaining,
            },
        );
    }

    (best_value, best_move)
}

fn outcome_value(outcome: Outcome, state: &GameState) -> i8 {
    match outcome {
        Outcome::DrawEarned => 0,
        o => {
            let mover = state.to_move();
            match o.winner() {
                Some(w) if w == mover => 1,
                Some(_) => -1,
                None => 0,
            }
        }
    }
}
