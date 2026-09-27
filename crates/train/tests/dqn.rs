use pogofish_engine::RuleSet;
use pogofish_train::dqn::{train_dqn, DqnConfig};
use pogofish_train::encoding::{state_to_tensor, ACTION_SIZE, STATE_SIZE};
use pogofish_train::net::make_var_store;
use pogofish_train::dqn::DqnNet;
use pogofish_engine::initial_state;
use tch::{Device, Kind, Tensor};

#[test]
fn smoke_train_completes_without_panic() {
    let output_dir = std::env::temp_dir().join(format!(
        "pogofish_dqn_smoke_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .subsec_nanos()
    ));

    let rules = RuleSet::LC2 { cap: 15 };
    let cfg = DqnConfig {
        episodes: 100,
        epsilon_start: 1.0,
        epsilon_end: 0.05,
        epsilon_decay_steps: 50,
        lr: 1e-3,
        batch_size: 16,
        replay_capacity: 200,
        target_update_interval: 10,
        gamma: 0.99,
        max_moves: 30,
        output_dir: output_dir.clone(),
    };

    train_dqn(&rules, &cfg).expect("DQN smoke training should complete without error");

    // Model should be saved at the end (episode 100 == cfg.episodes)
    assert!(
        output_dir.join("model_best.pt").exists(),
        "model_best.pt should be created after training"
    );

    let _ = std::fs::remove_dir_all(&output_dir);
}

#[test]
fn q_values_have_correct_shape() {
    let vs = make_var_store();
    let net = DqnNet::new(&vs.root(), &[64, 32], 32);
    let state = initial_state();
    let state_tensor = state_to_tensor(&state);

    assert_eq!(state_tensor.size(), vec![STATE_SIZE as i64]);

    let _guard = tch::no_grad_guard();
    let q_values = net.forward_single(&state_tensor);
    assert_eq!(q_values.size(), vec![ACTION_SIZE as i64]);
}

#[test]
fn q_values_batch_shape() {
    let vs = make_var_store();
    let net = DqnNet::new(&vs.root(), &[64, 32], 32);
    let batch = Tensor::randn([8, STATE_SIZE as i64], (Kind::Float, Device::Cpu));

    let _guard = tch::no_grad_guard();
    let q = net.forward(&batch);
    assert_eq!(q.size(), vec![8, ACTION_SIZE as i64]);
}
