use pogofish_engine::RuleSet;
use pogofish_train::net::ArchConfig;
use pogofish_train::training::{train, TrainConfig};
use std::path::PathBuf;

fn print_usage(prog: &str) {
    eprintln!("Usage: {prog} <variant> <output_dir> [arch]");
    eprintln!();
    eprintln!("  variant:    lc1-N | lc2-N | lc3-N  (e.g. lc1-1, lc2-30, lc3-99)");
    eprintln!("  output_dir: directory to write models and metrics");
    eprintln!("  arch:       mlp_tiny | mlp_small (default) | mlp_medium");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  {prog} lc1-1 models/az_lc1");
    eprintln!("  {prog} lc3-50 models/az_lc3_50 mlp_medium");
}

fn parse_ruleset(variant: &str) -> anyhow::Result<RuleSet> {
    // Parse patterns: lc1-N, lc2-N, lc3-N where N is a number
    let parts: Vec<&str> = variant.splitn(2, '-').collect();
    if parts.len() != 2 {
        anyhow::bail!("variant must be in format lc1-N, lc2-N, or lc3-N, got: '{variant}'");
    }
    let n: u16 = parts[1].parse()
        .map_err(|_| anyhow::anyhow!("invalid number in variant: '{variant}'"))?;
    match parts[0] {
        "lc1" => Ok(RuleSet::LC1 { repetitions: n as u8 }),
        "lc2" => Ok(RuleSet::LC2 { cap: n }),
        "lc3" => Ok(RuleSet::LC3 { cap: n }),
        other => anyhow::bail!("unknown rule type: '{other}' (expected lc1, lc2, or lc3)"),
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
