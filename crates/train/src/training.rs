//! AlphaZero training, corrected (plan task 4.2).
//!
//! Differences from round 1 (see docs/experiments/v1-verdict.md):
//! - moves are sampled at the temperature asked for (`visits^(1/tau)`);
//! - no gating: the latest net always plays self-play, and every checkpoint
//!   is kept to be rated on the arena ladder afterwards;
//! - the replay buffer is sized in positions, not games;
//! - positions are augmented with the 8 verified board symmetries;
//! - truncated games keep their policy targets and give no value target;
//! - only rulesets whose board encoding is Markov are accepted;
//! - a run is resumable exactly: weights, momentum buffers, replay buffer,
//!   counters and generator state are saved after every iteration, and a
//!   resumed run ends bit-identical to an uninterrupted one.

use crate::checkpoint::{load_var_store_strict, save_var_store};
use crate::encoding::{
    state_to_tensor, transform_policy, Features, ACTION_SIZE, MAX_STACK, STATE_SIZE,
};
use crate::net::{ArchConfig, AzNet};
use crate::selfplay::{play_one_game, GameEnd, SelfPlayConfig};
use anyhow::{ensure, Context};
use pogofish_engine::symmetry::{transform_state, verified_symmetries};
use pogofish_engine::{Cell, Color, GameState, RuleSet};
use pogofish_search::arena::{run_match, ArenaConfig};
use pogofish_search::players::Scripted;
use pogofish_search::rng::SplitMix64;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tch::{nn, Kind, Tensor};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrainConfig {
    pub rules: String,
    pub features: Features,
    /// `mlp_tiny`, `mlp_small` or `mlp_medium`.
    pub arch: String,
    pub iterations: u32,
    pub games_per_iteration: u32,
    pub num_simulations: u32,
    pub c_puct: f32,
    pub dirichlet_alpha: f32,
    pub dirichlet_epsilon: f32,
    pub temperature_moves: u32,
    /// Safety limit (plies); a longer game is truncated.
    pub max_moves: u16,
    /// Replay buffer capacity, in positions.
    pub buffer_positions: usize,
    /// Minibatch SGD steps per iteration (none until the buffer holds one batch).
    pub train_steps: u32,
    pub batch_size: usize,
    pub lr: f64,
    pub momentum: f64,
    pub weight_decay: f64,
    /// Train on a random one of the 8 verified symmetries of each sampled
    /// position (policy target transformed with it).
    pub augment: bool,
    pub checkpoint_every: u32,
    /// Arena evaluation against random and greedy every this many
    /// iterations (0 = never), with `eval_pairs` pairs at `eval_sims`.
    pub eval_every: u32,
    pub eval_pairs: u32,
    pub eval_sims: u32,
    pub seed: u64,
}

impl Default for TrainConfig {
    fn default() -> Self {
        Self {
            rules: "uncapped".into(),
            features: Features::Absolute,
            arch: "mlp_small".into(),
            iterations: 100,
            games_per_iteration: 50,
            num_simulations: 100,
            c_puct: 1.5,
            dirichlet_alpha: 0.3,
            dirichlet_epsilon: 0.25,
            temperature_moves: 10,
            // The round-2 safety limit (docs/experiments/v2-ruleset.md).
            max_moves: 1000,
            buffer_positions: 100_000,
            train_steps: 100,
            batch_size: 256,
            lr: 0.02,
            momentum: 0.9,
            weight_decay: 1e-4,
            augment: true,
            checkpoint_every: 5,
            eval_every: 5,
            eval_pairs: 100,
            eval_sims: 50,
            seed: 1,
        }
    }
}

impl TrainConfig {
    pub fn selfplay(&self) -> SelfPlayConfig {
        SelfPlayConfig {
            num_simulations: self.num_simulations,
            c_puct: self.c_puct,
            max_moves: self.max_moves,
            dirichlet_alpha: self.dirichlet_alpha,
            dirichlet_epsilon: self.dirichlet_epsilon,
            temperature_moves: self.temperature_moves,
        }
    }
}

/// Everything a checkpoint needs besides the tensors.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrainState {
    /// Iterations completed.
    pub iteration: u32,
    pub games_played: u64,
    pub rng_state: u64,
}

/// One replay-buffer entry. The board is stored in the lossless absolute
/// slot encoding so that it can be decoded, transformed by a symmetry, and
/// re-encoded with whatever features the net reads.
#[derive(Clone)]
struct Example {
    board: [f32; STATE_SIZE],
    policy: [f32; ACTION_SIZE],
    value: f32,
    has_value: bool,
}

/// Rebuild a position from its absolute slot encoding (move count and
/// history are not stored; the rules trained on do not read them).
pub fn decode_board(board: &[f32]) -> GameState {
    let mut cells: [Cell; 9] = std::array::from_fn(|_| Vec::new());
    for (i, cell) in cells.iter_mut().enumerate() {
        for slot in 0..MAX_STACK {
            match board[i * MAX_STACK + slot] {
                x if x > 0.5 => cell.push(Color::White),
                x if x < -0.5 => cell.push(Color::Red),
                _ => break,
            }
        }
    }
    let to_move = if board[STATE_SIZE - 1] > 0.0 {
        Color::White
    } else {
        Color::Red
    };
    pogofish_engine::testing::position(cells, to_move, 0)
}

struct Paths {
    dir: PathBuf,
}

impl Paths {
    fn f(&self, name: &str) -> PathBuf {
        self.dir.join(name)
    }
    fn checkpoint(&self, iteration: u32) -> PathBuf {
        self.dir
            .join("checkpoints")
            .join(format!("iter_{iteration:05}.pt"))
    }
}

/// How a call to [`train`] stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrainStop {
    Finished,
    Interrupted,
}

/// Mean squared value error over the examples whose mask is 1; positions of
/// truncated games (mask 0) contribute nothing. Zero when the batch has no
/// value target at all.
pub fn masked_value_loss(pred: &Tensor, target: &Tensor, mask: &Tensor) -> Tensor {
    let squared = (pred - target).pow_tensor_scalar(2) * mask;
    squared.sum(Kind::Float) / mask.sum(Kind::Float).clamp_min(1.0)
}

/// Peak resident set size of this process, in MiB.
pub fn peak_rss_mib() -> f64 {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) };
    let raw = usage.ru_maxrss as f64;
    if cfg!(target_os = "macos") {
        raw / (1024.0 * 1024.0)
    } else {
        raw / 1024.0
    }
}

fn save_buffer(buffer: &VecDeque<Example>, path: &Path) -> anyhow::Result<()> {
    let n = buffer.len() as i64;
    let flat = |f: &dyn Fn(&Example) -> Vec<f32>| buffer.iter().flat_map(f).collect::<Vec<f32>>();
    let boards = Tensor::from_slice(&flat(&|e| e.board.to_vec())).view([n, STATE_SIZE as i64]);
    let policies = Tensor::from_slice(&flat(&|e| e.policy.to_vec())).view([n, ACTION_SIZE as i64]);
    let values = Tensor::from_slice(&flat(&|e| vec![e.value]));
    let has = Tensor::from_slice(&flat(&|e| vec![if e.has_value { 1.0 } else { 0.0 }]));
    Tensor::save_multi(
        &[
            ("boards", &boards),
            ("policies", &policies),
            ("values", &values),
            ("has_value", &has),
        ],
        path,
    )
    .with_context(|| format!("saving {}", path.display()))
}

fn load_buffer(path: &Path) -> anyhow::Result<VecDeque<Example>> {
    let named = Tensor::load_multi(path).with_context(|| format!("reading {}", path.display()))?;
    let get = |k: &str| -> anyhow::Result<Vec<f32>> {
        let t = named
            .iter()
            .find(|(n, _)| n == k)
            .with_context(|| format!("buffer lacks {k}"))?;
        Ok(Vec::<f32>::try_from(t.1.view([-1]))?)
    };
    let (boards, policies, values, has) = (
        get("boards")?,
        get("policies")?,
        get("values")?,
        get("has_value")?,
    );
    ensure!(
        boards.len() == values.len() * STATE_SIZE && policies.len() == values.len() * ACTION_SIZE
    );
    Ok((0..values.len())
        .map(|i| Example {
            board: boards[i * STATE_SIZE..(i + 1) * STATE_SIZE]
                .try_into()
                .expect("sized"),
            policy: policies[i * ACTION_SIZE..(i + 1) * ACTION_SIZE]
                .try_into()
                .expect("sized"),
            value: values[i],
            has_value: has[i] > 0.5,
        })
        .collect())
}

/// SGD with momentum and L2 weight decay, written out so that its momentum
/// buffers can be saved and restored (tch-rs cannot serialise its optimiser).
struct MomentumSgd {
    names: Vec<String>,
    momentum: Vec<Tensor>,
}

impl MomentumSgd {
    fn new(vs: &nn::VarStore) -> Self {
        let vars = vs.variables();
        let mut names: Vec<String> = vars.keys().cloned().collect();
        names.sort();
        let momentum = names.iter().map(|n| vars[n].zeros_like()).collect();
        Self { names, momentum }
    }

    fn step(&mut self, vs: &nn::VarStore, loss: &Tensor, lr: f64, mu: f64, wd: f64) {
        let vars = vs.variables();
        for n in &self.names {
            let mut v = vars[n].shallow_clone();
            v.zero_grad();
        }
        loss.backward();
        tch::no_grad(|| {
            for (n, buf) in self.names.iter().zip(self.momentum.iter_mut()) {
                let mut v = vars[n].shallow_clone();
                let g = v.grad() + &v * wd;
                *buf = &*buf * mu + g;
                let _ = v.f_sub_(&(&*buf * lr)).expect("in-place update");
            }
        });
    }

    fn save(&self, path: &Path) -> anyhow::Result<()> {
        let named: Vec<(&str, &Tensor)> = self
            .names
            .iter()
            .map(String::as_str)
            .zip(self.momentum.iter())
            .collect();
        Tensor::save_multi(&named, path).with_context(|| format!("saving {}", path.display()))
    }

    fn load(&mut self, path: &Path) -> anyhow::Result<()> {
        let mut named =
            Tensor::load_multi(path).with_context(|| format!("reading {}", path.display()))?;
        named.sort_by(|a, b| a.0.cmp(&b.0));
        let names: Vec<&String> = named.iter().map(|(n, _)| n).collect();
        ensure!(
            names.iter().copied().eq(self.names.iter()),
            "momentum buffers do not match the net"
        );
        self.momentum = named.into_iter().map(|(_, t)| t).collect();
        Ok(())
    }
}

/// Train, or resume the run found in `dir` (its saved config must equal
/// `cfg` except for `iterations`, which may be raised to extend it). Stops at
/// the end of the configured iterations, or at the next game boundary after
/// `crate::interrupt::requested()`, discarding the unfinished iteration.
pub fn train(cfg: &TrainConfig, dir: &Path) -> anyhow::Result<TrainStop> {
    let rules: RuleSet = cfg.rules.parse().map_err(anyhow::Error::msg)?;
    // The network sees only the board and the player to move. Under a rule
    // that also reads the move count or the history, two positions with the
    // same input can have different outcomes (round-1 defect 3).
    ensure!(
        rules.board_is_markov(),
        "refusing to train under {rules}: the network input is not a Markov state for it \
         (it omits the move count and repetition history); train under `uncapped`"
    );
    let arch = ArchConfig::from_name(&cfg.arch)?;
    let paths = Paths {
        dir: dir.to_path_buf(),
    };
    std::fs::create_dir_all(dir.join("checkpoints"))
        .with_context(|| format!("creating {}", dir.display()))?;
    tch::set_num_threads(1);

    let mut vs = nn::VarStore::new(tch::Device::Cpu);
    let net = AzNet::from_config_with(&vs.root(), &arch, cfg.features);
    crate::td::seeded_init(&vs, cfg.seed);
    let mut opt = MomentumSgd::new(&vs);
    let mut buffer: VecDeque<Example> = VecDeque::new();

    let mut state = if paths.f("state.json").exists() {
        let saved: TrainConfig =
            serde_json::from_str(&std::fs::read_to_string(paths.f("config.json"))?)?;
        ensure!(
            TrainConfig {
                iterations: cfg.iterations,
                ..saved
            } == *cfg,
            "{} holds a run with a different configuration",
            dir.display()
        );
        load_var_store_strict(&mut vs, &paths.f("weights.pt"))?;
        opt.load(&paths.f("momentum.pt"))?;
        buffer = load_buffer(&paths.f("buffer.pt"))?;
        serde_json::from_str::<TrainState>(&std::fs::read_to_string(paths.f("state.json"))?)?
    } else {
        TrainState {
            iteration: 0,
            games_played: 0,
            rng_state: cfg.seed,
        }
    };
    std::fs::write(
        paths.f("config.json"),
        serde_json::to_string_pretty(cfg)? + "\n",
    )?;

    let sp = cfg.selfplay();
    let symmetries = verified_symmetries();
    while state.iteration < cfg.iterations {
        let started = Instant::now();
        let mut rng = SplitMix64::new(state.rng_state);

        // --- Self-play with the latest net ---
        let (mut truncated, mut plies, mut white_wins) = (0u32, 0u64, 0u32);
        for _ in 0..cfg.games_per_iteration {
            if crate::interrupt::requested() {
                return Ok(TrainStop::Interrupted);
            }
            let game = play_one_game(&net, &rules, &sp, &mut rng);
            match game.end {
                GameEnd::Truncated => truncated += 1,
                GameEnd::Terminated(o) if o.winner() == Some(Color::White) => white_wins += 1,
                GameEnd::Terminated(_) => {}
            }
            plies += game.examples.len() as u64;
            for ex in game.examples {
                let t = state_to_tensor(&ex.position);
                buffer.push_back(Example {
                    board: Vec::<f32>::try_from(t)?.try_into().expect("STATE_SIZE"),
                    policy: ex.policy,
                    value: ex.value.unwrap_or(0.0),
                    has_value: ex.value.is_some(),
                });
            }
        }
        while buffer.len() > cfg.buffer_positions {
            buffer.pop_front();
        }
        let selfplay_seconds = started.elapsed().as_secs_f64();

        // --- Training on minibatches sampled from the buffer ---
        let (mut p_loss, mut v_loss, mut steps) = (0.0, 0.0, 0u32);
        if buffer.len() >= cfg.batch_size {
            for _ in 0..cfg.train_steps {
                let (mut xs, mut ps, mut vs_, mut ms) =
                    (Vec::new(), Vec::new(), Vec::new(), Vec::new());
                for _ in 0..cfg.batch_size {
                    let e = &buffer[rng.below(buffer.len())];
                    let (pos, pol) = if cfg.augment {
                        let perm = &symmetries[rng.below(symmetries.len())];
                        (
                            transform_state(&decode_board(&e.board), perm),
                            transform_policy(&e.policy, perm),
                        )
                    } else {
                        (decode_board(&e.board), e.policy)
                    };
                    xs.push(net.encode(&pos));
                    ps.push(Tensor::from_slice(&pol));
                    vs_.push(e.value);
                    ms.push(if e.has_value { 1.0f32 } else { 0.0 });
                }
                let (logits, value) = net.forward(&Tensor::stack(&xs, 0));
                let policy_loss = -(Tensor::stack(&ps, 0) * logits.log_softmax(-1, Kind::Float))
                    .sum_dim_intlist(&[-1i64][..], false, Kind::Float)
                    .mean(Kind::Float);
                let value_loss = masked_value_loss(
                    &value,
                    &Tensor::from_slice(&vs_).view([-1, 1]),
                    &Tensor::from_slice(&ms).view([-1, 1]),
                );
                let loss = &policy_loss + &value_loss;
                opt.step(&vs, &loss, cfg.lr, cfg.momentum, cfg.weight_decay);
                p_loss += f64::try_from(policy_loss)?;
                v_loss += f64::try_from(value_loss)?;
                steps += 1;
            }
        }

        state.iteration += 1;
        state.games_played += cfg.games_per_iteration as u64;
        state.rng_state = rng.state();

        let n = cfg.games_per_iteration.max(1) as f64;
        let mut entry = serde_json::json!({
            "iteration": state.iteration,
            "games_played": state.games_played,
            "truncated_games": truncated,
            "white_wins": white_wins,
            "mean_plies": plies as f64 / n,
            "buffer_positions": buffer.len(),
            "policy_loss": if steps > 0 { p_loss / steps as f64 } else { f64::NAN },
            "value_loss": if steps > 0 { v_loss / steps as f64 } else { f64::NAN },
            "selfplay_seconds": selfplay_seconds,
            "games_per_second": n / selfplay_seconds.max(1e-9),
            "iter_seconds": started.elapsed().as_secs_f64(),
            "peak_rss_mib": peak_rss_mib(),
        });
        if cfg.eval_every > 0 && state.iteration % cfg.eval_every == 0 {
            let mut eval_cfg = sp.clone();
            eval_cfg.num_simulations = cfg.eval_sims;
            for opponent in [Scripted::Random, Scripted::Greedy] {
                let mut me = LiveNet {
                    net: &net,
                    cfg: &eval_cfg,
                };
                let mut them = opponent;
                let arena = ArenaConfig::new(rules, cfg.eval_pairs, 4, cfg.max_moves as u32, 1);
                let r = run_match(&mut me, &mut them, &arena).map_err(anyhow::Error::msg)?;
                entry[format!("vs_{}", opponent.name())] = serde_json::json!({
                    "score": r.score, "ci95": r.ci95, "unfinished": r.a.unfinished,
                });
            }
        }

        // Commit the iteration: tensors first, state last.
        save_var_store(&vs, &paths.f("weights.pt"))?;
        opt.save(&paths.f("momentum.pt"))?;
        save_buffer(&buffer, &paths.f("buffer.pt"))?;
        if cfg.checkpoint_every > 0 && state.iteration % cfg.checkpoint_every == 0 {
            save_var_store(&vs, &paths.checkpoint(state.iteration))?;
        }
        crate::metrics::append_metrics(&paths.f("metrics.jsonl"), &entry)?;
        let tmp = paths.f("state.json.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(&state)? + "\n")?;
        std::fs::rename(&tmp, paths.f("state.json"))?;
        eprintln!("{entry}");
    }
    Ok(TrainStop::Finished)
}

/// The net being trained, as an arena player (MCTS, no noise, most visited).
struct LiveNet<'a> {
    net: &'a AzNet,
    cfg: &'a SelfPlayConfig,
}

impl pogofish_search::arena::Agent for LiveNet<'_> {
    fn name(&self) -> String {
        "training net".into()
    }

    fn choose(
        &mut self,
        s: &GameState,
        rules: &RuleSet,
        _rng: &mut SplitMix64,
    ) -> pogofish_engine::Move {
        crate::selfplay::neural_mcts_greedy_move(self.net, s, rules, self.cfg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pogofish_engine::{apply_move, initial_state, legal_moves};

    #[test]
    fn boards_decode_to_the_same_position() {
        let mut s = initial_state();
        for i in 0..12 {
            let m = legal_moves(&s)[i % legal_moves(&s).len()];
            s = apply_move(&s, m).unwrap();
            let t: Vec<f32> = state_to_tensor(&s).try_into().unwrap();
            let d = decode_board(&t);
            assert_eq!(d.cells(), s.cells());
            assert_eq!(d.to_move(), s.to_move());
        }
    }

    #[test]
    fn momentum_sgd_matches_the_formula() {
        let vs = nn::VarStore::new(tch::Device::Cpu);
        let w = vs.root().var("w", &[1], nn::Init::Const(1.0));
        let mut opt = MomentumSgd::new(&vs);
        // loss = w^2 / 2, gradient w; weight decay 0.
        for _ in 0..2 {
            let loss = (&w * &w).sum(Kind::Float) / 2.0;
            opt.step(&vs, &loss, 0.1, 0.9, 0.0);
        }
        // step 1: buf = 1, w = 0.9 ; step 2: buf = 0.9 + 0.9 = 1.8, w = 0.9 - 0.18 = 0.72
        let got = f64::try_from(w.sum(Kind::Float)).unwrap();
        assert!((got - 0.72).abs() < 1e-6, "{got}");
    }
}
