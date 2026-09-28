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

fn parse() -> anyhow::Result<app::Settings> {
    let mut human = Color::White;
    let mut sims: Option<u32> = Some(100);
    let mut two_players = false;
    let mut save_dir = std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".pogofish/games"));
    let args: Vec<String> = std::env::args().skip(1).collect();
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
                        let t =
                            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?;
                        if t.subsec_nanos() % 2 == 0 {
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
                sims = Some(match value()?.as_str() {
                    "easy" => 25,
                    "normal" => 100,
                    "hard" => 400,
                    other => bail!("--level must be easy, normal or hard, got {other}"),
                });
                i += 2;
            }
            "--sims" => {
                let n: u32 = value()?.parse().context("--sims")?;
                anyhow::ensure!(n > 0, "--sims must be positive");
                sims = Some(n);
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
    Ok(app::Settings {
        human,
        ai_sims: if two_players { None } else { sims },
        hint_sims: sims.unwrap_or(100),
        save_dir,
    })
}

fn main() -> anyhow::Result<()> {
    app::run(parse()?)
}
