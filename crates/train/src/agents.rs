//! Players the arena can load by name, including trained checkpoints.

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

impl NetAgent {
    pub fn load(path: &Path, arch: &ArchConfig, sims: u32) -> anyhow::Result<Self> {
        let mut vs = make_var_store();
        let net = AzNet::from_config(&vs.root(), arch);
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
            Some((p, h)) if h.chars().all(|c| c.is_ascii_digit() || c == 'x') => (p, h),
            _ => (rest, "128x64"),
        };
        anyhow::ensure!(!path.is_empty(), "td: needs a path");
        let hidden = crate::td::parse_hidden(hidden)?;
        return Ok(Box::new(crate::td::TdCheckpoint::load(
            Path::new(path),
            &hidden,
            crate::td::TdFeatures::MoverRelative,
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
        let arch = ArchConfig::from_name(parts.next().unwrap_or("mlp_small"))?;
        if parts.next().is_some() {
            bail!("too many ':' fields in '{spec}'");
        }
        return Ok(Box::new(NetAgent::load(Path::new(path), &arch, sims)?));
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
