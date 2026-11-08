//! A pure-Rust forward pass for the TD(λ) value net (ReLU hidden layers, a
//! single tanh output), reading weights exported from training (`.pfv`
//! files).
//!
//! File format: the line `PFV1`, one line of JSON describing the net
//! (`mlp::Header`: the features, then every layer's name and shape), then
//! every layer's weights and biases as little-endian f32, in header order.
//! Layers are `td_fc0`, `td_fc1`, … and `td_out`; a linear layer's weights
//! are stored as in PyTorch: `out` rows of `in`.

use crate::features::Features;
use crate::mlp::{Header, LayerShape, Linear};
use anyhow::{ensure, Context};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct ValueMlp {
    pub features: Features,
    /// Hidden layers (ReLU), then the output layer (one unit, tanh), last.
    pub layers: Vec<Linear>,
}

impl ValueMlp {
    /// V(s) in [−1, 1] for the player to move, from an encoded position.
    pub fn forward(&self, input: &[f32]) -> f32 {
        let mut h = input.to_vec();
        let last = self.layers.len() - 1;
        for (i, layer) in self.layers.iter().enumerate() {
            h = layer.apply(&h);
            if i < last {
                h.iter_mut().for_each(|x| *x = x.max(0.0));
            }
        }
        h[0].tanh()
    }

    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let bytes = std::fs::read(path).with_context(|| format!("reading {}", path.display()))?;
        Self::from_bytes(&bytes).with_context(|| format!("loading {}", path.display()))
    }

    pub fn header(&self) -> Header {
        let last = self.layers.len() - 1;
        let layers = self
            .layers
            .iter()
            .enumerate()
            .map(|(i, l)| LayerShape {
                name: if i == last {
                    "td_out".into()
                } else {
                    format!("td_fc{i}")
                },
                inputs: l.inputs,
                outputs: l.outputs,
            })
            .collect();
        Header {
            features: self.features,
            layers,
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = b"PFV1\n".to_vec();
        out.extend(
            serde_json::to_string(&self.header())
                .expect("header")
                .as_bytes(),
        );
        out.push(b'\n');
        for l in &self.layers {
            for x in l.weight.iter().chain(&l.bias) {
                out.extend(x.to_le_bytes());
            }
        }
        out
    }

    pub fn from_bytes(bytes: &[u8]) -> anyhow::Result<Self> {
        let rest = bytes
            .strip_prefix(b"PFV1\n")
            .context("not a Pogofish value-net file (PFV1)")?;
        let nl = rest
            .iter()
            .position(|&b| b == b'\n')
            .context("truncated header")?;
        let header: Header = serde_json::from_slice(&rest[..nl]).context("bad header")?;
        let mut data = &rest[nl + 1..];
        let mut layers = Vec::new();
        for s in &header.layers {
            let n = s.outputs * s.inputs + s.outputs;
            ensure!(data.len() >= n * 4, "value file truncated in {}", s.name);
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
        ensure!(!layers.is_empty(), "no layers");
        let names: Vec<String> = (0..layers.len() - 1)
            .map(|i| format!("td_fc{i}"))
            .chain(["td_out".to_string()])
            .collect();
        let got: Vec<&str> = header.layers.iter().map(|l| l.name.as_str()).collect();
        ensure!(got == names, "unexpected layer names {got:?}");
        let net = ValueMlp {
            features: header.features,
            layers,
        };
        net.check_shapes()?;
        Ok(net)
    }

    fn check_shapes(&self) -> anyhow::Result<()> {
        let mut width = self.features.size();
        for (i, l) in self.layers.iter().enumerate() {
            ensure!(
                l.inputs == width,
                "layer {i} takes {} inputs, expected {width}",
                l.inputs
            );
            width = l.outputs;
        }
        ensure!(
            width == 1,
            "the output layer must have one unit, has {width}"
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

    fn net() -> ValueMlp {
        let f = Features::MoverRelativeRepetition;
        ValueMlp {
            features: f,
            layers: vec![layer(f.size(), 8, 1.0), layer(8, 4, 2.0), layer(4, 1, 3.0)],
        }
    }

    #[test]
    fn bytes_round_trip() {
        let a = net();
        let b = ValueMlp::from_bytes(&a.to_bytes()).unwrap();
        let x = a.features.encode(&pogofish_engine::initial_state());
        assert_eq!(a.forward(&x), b.forward(&x));
        assert_eq!(b.features, a.features);
    }

    #[test]
    fn forward_is_relu_hidden_then_tanh() {
        // One hidden unit (x0 - x1), then 2 * hidden + 0.5 through tanh.
        let f = Features::Absolute;
        let mut hidden = Linear {
            inputs: f.size(),
            outputs: 1,
            weight: vec![0.0; f.size()],
            bias: vec![0.0],
        };
        hidden.weight[0] = 1.0;
        let out = Linear {
            inputs: 1,
            outputs: 1,
            weight: vec![2.0],
            bias: vec![0.5],
        };
        let net = ValueMlp {
            features: f,
            layers: vec![hidden, out],
        };
        let mut x = vec![0.0; f.size()];
        x[0] = 0.25;
        assert_eq!(net.forward(&x), 1.0f32.tanh());
        x[0] = -3.0; // the ReLU clips the hidden unit to 0
        assert_eq!(net.forward(&x), 0.5f32.tanh());
    }

    #[test]
    fn corrupt_files_are_refused() {
        let bytes = net().to_bytes();
        assert!(
            ValueMlp::from_bytes(&bytes[..bytes.len() - 4]).is_err(),
            "truncated"
        );
        let mut extra = bytes.clone();
        extra.extend([0, 0, 0, 0]);
        assert!(ValueMlp::from_bytes(&extra).is_err(), "trailing bytes");
        assert!(ValueMlp::from_bytes(b"nope").is_err());
        let mut policy_file = bytes.clone();
        policy_file[..5].copy_from_slice(b"PFW1\n");
        assert!(ValueMlp::from_bytes(&policy_file).is_err(), "wrong magic");
    }
}
