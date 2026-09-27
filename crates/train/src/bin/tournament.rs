use anyhow::Context;
use pogofish_engine::{apply_move, initial_state, is_terminal, legal_moves, Color, Outcome, RuleSet};
use pogofish_train::net::{make_var_store, AzNet, ArchConfig};
use pogofish_train::selfplay::{neural_mcts_move_with_tau, SelfPlayConfig};
use rand::Rng;
use std::path::Path;

// --------------------------------------------------------------------------
// Player types
// --------------------------------------------------------------------------

enum Player {
    Random,
    Model { net: AzNet, _vs: tch::nn::VarStore },
}

impl Player {
    fn label(&self, path: &str) -> String {
        match self {
            Player::Random => "random".to_string(),
            Player::Model { .. } => path.to_string(),
        }
    }
}

fn load_player(spec: &str, arch: &ArchConfig) -> anyhow::Result<Player> {
    if spec == "random" {
        return Ok(Player::Random);
    }
    let path = Path::new(spec);
    anyhow::ensure!(path.exists(), "model file not found: {spec}");
    let mut vs = make_var_store();
    let net = AzNet::from_config(&vs.root(), arch);
    net.load(&mut vs, path)
        .with_context(|| format!("failed to load model weights from {spec}"))?;
    Ok(Player::Model { net, _vs: vs })
}

// --------------------------------------------------------------------------
// CLI parsing
// --------------------------------------------------------------------------

fn print_usage(prog: &str) {
    eprintln!("Usage: {prog} <variant> <player1> <player2> <num_games> [--sims N] [--tau T] [--arch ARCH]");
    eprintln!();
    eprintln!("  variant:    lc1-N | lc2-N | lc3-N  (e.g. lc2-15)");
    eprintln!("  player:     path/to/model.pt | \"random\"");
    eprintln!("  num_games:  total games to play (alternates sides)");
    eprintln!("  --sims N:   MCTS simulations per move (default 100)");
    eprintln!("  --tau T:    temperature (default 0.0 = greedy)");
    eprintln!("  --arch A:   mlp_tiny | mlp_small (default) | mlp_medium");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  {prog} lc2-15 models/lc2-15/model_best.pt random 200");
    eprintln!("  {prog} lc2-15 models/model_a.pt models/model_b.pt 100 --sims 200");
}

fn parse_ruleset(variant: &str) -> anyhow::Result<RuleSet> {
    let parts: Vec<&str> = variant.splitn(2, '-').collect();
    if parts.len() != 2 {
        anyhow::bail!("variant must be in format lc1-N, lc2-N, or lc3-N, got: '{variant}'");
    }
    let n: u16 = parts[1]
        .parse()
        .map_err(|_| anyhow::anyhow!("invalid number in variant: '{variant}'"))?;
    match parts[0] {
        "lc1" => Ok(RuleSet::LC1 { repetitions: n as u8 }),
        "lc2" => Ok(RuleSet::LC2 { cap: n }),
        "lc3" => Ok(RuleSet::LC3 { cap: n }),
        other => anyhow::bail!("unknown rule type: '{other}' (expected lc1, lc2, or lc3)"),
    }
}

struct Args {
    variant: String,
    player1_spec: String,
    player2_spec: String,
    num_games: u32,
    sims: u32,
    tau: f32,
    arch_name: String,
}

fn parse_args() -> anyhow::Result<Args> {
    let raw: Vec<String> = std::env::args().collect();
    let prog = raw.first().map(String::as_str).unwrap_or("tournament");

    // Require at least: <variant> <player1> <player2> <num_games>
    if raw.len() < 5 {
        print_usage(prog);
        std::process::exit(1);
    }

    let variant = raw[1].clone();
    let player1_spec = raw[2].clone();
    let player2_spec = raw[3].clone();
    let num_games: u32 = raw[4]
        .parse()
        .map_err(|_| anyhow::anyhow!("num_games must be a positive integer, got: '{}'", raw[4]))?;
    anyhow::ensure!(num_games > 0, "num_games must be > 0");

    let mut sims: u32 = 100;
    let mut tau: f32 = 0.0;
    let mut arch_name = "mlp_small".to_string();

    let mut i = 5;
    while i < raw.len() {
        match raw[i].as_str() {
            "--sims" => {
                i += 1;
                sims = raw
                    .get(i)
                    .ok_or_else(|| anyhow::anyhow!("--sims requires a value"))?
                    .parse()
                    .map_err(|_| anyhow::anyhow!("--sims value must be a positive integer"))?;
            }
            "--tau" => {
                i += 1;
                tau = raw
                    .get(i)
                    .ok_or_else(|| anyhow::anyhow!("--tau requires a value"))?
                    .parse()
                    .map_err(|_| anyhow::anyhow!("--tau value must be a float"))?;
            }
            "--arch" => {
                i += 1;
                arch_name = raw
                    .get(i)
                    .ok_or_else(|| anyhow::anyhow!("--arch requires a value"))?
                    .clone();
            }
            unknown => {
                anyhow::bail!("unknown argument: {unknown}");
            }
        }
        i += 1;
    }

    Ok(Args { variant, player1_spec, player2_spec, num_games, sims, tau, arch_name })
}

// --------------------------------------------------------------------------
// Move selection
// --------------------------------------------------------------------------

fn pick_move(
    player: &Player,
    state: &pogofish_engine::GameState,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
    tau: f32,
    rng: &mut impl Rng,
) -> pogofish_engine::Move {
    match player {
        Player::Random => {
            let moves = legal_moves(state);
            moves[rng.gen_range(0..moves.len())]
        }
        Player::Model { net, .. } => neural_mcts_move_with_tau(net, state, rules, cfg, tau, rng),
    }
}

// --------------------------------------------------------------------------
// Game result tracking
// --------------------------------------------------------------------------

struct GameResult {
    winner: Option<Color>,
}

fn play_game(
    white_player: &Player,
    red_player: &Player,
    rules: &RuleSet,
    cfg: &SelfPlayConfig,
    tau: f32,
    max_moves: u16,
    rng: &mut impl Rng,
) -> GameResult {
    let mut state = initial_state();

    for _ in 0..max_moves {
        if let Some(outcome) = is_terminal(&state, rules) {
            let winner = match outcome {
                Outcome::DrawEarned => None,
                o => o.winner(),
            };
            return GameResult { winner };
        }

        let current_player = match state.to_move() {
            Color::White => white_player,
            Color::Red => red_player,
        };
        let mv = pick_move(current_player, &state, rules, cfg, tau, rng);
        state = apply_move(&state, mv).expect("move selected by player must be legal");
    }

    // Exceeded move limit — treat as draw
    GameResult { winner: None }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

fn main() -> anyhow::Result<()> {
    let args = parse_args()?;

    let rules = parse_ruleset(&args.variant)?;
    let arch = ArchConfig::from_name(&args.arch_name)?;

    // Load players
    let player1 = load_player(&args.player1_spec, &arch)?;
    let player2 = load_player(&args.player2_spec, &arch)?;

    let player1_label = player1.label(&args.player1_spec);
    let player2_label = player2.label(&args.player2_spec);

    // Determine max moves from the variant cap
    let max_moves: u16 = match &rules {
        RuleSet::LC1 { .. } => 200,
        RuleSet::LC2 { cap } => cap.saturating_mul(2).max(200),
        RuleSet::LC3 { cap } => cap.saturating_mul(2).max(200),
    };

    let selfplay_cfg = SelfPlayConfig {
        num_simulations: args.sims,
        max_moves,
        ..SelfPlayConfig::default()
    };

    eprintln!("Tournament: {} vs {}", player1_label, player2_label);
    eprintln!("  Variant:  {}", args.variant);
    eprintln!("  Games:    {}", args.num_games);
    eprintln!("  Sims:     {}", args.sims);
    eprintln!("  Tau:      {}", args.tau);
    eprintln!("  Arch:     {}", args.arch_name);
    eprintln!();

    let mut rng = rand::thread_rng();

    // Counters
    let mut white_wins: u32 = 0;
    let mut red_wins: u32 = 0;
    let mut draws: u32 = 0;

    // Side-specific wins for each player
    let mut p1_white_wins: u32 = 0;
    let mut p1_red_wins: u32 = 0;
    let mut p2_white_wins: u32 = 0;
    let mut p2_red_wins: u32 = 0;

    for game_idx in 0..args.num_games {
        // Alternate sides: even games → player1=White, odd games → player1=Red
        let p1_is_white = game_idx % 2 == 0;

        let (white_player, red_player) =
            if p1_is_white { (&player1, &player2) } else { (&player2, &player1) };

        let result =
            play_game(white_player, red_player, &rules, &selfplay_cfg, args.tau, max_moves, &mut rng);

        match result.winner {
            None => {
                draws += 1;
            }
            Some(Color::White) => {
                white_wins += 1;
                if p1_is_white {
                    p1_white_wins += 1;
                } else {
                    p2_white_wins += 1;
                }
            }
            Some(Color::Red) => {
                red_wins += 1;
                if p1_is_white {
                    p2_red_wins += 1;
                } else {
                    p1_red_wins += 1;
                }
            }
        }

        if (game_idx + 1) % 50 == 0 {
            let done = game_idx + 1;
            let p1_wins = p1_white_wins + p1_red_wins;
            eprintln!(
                "  [{done}/{}] W={white_wins} R={red_wins} D={draws} | p1_wins={p1_wins}",
                args.num_games
            );
        }
    }

    let total = args.num_games;
    let p1_total_wins = p1_white_wins + p1_red_wins;
    let player1_win_rate = p1_total_wins as f64 / total as f64;

    let output = serde_json::json!({
        "variant": args.variant,
        "games": total,
        "player1": player1_label,
        "player2": player2_label,
        "white_wins": white_wins,
        "red_wins": red_wins,
        "draws": draws,
        "player1_as_white_wins": p1_white_wins,
        "player1_as_red_wins": p1_red_wins,
        "player2_as_white_wins": p2_white_wins,
        "player2_as_red_wins": p2_red_wins,
        "player1_win_rate": player1_win_rate,
    });

    println!("{}", serde_json::to_string_pretty(&output)?);

    Ok(())
}
