use pogofish_engine::RuleSet;
use pogofish_train::net::ArchConfig;
use pogofish_train::training::{train, TrainConfig};
use std::path::PathBuf;

fn print_usage(prog: &str) {
    eprintln!("Usage: {prog} <variant> <output_dir> [arch]");
    eprintln!();
    eprintln!("  variant:    lc1-1 | lc2-30 | lc2-50 | lc3-30 | lc3-50");
    eprintln!("  output_dir: directory to write models and metrics");
    eprintln!("  arch:       mlp_tiny | mlp_small (default) | mlp_medium");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  {prog} lc1-1 models/az_lc1");
    eprintln!("  {prog} lc3-50 models/az_lc3_50 mlp_medium");
}

fn parse_ruleset(variant: &str) -> anyhow::Result<RuleSet> {
    match variant {
        "lc1-1" => Ok(RuleSet::LC1 { repetitions: 1 }),
        "lc2-30" => Ok(RuleSet::LC2 { cap: 30 }),
        "lc2-50" => Ok(RuleSet::LC2 { cap: 50 }),
        "lc3-30" => Ok(RuleSet::LC3 { cap: 30 }),
        "lc3-50" => Ok(RuleSet::LC3 { cap: 50 }),
        other => anyhow::bail!("unknown variant: '{other}'"),
    }
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let prog = args.first().map(String::as_str).unwrap_or("train");

    if args.len() < 3 {
        print_usage(prog);
        std::process::exit(1);
    }

    let variant = &args[1];
    let output_dir = PathBuf::from(&args[2]);
    let arch_name = args.get(3).map(String::as_str).unwrap_or("mlp_small");

    let rules = parse_ruleset(variant)?;
    let arch = ArchConfig::from_name(arch_name)?;

    println!("Pogofish AlphaZero Training");
    println!("  Variant:    {variant}");
    println!("  Arch:       {arch_name}");
    println!("  Output dir: {}", output_dir.display());
    println!();

    let cfg = TrainConfig { arch, output_dir, ..TrainConfig::default() };

    train(&rules, &cfg)?;
    Ok(())
}
