mod app;
mod session;
mod ui;

use anyhow::{bail, Context};
use pogofish_engine::Color;
use std::path::PathBuf;

const USAGE: &str = "\
Pogofish — play Pogo in the terminal against the trained AlphaZero net.

Usage: pogofish [options]

  --colour white|red|random   the side you play (default white; White moves first)
  --level easy|normal|hard    AI strength: 25, 100 or 400 simulations per move (default normal)
  --sims N                    AI simulations per move (overrides --level)
  --two-players               two people at one keyboard, no AI (hints still work)
  --save-dir DIR              where finished games are saved as JSON
                              (default ~/.pogofish/games)
  --no-save                   do not save finished games
  -h, --help                  this text

Rules: lc1-2 — a player with no stack on top loses, and a position occurring for
the third time loses for the player whose move produced it.

Keys: arrows move, Enter selects, 1/2/3 piece count, Esc back, h hint,
u undo (your move and the AI's reply), Shift+R redo, q quit.";

fn parse(args: &[String]) -> anyhow::Result<app::Settings> {
    let mut human = Color::White;
    let mut level_sims = 100;
    let mut sims_override: Option<u32> = None;
    let mut two_players = false;
    let mut save_dir = std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".pogofish/games"));
    let mut i = 0;
    while i < args.len() {
        let value = || {
            args.get(i + 1)
                .with_context(|| format!("{} needs a value", args[i]))
        };
        match args[i].as_str() {
            "-h" | "--help" => {
                println!("{USAGE}");
                std::process::exit(0);
            }
            "--colour" | "--color" => {
                human = match value()?.as_str() {
                    "white" => Color::White,
                    "red" => Color::Red,
                    "random" => {
                        // RandomState is seeded from the OS; the clock's low bits are not
                        // random (macOS clocks tick in microseconds, so nanos are even).
                        use std::hash::{BuildHasher, Hasher};
                        let bits = std::collections::hash_map::RandomState::new()
                            .build_hasher()
                            .finish();
                        if bits & 1 == 0 {
                            Color::White
                        } else {
                            Color::Red
                        }
                    }
                    other => bail!("--colour must be white, red or random, got {other}"),
                };
                i += 2;
            }
            "--level" => {
                level_sims = match value()?.as_str() {
                    "easy" => 25,
                    "normal" => 100,
                    "hard" => 400,
                    other => bail!("--level must be easy, normal or hard, got {other}"),
                };
                i += 2;
            }
            "--sims" => {
                let n: u32 = value()?.parse().context("--sims")?;
                anyhow::ensure!(n > 0, "--sims must be positive");
                sims_override = Some(n);
                i += 2;
            }
            "--two-players" => {
                two_players = true;
                i += 1;
            }
            "--save-dir" => {
                save_dir = Some(PathBuf::from(value()?));
                i += 2;
            }
            "--no-save" => {
                save_dir = None;
                i += 1;
            }
            other => bail!("unknown option {other}\n\n{USAGE}"),
        }
    }
    // --sims wins over --level whatever their order.
    let sims = sims_override.unwrap_or(level_sims);
    Ok(app::Settings {
        human,
        ai_sims: if two_players { None } else { Some(sims) },
        hint_sims: sims,
        save_dir,
    })
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    app::run(parse(&args)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sims_of(args: &[&str]) -> Option<u32> {
        let args: Vec<String> = args.iter().map(|a| a.to_string()).collect();
        parse(&args).unwrap().ai_sims
    }

    #[test]
    fn sims_overrides_level_in_either_order() {
        assert_eq!(sims_of(&[]), Some(100));
        assert_eq!(sims_of(&["--level", "hard"]), Some(400));
        assert_eq!(sims_of(&["--sims", "50", "--level", "hard"]), Some(50));
        assert_eq!(sims_of(&["--level", "hard", "--sims", "50"]), Some(50));
        assert_eq!(sims_of(&["--two-players"]), None);
    }

    #[test]
    fn random_colour_picks_both_sides() {
        let args: Vec<String> = ["--colour", "random"]
            .iter()
            .map(|a| a.to_string())
            .collect();
        let mut seen = [false, false];
        for _ in 0..200 {
            seen[(parse(&args).unwrap().human == Color::Red) as usize] = true;
        }
        assert_eq!(seen, [true, true]);
    }
}
