//! Regression (plan task 0.6): checkpoint loaders used to copy only the
//! tensors whose names matched and skip the rest silently, so a DQN
//! checkpoint loaded as an AlphaZero net became a net with random heads.
//! Every loader must now fail on a missing or unexpected tensor name.

use pogofish_train::dqn::DqnNet;
use pogofish_train::net::{make_var_store, ArchConfig, AzNet};
use std::path::{Path, PathBuf};
use tch::Tensor;

fn tmp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("pogofish-{}-{name}.pt", std::process::id()))
}

fn save_named(path: &Path, tensors: &[(String, Tensor)]) {
    let named: Vec<(&str, &Tensor)> = tensors.iter().map(|(k, v)| (k.as_str(), v)).collect();
    Tensor::save_multi(&named, path).unwrap();
}

fn az_tensors() -> Vec<(String, Tensor)> {
    let vs = make_var_store();
    let _net = AzNet::from_config(&vs.root(), &ArchConfig::mlp_small());
    vs.variables().into_iter().collect()
}

fn load_into_az(path: &Path) -> anyhow::Result<()> {
    let mut vs = make_var_store();
    let net = AzNet::from_config(&vs.root(), &ArchConfig::mlp_small());
    net.load(&mut vs, path)
}

#[test]
fn matching_checkpoint_loads_every_weight() {
    let path = tmp_path("roundtrip");
    let src_vs = make_var_store();
    let src = AzNet::from_config(&src_vs.root(), &ArchConfig::mlp_small());
    src.save(&src_vs, &path).unwrap();

    let mut dst_vs = make_var_store();
    let dst = AzNet::from_config(&dst_vs.root(), &ArchConfig::mlp_small());
    dst.load(&mut dst_vs, &path).unwrap();

    let src_vars = src_vs.variables();
    for (name, t) in dst_vs.variables() {
        assert!(t.equal(&src_vars[&name]), "{name} differs after load");
    }
    std::fs::remove_file(path).ok();
}

#[test]
fn dqn_checkpoint_is_rejected_by_the_alphazero_loader() {
    let path = tmp_path("dqn-as-az");
    let vs = make_var_store();
    let dqn = DqnNet::new(&vs.root(), &[256, 128], 128);
    dqn.save(&vs, &path).unwrap();

    let err = load_into_az(&path).expect_err("a DQN file must not load as AzNet");
    let msg = format!("{err:#}");
    assert!(
        msg.contains("policy_fc1"),
        "names the missing tensor: {msg}"
    );
    assert!(
        msg.contains("head_fc1"),
        "names the unexpected tensor: {msg}"
    );
    std::fs::remove_file(path).ok();
}

#[test]
fn missing_tensor_is_an_error() {
    let path = tmp_path("missing");
    let mut tensors = az_tensors();
    tensors.retain(|(k, _)| !k.starts_with("value_fc2"));
    save_named(&path, &tensors);

    let msg = format!("{:#}", load_into_az(&path).expect_err("missing tensors"));
    assert!(
        msg.contains("missing") && msg.contains("value_fc2"),
        "{msg}"
    );
    std::fs::remove_file(path).ok();
}

#[test]
fn unexpected_tensor_is_an_error() {
    let path = tmp_path("unexpected");
    let mut tensors = az_tensors();
    tensors.push((
        "extra.weight".to_string(),
        Tensor::zeros([3], tch::kind::FLOAT_CPU),
    ));
    save_named(&path, &tensors);

    let msg = format!("{:#}", load_into_az(&path).expect_err("unexpected tensor"));
    assert!(
        msg.contains("unexpected") && msg.contains("extra.weight"),
        "{msg}"
    );
    std::fs::remove_file(path).ok();
}

#[test]
fn shape_mismatch_is_an_error_not_a_panic() {
    let path = tmp_path("shape");
    let vs = make_var_store();
    let tiny = AzNet::from_config(&vs.root(), &ArchConfig::mlp_tiny());
    tiny.save(&vs, &path).unwrap();

    let msg = format!(
        "{:#}",
        load_into_az(&path).expect_err("mlp_tiny into mlp_small")
    );
    assert!(msg.contains("shape"), "{msg}");
    std::fs::remove_file(path).ok();
}

#[test]
fn dqn_loader_rejects_an_alphazero_checkpoint() {
    let path = tmp_path("az-as-dqn");
    save_named(&path, &az_tensors());
    let mut vs = make_var_store();
    let dqn = DqnNet::new(&vs.root(), &[256, 128], 128);
    assert!(dqn.load(&mut vs, &path).is_err());
    std::fs::remove_file(path).ok();
}
