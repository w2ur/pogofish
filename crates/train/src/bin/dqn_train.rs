use pogofish_engine::RuleSet;
use pogofish_train::dqn::{train_dqn, DqnConfig};
use std::path::PathBuf;

fn print_usage(prog: &str) {
    eprintln!("Usage: {prog} <variant> <output_dir> [episodes]");
    eprintln!();
    eprintln!("  variant:    uncapped | lc1-N | lc2-N | lc3-N  (e.g. lc1-1, lc2-15, lc3-99)");
    eprintln!("  output_dir: directory to write model and metrics");
    eprintln!("  episodes:   number of training episodes (default: 200000)");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  {prog} lc2-15 models/lc2-15/dqn");
    eprintln!("  {prog} lc2-15 models/lc2-15/dqn 50000");
}

fn parse_ruleset(variant: &str) -> anyhow::Result<RuleSet> {
    variant.parse().map_err(anyhow::Error::msg)
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let prog = args.first().map(String::as_str).unwrap_or("dqn_train");

    if args.len() < 3 {
        print_usage(prog);
        std::process::exit(1);
    }

    let variant = &args[1];
    let output_dir = PathBuf::from(&args[2]);
    let episodes: u32 = args
        .get(3)
        .map(|s| s.parse::<u32>())
        .transpose()
        .map_err(|_| anyhow::anyhow!("episodes must be a positive integer"))?
        .unwrap_or(200_000);

    let rules = parse_ruleset(variant)?;

    println!("Pogofish DQN Training");
    println!("  Variant:    {variant}");
    println!("  Episodes:   {episodes}");
    println!("  Output dir: {}", output_dir.display());
    println!();

    let cfg = DqnConfig { episodes, output_dir, ..DqnConfig::default() };

    train_dqn(&rules, &cfg)?;
    Ok(())
}
