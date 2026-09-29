//! Export a trained AlphaZero net to the pure-Rust format of
//! `pogofish_infer::mlp` (plan task 6.1).

use crate::encoding::Features;
use crate::net::{ArchConfig, AzNet};
use anyhow::Context;
use pogofish_infer::mlp::{Linear, Mlp};
use std::path::Path;
use tch::nn;

fn linear(
    vars: &std::collections::HashMap<String, tch::Tensor>,
    name: &str,
) -> anyhow::Result<Linear> {
    let w = vars
        .get(&format!("{name}.weight"))
        .with_context(|| format!("{name}.weight missing"))?;
    let b = vars
        .get(&format!("{name}.bias"))
        .with_context(|| format!("{name}.bias missing"))?;
    let size = w.size();
    Ok(Linear {
        inputs: size[1] as usize,
        outputs: size[0] as usize,
        weight: Vec::<f32>::try_from(w.contiguous().view([-1]))?,
        bias: Vec::<f32>::try_from(b.contiguous().view([-1]))?,
    })
}

/// The pure-Rust copy of a libtorch net held in `vs`.
pub fn to_mlp(vs: &nn::VarStore, net: &AzNet) -> anyhow::Result<Mlp> {
    let vars = vs.variables();
    let mut trunk = Vec::new();
    while vars.contains_key(&format!("trunk_{}.weight", trunk.len())) {
        trunk.push(linear(&vars, &format!("trunk_{}", trunk.len()))?);
    }
    let mlp = Mlp {
        features: net.features(),
        trunk,
        policy: [linear(&vars, "policy_fc1")?, linear(&vars, "policy_fc2")?],
        value: [linear(&vars, "value_fc1")?, linear(&vars, "value_fc2")?],
    };
    // Round-trip through the file format, which also checks every shape.
    Mlp::from_bytes(&mlp.to_bytes())
}

/// Load a checkpoint (features and architecture from its run's config.json,
/// see `agents::run_config`) and write it as a `.pfw` file.
/// Refuses to write the file unless the copy matches the checkpoint within
/// 1e-5 on 100 positions; returns the copy and the largest difference.
pub fn export(checkpoint: &Path, out: &Path) -> anyhow::Result<(Mlp, f32)> {
    let cfg = crate::agents::run_config(checkpoint)?
        .with_context(|| format!("no config.json next to or above {}", checkpoint.display()))?;
    let features: Features = serde_json::from_value(cfg["features"].clone()).context("features")?;
    let arch = ArchConfig::from_name(cfg["arch"].as_str().context("arch")?)?;
    let mut vs = nn::VarStore::new(tch::Device::Cpu);
    let net = AzNet::from_config_with(&vs.root(), &arch, features);
    net.load(&mut vs, checkpoint)?;
    let mlp = to_mlp(&vs, &net)?;
    let worst = max_difference(&net, &mlp, 100);
    anyhow::ensure!(
        worst < 1e-5,
        "the exported net differs from the checkpoint by {worst} (limit 1e-5); not written"
    );
    std::fs::write(out, mlp.to_bytes()).with_context(|| format!("writing {}", out.display()))?;
    Ok((mlp, worst))
}

/// Largest absolute difference between the libtorch net and its pure-Rust
/// copy, over policy logits and values, on `n` positions from seeded random
/// lc1-2 playouts.
pub fn max_difference(net: &AzNet, mlp: &Mlp, n: usize) -> f32 {
    use pogofish_engine::{apply_move_under, initial_state, is_terminal, legal_moves, RuleSet};
    let rules = RuleSet::LC1 { repetitions: 2 };
    let mut rng = pogofish_search::rng::SplitMix64::new(17);
    let (mut worst, mut seen) = (0f32, 0);
    while seen < n {
        let mut s = initial_state();
        for _ in 0..40 {
            if is_terminal(&s, &rules).is_some() || seen == n {
                break;
            }
            let _g = tch::no_grad_guard();
            let (t_logits, t_value) = net.forward_single(&net.encode(&s));
            let t_logits = Vec::<f32>::try_from(t_logits).expect("f32 logits");
            let (r_logits, r_value) = mlp.forward(&mlp.features.encode(&s));
            for (a, b) in t_logits.iter().zip(&r_logits) {
                worst = worst.max((a - b).abs());
            }
            worst = worst.max((t_value - r_value).abs());
            seen += 1;
            let moves = legal_moves(&s);
            s = apply_move_under(&s, moves[rng.below(moves.len())], &rules).expect("legal");
        }
    }
    worst
}
