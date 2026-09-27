//! An interrupted TD run keeps its last completed iteration and, once
//! resumed, ends exactly where an uninterrupted run does. Own test binary:
//! the interrupt flag is process-wide.

use pogofish_train::interrupt;
use pogofish_train::td::{train_td, TdConfig, TdStop};

fn cfg(iterations: u32) -> TdConfig {
    TdConfig {
        hidden: vec![16],
        iterations,
        games_per_iteration: 4,
        eval_every: 0,
        max_plies: 300,
        ..TdConfig::default()
    }
}

#[test]
fn interrupt_then_resume() {
    let base = std::env::temp_dir().join(format!("pogofish-td-int-{}", std::process::id()));
    let (ref_dir, dir) = (base.join("ref"), base.join("run"));
    let _ = std::fs::remove_dir_all(&base);
    train_td(&cfg(4), &ref_dir).unwrap();

    train_td(&cfg(2), &dir).unwrap();
    interrupt::request();
    assert_eq!(train_td(&cfg(4), &dir).unwrap(), TdStop::Interrupted);
    let state = std::fs::read_to_string(dir.join("state.json")).unwrap();
    assert!(state.contains("\"iteration\": 2"), "{state}");
    interrupt::reset();
    assert_eq!(train_td(&cfg(4), &dir).unwrap(), TdStop::Finished);

    let load = |d: &std::path::Path| {
        let mut v = tch::Tensor::load_multi(d.join("weights.pt")).unwrap();
        v.sort_by(|a, b| a.0.cmp(&b.0));
        v
    };
    for ((n, a), (_, b)) in load(&ref_dir).iter().zip(load(&dir).iter()) {
        assert!(a.equal(b), "{n}");
    }
    let _ = std::fs::remove_dir_all(base);
}
