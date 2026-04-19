//! Analyze a trained AlphaZero model to surface emergent strategy patterns.
//!
//! Outputs JSON consumed by the web app's "what the AI learned" scene.

use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: analyze <model-dir> <output-json> [num-games]");
        eprintln!();
        eprintln!("  model-dir:   directory containing model_best.pt (e.g. models/lc3-29)");
        eprintln!("  output-json: target path for the insights payload");
        eprintln!("  num-games:   number of self-play games to sweep (default 500)");
        return ExitCode::from(1);
    }
    let model_dir = PathBuf::from(&args[1]);
    let output = PathBuf::from(&args[2]);
    let num_games: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(500);

    match pogofish_train::analyze::run(&model_dir, &output, num_games) {
        Ok(()) => {
            println!("wrote {}", output.display());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("analyze failed: {e:#}");
            ExitCode::from(2)
        }
    }
}
