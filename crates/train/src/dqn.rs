use crate::encoding::{legal_move_mask, move_to_index, state_to_tensor, ACTION_SIZE, STATE_SIZE};
use crate::metrics::append_metrics;
use crate::net::make_var_store;
use anyhow::Context;
use pogofish_engine::{apply_move, initial_state, is_terminal, legal_moves, Outcome, RuleSet};
use rand::Rng;
use std::collections::VecDeque;
use std::path::PathBuf;
use tch::{
    nn::{self, Module, OptimizerConfig},
    Device, Kind, Tensor,
};

// --------------------------------------------------------------------------
// Network
// --------------------------------------------------------------------------

/// Single-head Q-network: state [STATE_SIZE] → Q-values [ACTION_SIZE].
pub struct DqnNet {
    trunk: nn::Sequential,
    head: nn::Sequential,
}

impl DqnNet {
    /// Build a new DqnNet.
    ///
    /// `trunk_sizes`: hidden layer widths for the shared trunk.
    /// `head_size`: width of the head's hidden layer.
    pub fn new(vs: &nn::Path, trunk_sizes: &[i64], head_size: i64) -> Self {
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

        let head = nn::seq()
            .add(nn::linear(
                vs / "head_fc1",
                in_size,
                head_size,
                Default::default(),
            ))
            .add_fn(|x| x.relu())
            .add(nn::linear(
                vs / "head_fc2",
                head_size,
                ACTION_SIZE as i64,
                Default::default(),
            ));

        Self { trunk, head }
    }

    /// Forward pass. Returns [B, ACTION_SIZE] Q-values.
    pub fn forward(&self, x: &Tensor) -> Tensor {
        let h = self.trunk.forward(x);
        self.head.forward(&h)
    }

    /// Convenience: run inference on a single [STATE_SIZE] tensor.
    /// Returns [ACTION_SIZE] Q-values.
    pub fn forward_single(&self, x: &Tensor) -> Tensor {
        let batch = x.unsqueeze(0);
        let q = self.forward(&batch);
        q.squeeze_dim(0)
    }

    /// Save the variable store to a file (cross-process compatible).
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
            if let Some(var) = var_map.get_mut(&name) {
                tch::no_grad(|| var.copy_(&tensor));
            }
        }
        Ok(())
    }
}

// --------------------------------------------------------------------------
// Replay buffer
// --------------------------------------------------------------------------

struct Transition {
    state: Tensor,
    action_idx: usize,
    reward: f32,
    next_state: Tensor,
    done: bool,
}

struct ReplayBuffer {
    buffer: VecDeque<Transition>,
    capacity: usize,
}

impl ReplayBuffer {
    fn new(capacity: usize) -> Self {
        Self {
            buffer: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    fn push(&mut self, t: Transition) {
        if self.buffer.len() >= self.capacity {
            self.buffer.pop_front();
        }
        self.buffer.push_back(t);
    }

    fn len(&self) -> usize {
        self.buffer.len()
    }

    /// Sample a mini-batch of indices without replacement.
    fn sample_indices(&self, batch_size: usize, rng: &mut impl Rng) -> Vec<usize> {
        let n = self.buffer.len();
        let mut indices: Vec<usize> = (0..n).collect();
        // Partial Fisher-Yates shuffle for batch_size elements
        for i in 0..batch_size.min(n) {
            let j = rng.gen_range(i..n);
            indices.swap(i, j);
        }
        indices.truncate(batch_size);
        indices
    }

    /// Build batched tensors from a list of buffer indices.
    fn batch(&self, indices: &[usize]) -> (Tensor, Vec<usize>, Vec<f32>, Tensor, Vec<bool>) {
        let mut states = Vec::with_capacity(indices.len());
        let mut actions = Vec::with_capacity(indices.len());
        let mut rewards = Vec::with_capacity(indices.len());
        let mut next_states = Vec::with_capacity(indices.len());
        let mut dones = Vec::with_capacity(indices.len());

        for &i in indices {
            let t = &self.buffer[i];
            states.push(t.state.shallow_clone());
            actions.push(t.action_idx);
            rewards.push(t.reward);
            next_states.push(t.next_state.shallow_clone());
            dones.push(t.done);
        }

        let states_t = Tensor::stack(&states, 0).to_kind(Kind::Float);
        let next_states_t = Tensor::stack(&next_states, 0).to_kind(Kind::Float);

        (states_t, actions, rewards, next_states_t, dones)
    }
}

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------

/// Configuration for DQN training.
pub struct DqnConfig {
    pub episodes: u32,
    pub epsilon_start: f32,
    pub epsilon_end: f32,
    pub epsilon_decay_steps: u32,
    pub lr: f64,
    pub batch_size: usize,
    pub replay_capacity: usize,
    pub target_update_interval: u32,
    pub gamma: f32,
    pub max_moves: u16,
    pub output_dir: PathBuf,
}

impl Default for DqnConfig {
    fn default() -> Self {
        Self {
            episodes: 200_000,
            epsilon_start: 1.0,
            epsilon_end: 0.05,
            epsilon_decay_steps: 50_000,
            lr: 1e-3,
            batch_size: 256,
            replay_capacity: 50_000,
            target_update_interval: 500,
            gamma: 0.99,
            max_moves: 200,
            output_dir: PathBuf::from("models/dqn"),
        }
    }
}

// --------------------------------------------------------------------------
// Training loop
// --------------------------------------------------------------------------

/// Train DQN via epsilon-greedy self-play with experience replay.
///
/// Both sides of the game use the same Q-network. Each transition is stored
/// from the mover's perspective. At the end of a game the terminal reward
/// is assigned retroactively to the last transition.
pub fn train_dqn(rules: &RuleSet, cfg: &DqnConfig) -> anyhow::Result<()> {
    std::fs::create_dir_all(&cfg.output_dir)
        .with_context(|| format!("creating output dir: {}", cfg.output_dir.display()))?;

    let metrics_path = cfg.output_dir.join("metrics.jsonl");
    let best_path = cfg.output_dir.join("model_best.pt");

    // --- Online (trained) network ---
    let q_vs = make_var_store();
    let q_net = DqnNet::new(&q_vs.root(), &[256, 128], 128);

    // --- Target (frozen copy) network ---
    let mut target_vs = make_var_store();
    let target_net = DqnNet::new(&target_vs.root(), &[256, 128], 128);
    target_vs
        .copy(&q_vs)
        .context("initialising target network")?;

    let mut opt = nn::Adam::default().build(&q_vs, cfg.lr)?;

    let mut replay = ReplayBuffer::new(cfg.replay_capacity);
    let mut rng = rand::thread_rng();

    let mut total_loss_window = 0f64;
    let mut loss_steps_window = 0u32;
    let report_interval = 1000u32;
    let save_interval = 10_000u32;

    for episode in 1..=cfg.episodes {
        // Linear epsilon decay
        let epsilon = {
            let t =
                (episode - 1).min(cfg.epsilon_decay_steps) as f32 / cfg.epsilon_decay_steps as f32;
            cfg.epsilon_start + (cfg.epsilon_end - cfg.epsilon_start) * t
        };

        let mut state = initial_state();
        // We track the previous transition so we can assign a non-zero reward
        // when the game ends. Format: (state_tensor, action_idx).
        let mut prev: Option<(Tensor, usize)> = None;

        for _move_num in 0..cfg.max_moves {
            if let Some(outcome) = is_terminal(&state, rules) {
                // Assign terminal reward to the previous transition (the move
                // that caused this terminal) and push it to the replay buffer.
                if let Some((prev_state, prev_action)) = prev.take() {
                    // The player who made the last move won or lost.
                    // is_terminal returns the outcome from the perspective of
                    // the *current* state's to_move (the player who did NOT
                    // just move). We negate for the mover's perspective.
                    let reward = terminal_reward_for_mover(outcome);
                    // next state is terminal; we use a zero tensor as a placeholder
                    let zero_next = Tensor::zeros(&[STATE_SIZE as i64], (Kind::Float, Device::Cpu));
                    replay.push(Transition {
                        state: prev_state,
                        action_idx: prev_action,
                        reward,
                        next_state: zero_next,
                        done: true,
                    });
                }
                break;
            }

            let moves = legal_moves(&state);
            if moves.is_empty() {
                break;
            }

            let state_tensor = state_to_tensor(&state);

            // If there was a previous transition (not yet terminal), push it
            // with reward=0 and next_state = current state from mover's view.
            if let Some((prev_state, prev_action)) = prev.take() {
                // The previous mover's next state is the current state
                // (from that mover's perspective: the board after their move,
                // before the opponent moved, is not directly available).
                // We use the current state tensor as an approximation — this is
                // standard for two-player zero-sum DQN with a shared network.
                replay.push(Transition {
                    state: prev_state,
                    action_idx: prev_action,
                    reward: 0.0,
                    next_state: state_tensor.shallow_clone(),
                    done: false,
                });
            }

            // Epsilon-greedy action selection
            let action_idx = if rng.gen::<f32>() < epsilon {
                let mv = moves[rng.gen_range(0..moves.len())];
                move_to_index(&mv)
            } else {
                let mask = legal_move_mask(&state);
                let _guard = tch::no_grad_guard();
                let q_values = q_net.forward_single(&state_tensor);
                // Mask illegal actions with -infinity
                let masked = q_values + (mask - 1.0) * 1e9_f64;
                i64::try_from(masked.argmax(0, false)).unwrap_or(0) as usize
            };

            prev = Some((state_tensor, action_idx));

            let chosen_move = moves
                .iter()
                .find(|m| move_to_index(m) == action_idx)
                .copied()
                .unwrap_or_else(|| moves[0]);

            state = apply_move(&state, chosen_move).expect("epsilon-greedy move is legal");
        }

        // If game hit move limit (no terminal), push last transition with reward=0
        if let Some((prev_state, prev_action)) = prev.take() {
            let next_state = state_to_tensor(&state);
            replay.push(Transition {
                state: prev_state,
                action_idx: prev_action,
                reward: 0.0,
                next_state,
                done: false,
            });
        }

        // --- Training step ---
        if replay.len() >= cfg.batch_size {
            let indices = replay.sample_indices(cfg.batch_size, &mut rng);
            let (states_t, actions, rewards, next_states_t, dones) = replay.batch(&indices);

            // TD target: r + gamma * max_a Q_target(s', a)  (0 if terminal)
            let td_targets: Vec<f32> = {
                let _guard = tch::no_grad_guard();
                let q_next = target_net.forward(&next_states_t);
                let max_q_next: Vec<f32> = q_next.max_dim(1, false).0.try_into().unwrap();
                rewards
                    .iter()
                    .zip(max_q_next.iter())
                    .zip(dones.iter())
                    .map(
                        |((&r, &max_q), &done)| {
                            if done {
                                r
                            } else {
                                r + cfg.gamma * max_q
                            }
                        },
                    )
                    .collect()
            };
            let targets_t = Tensor::from_slice(&td_targets).to_kind(Kind::Float);

            // Q(s, a) for the taken actions
            let q_all = q_net.forward(&states_t);
            let action_indices_t =
                Tensor::from_slice(&actions.iter().map(|&a| a as i64).collect::<Vec<_>>())
                    .to_device(Device::Cpu);
            let q_taken = q_all
                .gather(1, &action_indices_t.unsqueeze(1), false)
                .squeeze_dim(1);

            let loss = (q_taken - targets_t).pow_tensor_scalar(2).mean(Kind::Float);
            opt.backward_step(&loss);

            total_loss_window += f64::try_from(loss.detach()).unwrap_or(0.0);
            loss_steps_window += 1;
        }

        // --- Target network update ---
        if episode % cfg.target_update_interval == 0 {
            target_vs.copy(&q_vs).context("updating target network")?;
        }

        // --- Periodic metrics ---
        if episode % report_interval == 0 {
            let avg_loss = if loss_steps_window > 0 {
                total_loss_window / loss_steps_window as f64
            } else {
                0.0
            };

            println!(
                "[ep {episode:>7}] epsilon={epsilon:.3}  avg_loss={avg_loss:.4}  replay={}/{}",
                replay.len(),
                cfg.replay_capacity,
            );

            let entry = serde_json::json!({
                "episode": episode,
                "epsilon": (epsilon * 1000.0).round() / 1000.0,
                "avg_loss": (avg_loss * 10000.0).round() / 10000.0,
                "replay_size": replay.len(),
            });
            append_metrics(&metrics_path, &entry).context("writing metrics")?;

            total_loss_window = 0.0;
            loss_steps_window = 0;
        }

        // --- Periodic model save ---
        if episode % save_interval == 0 || episode == cfg.episodes {
            q_net.save(&q_vs, &best_path).context("saving model")?;
            println!(
                "  Saved model at episode {episode} → {}",
                best_path.display()
            );
        }
    }

    println!(
        "DQN training complete. Model saved to {}",
        best_path.display()
    );
    Ok(())
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/// Reward from the perspective of the player who just moved (the mover).
///
/// `is_terminal` is called on the resulting state, which is from the *next*
/// player's perspective. If the outcome has a winner, the player who just
/// moved (the opponent of the current to_move) wins → reward +1; losing → -1.
/// Draws → 0.
fn terminal_reward_for_mover(outcome: Outcome) -> f32 {
    match outcome {
        Outcome::DrawEarned => 0.0,
        o => match o.winner() {
            // If there is a winner, it's the player who made the last move
            // (the one whose turn it was before the terminal check).
            // The mover is the winner → +1.
            Some(_) => 1.0,
            None => 0.0,
        },
    }
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tch::{Device, Kind, Tensor};

    fn make_net() -> (nn::VarStore, DqnNet) {
        let vs = make_var_store();
        let net = DqnNet::new(&vs.root(), &[64, 32], 32);
        (vs, net)
    }

    #[test]
    fn forward_output_shape() {
        let (_vs, net) = make_net();
        let x = Tensor::randn(&[4, STATE_SIZE as i64], (Kind::Float, Device::Cpu));
        let _guard = tch::no_grad_guard();
        let q = net.forward(&x);
        assert_eq!(q.size(), vec![4, ACTION_SIZE as i64]);
    }

    #[test]
    fn forward_single_output_shape() {
        let (_vs, net) = make_net();
        let x = Tensor::randn(&[STATE_SIZE as i64], (Kind::Float, Device::Cpu));
        let _guard = tch::no_grad_guard();
        let q = net.forward_single(&x);
        assert_eq!(q.size(), vec![ACTION_SIZE as i64]);
    }

    #[test]
    fn replay_buffer_capacity() {
        let mut buf = ReplayBuffer::new(3);
        for i in 0..5 {
            buf.push(Transition {
                state: Tensor::zeros(&[STATE_SIZE as i64], (Kind::Float, Device::Cpu)),
                action_idx: i,
                reward: 0.0,
                next_state: Tensor::zeros(&[STATE_SIZE as i64], (Kind::Float, Device::Cpu)),
                done: false,
            });
        }
        assert_eq!(buf.len(), 3, "buffer should not exceed capacity");
    }

    #[test]
    fn replay_buffer_sample_indices_bounded() {
        let mut buf = ReplayBuffer::new(100);
        let mut rng = rand::thread_rng();
        for _ in 0..20 {
            buf.push(Transition {
                state: Tensor::zeros(&[STATE_SIZE as i64], (Kind::Float, Device::Cpu)),
                action_idx: 0,
                reward: 0.0,
                next_state: Tensor::zeros(&[STATE_SIZE as i64], (Kind::Float, Device::Cpu)),
                done: false,
            });
        }
        let indices = buf.sample_indices(10, &mut rng);
        assert_eq!(indices.len(), 10);
        for &i in &indices {
            assert!(i < 20, "index {i} out of range");
        }
    }

    #[test]
    fn dqn_net_no_nan_output() {
        // Forward pass on random input should not produce NaN or Inf Q-values.
        let (_vs, net) = make_net();
        let x = Tensor::randn(&[STATE_SIZE as i64], (Kind::Float, Device::Cpu));
        let _guard = tch::no_grad_guard();
        let q: Vec<f32> = net.forward_single(&x).try_into().unwrap();
        assert_eq!(q.len(), ACTION_SIZE);
        for (i, &v) in q.iter().enumerate() {
            assert!(v.is_finite(), "Q-value at index {i} is not finite: {v}");
        }
    }
}
