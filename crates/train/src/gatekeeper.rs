use crate::net::AzNet;
use pogofish_engine::{apply_move_under, initial_state, is_terminal, Color, Outcome, RuleSet};
use rand::Rng;

pub struct GatekeeperResult {
    /// Challenger's score over finished games (draws count half); 0 when no
    /// game finished. Unfinished games are not results and are left out.
    pub win_rate: f64,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    /// Games stopped by the safety limit.
    pub unfinished: u32,
}

/// Play `num_games` between `challenger` and `best`, alternating who plays White.
/// Uses neural MCTS with `temperature` for move selection (use tau=0.1 to break
/// determinism while still mostly picking the best move; tau=0.0 is fully greedy).
/// No Dirichlet noise is added.
/// Returns the challenger's win rate.
#[allow(clippy::too_many_arguments)]
pub fn gatekeeper(
    challenger: &AzNet,
    best: &AzNet,
    rules: &RuleSet,
    num_games: u32,
    num_simulations: u32,
    c_puct: f32,
    max_moves: u16,
    temperature: f32,
) -> GatekeeperResult {
    let mut wins = 0u32;
    let mut losses = 0u32;
    let mut draws = 0u32;
    let mut unfinished = 0u32;
    let mut rng = rand::thread_rng();

    for game_idx in 0..num_games {
        // Alternate sides each game: even games → challenger plays White
        let challenger_color = if game_idx % 2 == 0 {
            Color::White
        } else {
            Color::Red
        };
        let outcome = play_game_with_tau(
            challenger,
            best,
            rules,
            num_simulations,
            c_puct,
            max_moves,
            challenger_color,
            temperature,
            &mut rng,
        );
        match outcome {
            None => unfinished += 1,
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

    GatekeeperResult {
        win_rate,
        wins,
        losses,
        draws,
        unfinished,
    }
}

/// Play a single game between two nets using MCTS with the given temperature.
/// `challenger_color` determines which net plays which side.
#[allow(clippy::too_many_arguments)]
fn play_game_with_tau(
    challenger: &AzNet,
    best: &AzNet,
    rules: &RuleSet,
    num_simulations: u32,
    c_puct: f32,
    max_moves: u16,
    challenger_color: Color,
    temperature: f32,
    rng: &mut impl Rng,
) -> Option<Outcome> {
    use crate::selfplay::{neural_mcts_move_with_tau, SelfPlayConfig};
    let cfg = SelfPlayConfig {
        num_simulations,
        c_puct,
        max_moves: u16::MAX,
        dirichlet_alpha: 0.3,
        dirichlet_epsilon: 0.0, // no noise in gatekeeper
    };

    let mut state = initial_state();
    for _ in 0..max_moves {
        if let Some(outcome) = is_terminal(&state, rules) {
            return Some(outcome);
        }
        let current = state.to_move();
        let net = if current == challenger_color {
            challenger
        } else {
            best
        };
        let mv = neural_mcts_move_with_tau(net, &state, rules, &cfg, temperature, rng);
        state = apply_move_under(&state, mv, rules).expect("legal move");
    }
    is_terminal(&state, rules)
}
