//! Players the arena can load by name, including trained checkpoints.

use crate::encoding::Features;
use crate::net::{make_var_store, ArchConfig, AzNet};
use crate::selfplay::{neural_mcts_greedy_move, SelfPlayConfig};
use anyhow::{bail, Context};
use pogofish_engine::{GameState, Move, RuleSet};
use pogofish_search::arena::{Agent, UniformMcts};
use pogofish_search::players::Scripted;
use pogofish_search::rng::SplitMix64;
use std::path::Path;

/// A checkpoint searched with neural MCTS: `sims` simulations per move, no
/// Dirichlet noise, most-visited move (deterministic).
pub struct NetAgent {
    label: String,
    net: AzNet,
    _vs: tch::nn::VarStore,
    cfg: SelfPlayConfig,
}

/// The `config.json` of the run a checkpoint belongs to: next to it
/// (`weights.pt`) or one level up (`checkpoints/iter_*.pt`), if any.
pub fn run_config(checkpoint: &Path) -> anyhow::Result<Option<serde_json::Value>> {
    let parent = checkpoint.parent();
    for dir in [parent, parent.and_then(Path::parent)]
        .into_iter()
        .flatten()
    {
        let f = dir.join("config.json");
        if f.exists() {
            let text =
                std::fs::read_to_string(&f).with_context(|| format!("reading {}", f.display()))?;
            return Ok(Some(
                serde_json::from_str(&text).with_context(|| format!("parsing {}", f.display()))?,
            ));
        }
    }
    Ok(None)
}

fn features_of(cfg: &Option<serde_json::Value>) -> anyhow::Result<Option<Features>> {
    match cfg.as_ref().and_then(|c| c.get("features")) {
        Some(f) => Ok(Some(
            serde_json::from_value(f.clone()).context("features in config.json")?,
        )),
        None => Ok(None),
    }
}

impl NetAgent {
    pub fn load(path: &Path, arch: &ArchConfig, sims: u32) -> anyhow::Result<Self> {
        Self::load_with(path, arch, Features::Absolute, sims)
    }

    pub fn load_with(
        path: &Path,
        arch: &ArchConfig,
        features: Features,
        sims: u32,
    ) -> anyhow::Result<Self> {
        let mut vs = make_var_store();
        let net = AzNet::from_config_with(&vs.root(), arch, features);
        net.load(&mut vs, path)
            .with_context(|| format!("loading checkpoint {}", path.display()))?;
        Ok(Self {
            label: format!("net:{}:{sims}", path.display()),
            net,
            _vs: vs,
            cfg: SelfPlayConfig {
                num_simulations: sims,
                ..SelfPlayConfig::default()
            },
        })
    }
}

impl Agent for NetAgent {
    fn name(&self) -> String {
        self.label.clone()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, _rng: &mut SplitMix64) -> Move {
        neural_mcts_greedy_move(&self.net, state, rules, &self.cfg)
    }
}

/// Build a player from its name:
/// `random`, `greedy`, `first-legal`, `mcts-uniform:SIMS`,
/// `net:PATH[:SIMS[:ARCH]]` (defaults 100 simulations, `mlp_small`),
/// or `td:PATH[:HIDDEN]` (a TD value net playing greedily; default `128x64`).
///
/// For `net:` and `td:`, the run's `config.json` (see [`run_config`]), when
/// present, supplies the input features and the architecture; an explicit
/// ARCH or HIDDEN in the spec overrides the latter. Without a config the
/// defaults are absolute features (`net:`) and mover-relative (`td:`).
pub fn agent_from_spec(spec: &str) -> anyhow::Result<Box<dyn Agent>> {
    if let Some(p) = Scripted::from_name(spec) {
        return Ok(Box::new(p));
    }
    if let Some(n) = spec.strip_prefix("mcts-uniform:") {
        let simulations = n
            .parse()
            .with_context(|| format!("simulations in '{spec}'"))?;
        return Ok(Box::new(UniformMcts { simulations }));
    }
    if let Some(rest) = spec.strip_prefix("td:") {
        let (path, hidden) = match rest.rsplit_once(':') {
            Some((p, h)) if h.chars().all(|c| c.is_ascii_digit() || c == 'x') => (p, Some(h)),
            _ => (rest, None),
        };
        anyhow::ensure!(!path.is_empty(), "td: needs a path");
        let cfg = run_config(Path::new(path))?;
        let hidden = match (hidden, cfg.as_ref().and_then(|c| c.get("hidden"))) {
            (Some(h), _) => crate::td::parse_hidden(h)?,
            (None, Some(h)) => {
                serde_json::from_value(h.clone()).context("hidden in config.json")?
            }
            (None, None) => vec![128, 64],
        };
        let features = features_of(&cfg)?.unwrap_or(Features::MoverRelative);
        return Ok(Box::new(crate::td::TdCheckpoint::load(
            Path::new(path),
            &hidden,
            features,
        )?));
    }
    if let Some(rest) = spec.strip_prefix("net:") {
        let mut parts = rest.split(':');
        let path = parts
            .next()
            .filter(|p| !p.is_empty())
            .context("net: needs a path")?;
        let sims = match parts.next() {
            Some(s) => s
                .parse()
                .with_context(|| format!("simulations in '{spec}'"))?,
            None => 100,
        };
        let explicit_arch = parts.next();
        if parts.next().is_some() {
            bail!("too many ':' fields in '{spec}'");
        }
        let cfg = run_config(Path::new(path))?;
        let arch_name = explicit_arch
            .map(str::to_string)
            .or_else(|| {
                cfg.as_ref()
                    .and_then(|c| c.get("arch")?.as_str().map(str::to_string))
            })
            .unwrap_or_else(|| "mlp_small".into());
        let arch = ArchConfig::from_name(&arch_name)?;
        let features = features_of(&cfg)?.unwrap_or(Features::Absolute);
        return Ok(Box::new(NetAgent::load_with(
            Path::new(path),
            &arch,
            features,
            sims,
        )?));
    }
    bail!("unknown player '{spec}' (random, greedy, first-legal, mcts-uniform:N, net:PATH[:SIMS[:ARCH]], td:PATH[:HIDDEN])")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn specs_parse() {
        for (spec, name) in [
            ("random", "random"),
            ("greedy", "greedy"),
            ("first-legal", "first-legal"),
            ("mcts-uniform:50", "mcts-uniform:50"),
        ] {
            assert_eq!(agent_from_spec(spec).unwrap().name(), name);
        }
        for bad in [
            "",
            "gready",
            "mcts-uniform:x",
            "net:",
            "td:",
            "td:/nonexistent.pt",
            "net:/nonexistent.pt",
        ] {
            assert!(agent_from_spec(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_saved_net_loads_and_plays_legal_moves() {
        let path = std::env::temp_dir().join(format!("pogofish-agent-{}.pt", std::process::id()));
        let vs = make_var_store();
        let net = AzNet::from_config(&vs.root(), &ArchConfig::mlp_tiny());
        net.save(&vs, &path).unwrap();
        let spec = format!("net:{}:8:mlp_tiny", path.display());
        let mut agent = agent_from_spec(&spec).unwrap();
        let s = pogofish_engine::initial_state();
        let m = agent.choose(&s, &RuleSet::Uncapped, &mut SplitMix64::new(0));
        assert!(pogofish_engine::legal_moves(&s).contains(&m));
        // The wrong architecture is refused by the strict loader.
        assert!(agent_from_spec(&format!("net:{}:8:mlp_small", path.display())).is_err());
        std::fs::remove_file(path).ok();
    }
}
