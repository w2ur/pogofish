use pogofish_train::encoding::{ACTION_SIZE, STATE_SIZE};
use pogofish_train::net::{make_var_store, ArchConfig, AzNet};
use tch::{Device, Kind, Tensor};

#[test]
fn forward_pass_shapes_4x109() {
    let vs = make_var_store();
    let net = AzNet::new(&vs.root(), &[128, 64], 64, 64);
    let x = Tensor::randn([4, STATE_SIZE as i64], (Kind::Float, Device::Cpu));
    let _guard = tch::no_grad_guard();
    let (policy, value) = net.forward(&x);
    assert_eq!(policy.size(), vec![4, ACTION_SIZE as i64], "policy shape");
    assert_eq!(value.size(), vec![4, 1], "value shape");
}

#[test]
fn forward_mlp_tiny_shapes() {
    let cfg = ArchConfig::mlp_tiny();
    let vs = make_var_store();
    let net = AzNet::from_config(&vs.root(), &cfg);
    let x = Tensor::randn([4, STATE_SIZE as i64], (Kind::Float, Device::Cpu));
    let _guard = tch::no_grad_guard();
    let (policy, value) = net.forward(&x);
    assert_eq!(policy.size(), vec![4, ACTION_SIZE as i64]);
    assert_eq!(value.size(), vec![4, 1]);
}

#[test]
fn forward_mlp_small_shapes() {
    let cfg = ArchConfig::mlp_small();
    let vs = make_var_store();
    let net = AzNet::from_config(&vs.root(), &cfg);
    let x = Tensor::randn([4, STATE_SIZE as i64], (Kind::Float, Device::Cpu));
    let _guard = tch::no_grad_guard();
    let (policy, value) = net.forward(&x);
    assert_eq!(policy.size(), vec![4, ACTION_SIZE as i64]);
    assert_eq!(value.size(), vec![4, 1]);
}

#[test]
fn value_output_bounded() {
    let vs = make_var_store();
    let net = AzNet::new(&vs.root(), &[64, 32], 32, 32);
    let x = Tensor::randn([16, STATE_SIZE as i64], (Kind::Float, Device::Cpu));
    let _guard = tch::no_grad_guard();
    let (_policy, value) = net.forward(&x);
    let max_val = f64::try_from(value.max()).unwrap();
    let min_val = f64::try_from(value.min()).unwrap();
    assert!(max_val <= 1.0 + 1e-5, "value max {max_val} should be <= 1");
    assert!(min_val >= -1.0 - 1e-5, "value min {min_val} should be >= -1");
}
