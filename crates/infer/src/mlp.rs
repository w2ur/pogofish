//! A pure-Rust forward pass for the AlphaZero MLP (trunk, policy head,
//! value head), reading weights exported from training (`.pfw` files).
//!
//! File format: the line `PFW1`, one line of JSON describing the net, then
//! every layer's weights and biases as little-endian f32, in header order.
//! A linear layer's weights are stored as in PyTorch: `out` rows of `in`.

use crate::actions::ACTION_SIZE;
use crate::features::Features;
use anyhow::{bail, ensure, Context};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Header {
    pub features: Features,
    /// Layers in file order: trunk layers, then policy_fc1, policy_fc2,
    /// value_fc1, value_fc2.
    pub layers: Vec<LayerShape>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayerShape {
    pub name: String,
    pub inputs: usize,
    pub outputs: usize,
}

#[derive(Debug, Clone)]
pub struct Linear {
    pub inputs: usize,
    pub outputs: usize,
    /// `outputs` rows of `inputs` values.
    pub weight: Vec<f32>,
    pub bias: Vec<f32>,
}

impl Linear {
    fn apply(&self, x: &[f32]) -> Vec<f32> {
        (0..self.outputs)
            .map(|o| {
                let row = &self.weight[o * self.inputs..(o + 1) * self.inputs];
                self.bias[o] + row.iter().zip(x).map(|(w, v)| w * v).sum::<f32>()
            })
            .collect()
    }
}

fn relu(mut v: Vec<f32>) -> Vec<f32> {
    v.iter_mut().for_each(|x| *x = x.max(0.0));
    v
}

#[derive(Debug, Clone)]
pub struct Mlp {
    pub features: Features,
    pub trunk: Vec<Linear>,
    pub policy: [Linear; 2],
    pub value: [Linear; 2],
}

impl Mlp {
    /// Policy logits over the 243 actions, and the value in [−1, 1] for the
    /// player to move.
    pub fn forward(&self, input: &[f32]) -> (Vec<f32>, f32) {
        let mut h = input.to_vec();
        for layer in &self.trunk {
            h = relu(layer.apply(&h));
        }
        let logits = self.policy[1].apply(&relu(self.policy[0].apply(&h)));
        let v = self.value[1].apply(&relu(self.value[0].apply(&h)))[0].tanh();
        (logits, v)
    }

    pub fn header(&self) -> Header {
        let shape = |name: &str, l: &Linear| LayerShape {
            name: name.into(),
            inputs: l.inputs,
            outputs: l.outputs,
        };
        let mut layers: Vec<LayerShape> = self
            .trunk
            .iter()
            .enumerate()
            .map(|(i, l)| shape(&format!("trunk_{i}"), l))
            .collect();
        layers.push(shape("policy_fc1", &self.policy[0]));
        layers.push(shape("policy_fc2", &self.policy[1]));
        layers.push(shape("value_fc1", &self.value[0]));
        layers.push(shape("value_fc2", &self.value[1]));
        Header {
            features: self.features,
            layers,
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = b"PFW1\n".to_vec();
        out.extend(
            serde_json::to_string(&self.header())
                .expect("header")
                .as_bytes(),
        );
        out.push(b'\n');
        let all = self
            .trunk
            .iter()
            .chain(self.policy.iter())
            .chain(self.value.iter());
        for l in all {
            for x in l.weight.iter().chain(&l.bias) {
                out.extend(x.to_le_bytes());
            }
        }
        out
    }

    pub fn from_bytes(bytes: &[u8]) -> anyhow::Result<Self> {
        let rest = bytes
            .strip_prefix(b"PFW1\n")
            .context("not a Pogofish weights file (PFW1)")?;
        let nl = rest
            .iter()
            .position(|&b| b == b'\n')
            .context("truncated header")?;
        let header: Header = serde_json::from_slice(&rest[..nl]).context("bad header")?;
        let mut data = &rest[nl + 1..];
        let mut layers = Vec::new();
        for s in &header.layers {
            let n = s.outputs * s.inputs + s.outputs;
            ensure!(data.len() >= n * 4, "weights file truncated in {}", s.name);
            let vals: Vec<f32> = data[..n * 4]
                .chunks_exact(4)
                .map(|c| f32::from_le_bytes(c.try_into().expect("4 bytes")))
                .collect();
            data = &data[n * 4..];
            let (w, b) = vals.split_at(s.outputs * s.inputs);
            layers.push(Linear {
                inputs: s.inputs,
                outputs: s.outputs,
                weight: w.to_vec(),
                bias: b.to_vec(),
            });
        }
        ensure!(
            data.is_empty(),
            "{} unexpected bytes after the last layer",
            data.len()
        );
        ensure!(
            layers.len() >= 5,
            "need at least one trunk layer and four head layers"
        );
        let names: Vec<&str> = header.layers.iter().map(|l| l.name.as_str()).collect();
        let heads = &names[names.len() - 4..];
        if heads != ["policy_fc1", "policy_fc2", "value_fc1", "value_fc2"] {
            bail!("unexpected layer order {names:?}");
        }
        let value2 = layers.pop().expect("len");
        let value1 = layers.pop().expect("len");
        let policy2 = layers.pop().expect("len");
        let policy1 = layers.pop().expect("len");
        let mlp = Mlp {
            features: header.features,
            trunk: layers,
            policy: [policy1, policy2],
            value: [value1, value2],
        };
        mlp.check_shapes()?;
        Ok(mlp)
    }

    fn check_shapes(&self) -> anyhow::Result<()> {
        let mut width = self.features.size();
        for (i, l) in self.trunk.iter().enumerate() {
            ensure!(
                l.inputs == width,
                "trunk_{i} takes {} inputs, expected {width}",
                l.inputs
            );
            width = l.outputs;
        }
        ensure!(
            self.policy[0].inputs == width && self.value[0].inputs == width,
            "heads do not match the trunk"
        );
        ensure!(
            self.policy[1].inputs == self.policy[0].outputs
                && self.policy[1].outputs == ACTION_SIZE,
            "policy head shape"
        );
        ensure!(
            self.value[1].inputs == self.value[0].outputs && self.value[1].outputs == 1,
            "value head shape"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layer(inputs: usize, outputs: usize, seed: f32) -> Linear {
        Linear {
            inputs,
            outputs,
            weight: (0..inputs * outputs)
                .map(|i| ((i as f32 * 0.37 + seed).sin()) * 0.1)
                .collect(),
            bias: (0..outputs)
                .map(|i| (i as f32 + seed).cos() * 0.1)
                .collect(),
        }
    }

    fn net() -> Mlp {
        let f = Features::MoverRelativeRepetition;
        Mlp {
            features: f,
            trunk: vec![layer(f.size(), 8, 1.0), layer(8, 6, 2.0)],
            policy: [layer(6, 5, 3.0), layer(5, ACTION_SIZE, 4.0)],
            value: [layer(6, 4, 5.0), layer(4, 1, 6.0)],
        }
    }

    #[test]
    fn bytes_round_trip() {
        let a = net();
        let b = Mlp::from_bytes(&a.to_bytes()).unwrap();
        let x = a.features.encode(&pogofish_engine::initial_state());
        assert_eq!(a.forward(&x), b.forward(&x));
    }

    #[test]
    fn corrupt_files_are_refused() {
        let bytes = net().to_bytes();
        assert!(
            Mlp::from_bytes(&bytes[..bytes.len() - 4]).is_err(),
            "truncated"
        );
        let mut extra = bytes.clone();
        extra.extend([0, 0, 0, 0]);
        assert!(Mlp::from_bytes(&extra).is_err(), "trailing bytes");
        assert!(Mlp::from_bytes(b"nope").is_err());
    }

    #[test]
    fn linear_is_x_times_w_transposed_plus_b() {
        let l = Linear {
            inputs: 2,
            outputs: 2,
            weight: vec![1.0, 2.0, 3.0, 4.0],
            bias: vec![0.5, -0.5],
        };
        assert_eq!(l.apply(&[1.0, 1.0]), vec![3.5, 6.5]);
    }
}
