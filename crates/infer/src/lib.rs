//! Inference without libtorch: the network's input features, a pure-Rust
//! MLP that reads weights exported from training, and the neural MCTS that
//! both training (through libtorch) and the terminal game use.

pub mod actions;
pub mod features;
pub mod mcts;
pub mod mlp;
