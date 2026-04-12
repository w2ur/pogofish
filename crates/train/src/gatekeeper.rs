use crate::net::AzNet;
use pogofish_engine::{apply_move, initial_state, is_terminal, Color, Outcome, RuleSet};

pub struct GatekeeperResult {
    pub win_rate: f64,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
}

/// Play `num_games` between `challenger` and `best`, alternating who plays White.
/// Uses neural MCTS with tau=0 (greedy) and no Dirichlet noise.
/// Returns the challenger's win rate.
pub fn gatekeeper(
    challenger: &AzNet,
    best: &AzNet,
    rules: &RuleSet,
    num_games: u32,
    num_simulations: u32,
    c_puct: f32,
    max_moves: u16,
) -> GatekeeperResult {
    let mut wins = 0u32;
    let mut losses = 0u32;
    let mut draws = 0u32;

    for game_idx in 0..num_games {
        // Alternate sides each game: even games → challenger plays White
        let challenger_color = if game_idx % 2 == 0 { Color::White } else { Color::Red };
        let outcome = play_greedy_game(challenger, best, rules, num_simulations, c_puct, max_moves, challenger_color);
        match outcome {
            None => draws += 1,
            Some(Outcome::DrawEarned) => draws += 1,
            Some(o) => match o.winner() {
                Some(w) if w == challenger_color => wins += 1,
                Some(_) => losses += 1,
                None => draws += 1,
            },
        }
    }

    let total = (wins + losses + draws) as f64;
    let win_rate = if total > 0.0 {
        (wins as f64 + 0.5 * draws as f64) / total
    } else {
        0.0
    };

    GatekeeperResult { win_rate, wins, losses, draws }
}

/// Play a single game between two nets using greedy (tau=0) MCTS.
/// `challenger_color` determines which net plays which side.
fn play_greedy_game(
    challenger: &AzNet,
    best: &AzNet,
    rules: &RuleSet,
    num_simulations: u32,
    c_puct: f32,
    max_moves: u16,
    challenger_color: Color,
) -> Option<Outcome> {
    let mut state = initial_state();
    for _ in 0..max_moves {
        if let Some(outcome) = is_terminal(&state, rules) {
            return Some(outcome);
        }
        let current = state.to_move();
        let net = if current == challenger_color { challenger } else { best };
        let mv = greedy_mcts_move(net, &state, rules, num_simulations, c_puct);
        state = apply_move(&state, mv).expect("legal move");
    }
    is_terminal(&state, rules)
}

/// Run MCTS with the given net and return the most-visited move.
fn greedy_mcts_move(
    net: &AzNet,
    state: &pogofish_engine::GameState,
    rules: &RuleSet,
    num_simulations: u32,
    c_puct: f32,
) -> pogofish_engine::Move {
    use crate::selfplay::SelfPlayConfig;
    let cfg = SelfPlayConfig {
        num_simulations,
        c_puct,
        max_moves: u16::MAX,
        dirichlet_alpha: 0.3,
        dirichlet_epsilon: 0.0, // no noise
    };
    // Reuse the neural MCTS from selfplay
    use crate::selfplay::neural_mcts_greedy_move;
    neural_mcts_greedy_move(net, state, rules, &cfg)
}
