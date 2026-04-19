use crate::encoding::{ACTION_SIZE, STATE_SIZE};
use tch::{
    nn::{self, Module},
    Device, Tensor,
};

/// Architecture configuration for the MLP variants.
#[derive(Debug, Clone)]
pub struct ArchConfig {
    pub name: String,
    pub trunk_sizes: Vec<i64>,
    pub head_size: i64,
}

impl ArchConfig {
    pub fn mlp_tiny() -> Self {
        Self {
            name: "mlp_tiny".into(),
            trunk_sizes: vec![128, 64],
            head_size: 64,
        }
    }

    pub fn mlp_small() -> Self {
        Self {
            name: "mlp_small".into(),
            trunk_sizes: vec![256, 128],
            head_size: 128,
        }
    }

    pub fn mlp_medium() -> Self {
        Self {
            name: "mlp_medium".into(),
            trunk_sizes: vec![512, 256, 128],
            head_size: 128,
        }
    }

    /// Parse an arch name string into a config.
    pub fn from_name(name: &str) -> anyhow::Result<Self> {
        match name {
            "mlp_tiny" => Ok(Self::mlp_tiny()),
            "mlp_small" => Ok(Self::mlp_small()),
            "mlp_medium" => Ok(Self::mlp_medium()),
            other => anyhow::bail!("unknown arch: {other}"),
        }
    }
}

/// AlphaZero MLP network with a shared trunk, policy head, and value head.
pub struct AzNet {
    trunk: nn::Sequential,
    policy_head: nn::Sequential,
    value_head: nn::Sequential,
}

impl AzNet {
    /// Build a new AzNet.
    ///
    /// `trunk_sizes`: hidden layer widths for the shared trunk.
    /// `policy_head_size` / `value_head_size`: width of the respective head's hidden layer.
    pub fn new(
        vs: &nn::Path,
        trunk_sizes: &[i64],
        policy_head_size: i64,
        value_head_size: i64,
    ) -> Self {
        let mut trunk = nn::seq();
        let mut in_size = STATE_SIZE as i64;
        for (i, &out_size) in trunk_sizes.iter().enumerate() {
            trunk = trunk
                .add(nn::linear(
                    vs / format!("trunk_{i}"),
                    in_size,
                    out_size,
                    Default::default(),
                ))
                .add_fn(|x| x.relu());
            in_size = out_size;
        }

        let policy_head = nn::seq()
            .add(nn::linear(
                vs / "policy_fc1",
                in_size,
                policy_head_size,
                Default::default(),
            ))
            .add_fn(|x| x.relu())
            .add(nn::linear(
                vs / "policy_fc2",
                policy_head_size,
                ACTION_SIZE as i64,
                Default::default(),
            ));

        let value_head = nn::seq()
            .add(nn::linear(
                vs / "value_fc1",
                in_size,
                value_head_size,
                Default::default(),
            ))
            .add_fn(|x| x.relu())
            .add(nn::linear(
                vs / "value_fc2",
                value_head_size,
                1,
                Default::default(),
            ))
            .add_fn(|x| x.tanh());

        Self {
            trunk,
            policy_head,
            value_head,
        }
    }

    /// Forward pass.
    ///
    /// Returns `(policy_logits [B, ACTION_SIZE], value [B, 1])`.
    pub fn forward(&self, x: &Tensor) -> (Tensor, Tensor) {
        let h = self.trunk.forward(x);
        let policy = self.policy_head.forward(&h);
        let value = self.value_head.forward(&h);
        (policy, value)
    }

    /// Convenience: run inference on a single [STATE_SIZE] tensor.
    /// Returns `(policy_logits [ACTION_SIZE], value scalar)`.
    pub fn forward_single(&self, x: &Tensor) -> (Tensor, f32) {
        let batch = x.unsqueeze(0);
        let (policy, value) = self.forward(&batch);
        let p = policy.squeeze_dim(0);
        let v = f32::try_from(value.squeeze()).unwrap_or(0.0);
        (p, v)
    }

    /// Save the variable store to a file.
    /// Uses `Tensor::save_multi` for cross-process compatibility (avoids
    /// the TorchScript format that `VarStore::save` produces, which can't
    /// be loaded back by `VarStore::load` in tch-rs 0.17).
    pub fn save(&self, vs: &nn::VarStore, path: &std::path::Path) -> anyhow::Result<()> {
        let vars = vs.variables();
        let named: Vec<(&str, &Tensor)> = vars.iter().map(|(k, v)| (k.as_str(), v)).collect();
        Tensor::save_multi(&named, path)?;
        Ok(())
    }

    /// Load weights from a file into the variable store.
    pub fn load(&self, vs: &mut nn::VarStore, path: &std::path::Path) -> anyhow::Result<()> {
        let named = Tensor::load_multi(path)?;
        let mut var_map = vs.variables();
        for (name, tensor) in named {
            // tch-rs uses | as separator, Tensor::save_multi uses the same
            if let Some(var) = var_map.get_mut(&name) {
                tch::no_grad(|| var.copy_(&tensor));
            }
        }
        Ok(())
    }

    /// Build an AzNet from an ArchConfig and variable store.
    pub fn from_config(vs: &nn::Path, cfg: &ArchConfig) -> Self {
        Self::new(vs, &cfg.trunk_sizes, cfg.head_size, cfg.head_size)
    }
}

/// Create a fresh variable store on CPU.
pub fn make_var_store() -> nn::VarStore {
    nn::VarStore::new(Device::Cpu)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tch::{Kind, Tensor};

    fn make_net() -> (nn::VarStore, AzNet) {
        let vs = make_var_store();
        let net = AzNet::new(&vs.root(), &[64, 32], 32, 32);
        (vs, net)
    }

    #[test]
    fn forward_output_shapes() {
        let (_vs, net) = make_net();
        let x = Tensor::randn(&[4, STATE_SIZE as i64], (Kind::Float, Device::Cpu));
        let _guard = tch::no_grad_guard();
        let (policy, value) = net.forward(&x);
        assert_eq!(policy.size(), vec![4, ACTION_SIZE as i64]);
        assert_eq!(value.size(), vec![4, 1]);
    }

    #[test]
    fn forward_mlp_tiny_shapes() {
        let cfg = ArchConfig::mlp_tiny();
        let vs = make_var_store();
        let net = AzNet::from_config(&vs.root(), &cfg);
        let x = Tensor::randn(&[4, STATE_SIZE as i64], (Kind::Float, Device::Cpu));
        let _guard = tch::no_grad_guard();
        let (policy, value) = net.forward(&x);
        assert_eq!(policy.size(), vec![4, ACTION_SIZE as i64]);
        assert_eq!(value.size(), vec![4, 1]);
    }

    #[test]
    fn forward_single_shapes() {
        let (_vs, net) = make_net();
        let x = Tensor::randn(&[STATE_SIZE as i64], (Kind::Float, Device::Cpu));
        let _guard = tch::no_grad_guard();
        let (policy, value) = net.forward_single(&x);
        assert_eq!(policy.size(), vec![ACTION_SIZE as i64]);
        let _ = value; // scalar
    }

    #[test]
    fn value_bounded() {
        // tanh output must be in [-1, 1]
        let (_vs, net) = make_net();
        let x = Tensor::randn(&[16, STATE_SIZE as i64], (Kind::Float, Device::Cpu));
        let _guard = tch::no_grad_guard();
        let (_policy, value) = net.forward(&x);
        let max_val = f64::try_from(value.max()).unwrap();
        let min_val = f64::try_from(value.min()).unwrap();
        assert!(max_val <= 1.0 + 1e-5);
        assert!(min_val >= -1.0 - 1e-5);
    }

    #[test]
    fn arch_from_name_roundtrip() {
        for name in ["mlp_tiny", "mlp_small", "mlp_medium"] {
            let cfg = ArchConfig::from_name(name).unwrap();
            assert_eq!(cfg.name, name);
        }
        assert!(ArchConfig::from_name("unknown").is_err());
    }
}
