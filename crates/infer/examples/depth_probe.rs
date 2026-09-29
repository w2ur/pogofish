//! From the initial position, the bundled net searching longer plays the
//! terminal game's "normal" AI (the same net at 100 simulations), as White
//! and as Red. Both sides are deterministic, so each pairing is one fixed
//! game; a won line is replayed (the explorer's moves only, the AI thinking
//! afresh) to check it wins again.
//!
//! cargo run --release -p pogofish-infer --example depth_probe

use pogofish_engine::{
    apply_move_under, initial_state, is_terminal, notation::move_to_notation, Color, Move, RuleSet,
};
use pogofish_infer::mcts::{search, MctsConfig};
use pogofish_infer::mlp::Mlp;

fn main() -> anyhow::Result<()> {
    let net = Mlp::from_bytes(&std::fs::read("crates/cli/assets/az-lc1-s1.pfw")?)?;
    let rules = RuleSet::LC1 { repetitions: 2 };
    let normal = MctsConfig {
        num_simulations: 100,
        ..MctsConfig::default()
    };
    for sims in [400u32, 1600, 6400] {
        let strong = MctsConfig {
            num_simulations: sims,
            ..MctsConfig::default()
        };
        for me in [Color::White, Color::Red] {
            let mut s = initial_state();
            let (mut mine, mut plies) = (Vec::<Move>::new(), 0);
            while is_terminal(&s, &rules).is_none() && plies < 1000 {
                let cfg = if s.to_move() == me { &strong } else { &normal };
                let m = search(&net, &s, &rules, cfg, None).best_move();
                if s.to_move() == me {
                    mine.push(m);
                }
                s = apply_move_under(&s, m, &rules)?;
                plies += 1;
            }
            let won = is_terminal(&s, &rules).and_then(|o| o.winner()) == Some(me);
            let replay_wins = won && {
                let mut s = initial_state();
                let mut it = mine.iter();
                while is_terminal(&s, &rules).is_none() {
                    let m = if s.to_move() == me {
                        *it.next().expect("line long enough")
                    } else {
                        search(&net, &s, &rules, &normal, None).best_move()
                    };
                    s = apply_move_under(&s, m, &rules)?;
                }
                is_terminal(&s, &rules).and_then(|o| o.winner()) == Some(me)
            };
            println!(
                "{sims} sims as {me:?}: {} in {plies} plies; replay wins: {replay_wins}\n  {}",
                if won { "won" } else { "lost or unfinished" },
                mine.iter()
                    .enumerate()
                    .map(|(i, m)| format!("{}. {}", i + 1, move_to_notation(*m)))
                    .collect::<Vec<_>>()
                    .join("  ")
            );
        }
    }
    Ok(())
}
