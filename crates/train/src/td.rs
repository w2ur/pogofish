//! TD(λ) value learning, TD-Gammon style (plan task 4.1).
//!
//! A small MLP estimates V(s) in [−1, 1] for the player to move. The agent
//! scores each legal move by the value of the position it leads to (exactly
//! ±1 when the move ends the game, otherwise −V(next) because the opponent
//! moves next) and, in self-play, samples from a softmax over those scores
//! with a temperature that decays towards greedy play.
//!
//! Targets are λ-returns computed after each game with the current net:
//! G_T is the exact outcome (or V(s_T) when the safety limit truncated the
//! game: TD bootstraps, so a truncated game still yields targets), and
//! G_t = −[(1 − λ)·V(s_{t+1}) + λ·G_{t+1}]. Training is plain SGD, which has
//! no optimiser state, so a checkpoint (weights, counters, generator state)
//! resumes the run exactly.

use crate::checkpoint::{load_var_store_strict, save_var_store};
use anyhow::{ensure, Context};
use pogofish_engine::{
    apply_move_under, initial_state, is_terminal, legal_moves, GameState, Move, Outcome, RuleSet,
};
use pogofish_search::arena::{run_match, Agent, ArenaConfig};
use pogofish_search::players::Scripted;
use pogofish_search::rng::SplitMix64;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tch::nn::{self, Module, OptimizerConfig};
use tch::{Kind, Tensor};

pub use crate::encoding::Features as TdFeatures;
pub use crate::encoding::MOVER_RELATIVE_SIZE;

pub struct TdNet {
    seq: nn::Sequential,
    features: TdFeatures,
}

impl TdNet {
    pub fn new(p: &nn::Path, hidden: &[i64], features: TdFeatures) -> Self {
        let mut seq = nn::seq();
        let mut width = features.size() as i64;
        for (i, &h) in hidden.iter().enumerate() {
            seq = seq
                .add(nn::linear(
                    p / format!("td_fc{i}"),
                    width,
                    h,
                    Default::default(),
                ))
                .add_fn(|x| x.relu());
            width = h;
        }
        seq = seq
            .add(nn::linear(p / "td_out", width, 1, Default::default()))
            .add_fn(|x| x.tanh());
        Self { seq, features }
    }

    pub fn forward(&self, x: &Tensor) -> Tensor {
        self.seq.forward(x)
    }

    /// V(s) for each state, from its player-to-move's side, without gradients.
    pub fn values(&self, states: &[GameState]) -> Vec<f32> {
        if states.is_empty() {
            return Vec::new();
        }
        let _guard = tch::no_grad_guard();
        let x = Tensor::stack(
            &states
                .iter()
                .map(|s| crate::encoding::encode(self.features, s))
                .collect::<Vec<_>>(),
            0,
        );
        Vec::<f32>::try_from(self.forward(&x).view([-1])).expect("f32 values")
    }
}

/// Initialise every variable from `seed` alone, uniform in ±1/√fan_in (the
/// scale PyTorch's linear layers use), independent of libtorch's
/// process-wide generator, which other threads may be using.
pub fn seeded_init(vs: &nn::VarStore, seed: u64) {
    let vars = vs.variables();
    let mut names: Vec<&String> = vars.keys().collect();
    names.sort();
    let mut rng = SplitMix64::new(seed ^ 0x5EED_1417);
    for name in names {
        let t = &vars[name];
        let layer = name.rsplit_once('.').map_or(name.as_str(), |(l, _)| l);
        let fan_in = vars
            .get(&format!("{layer}.weight"))
            .map_or(1, |w| *w.size().last().unwrap_or(&1))
            .max(1);
        let bound = 1.0 / (fan_in as f64).sqrt();
        let numel = t.numel();
        let values: Vec<f32> = (0..numel)
            .map(|_| ((rng.unit_f64() * 2.0 - 1.0) * bound) as f32)
            .collect();
        tch::no_grad(|| {
            let mut t = t.shallow_clone();
            t.copy_(&Tensor::from_slice(&values).view(t.size().as_slice()));
        });
    }
}

/// Parse hidden-layer widths written like `128x64`.
pub fn parse_hidden(s: &str) -> anyhow::Result<Vec<i64>> {
    let v: Result<Vec<i64>, _> = s.split('x').map(str::parse).collect();
    let v = v.with_context(|| format!("hidden sizes must look like 128x64, got '{s}'"))?;
    ensure!(
        !v.is_empty() && v.iter().all(|&h| h > 0),
        "hidden sizes must be positive: '{s}'"
    );
    Ok(v)
}

/// The value of an outcome for the player to move in the ended position.
fn outcome_for_mover(o: Outcome, state: &GameState) -> f32 {
    match o.winner() {
        None => 0.0,
        Some(w) if w == state.to_move() => 1.0,
        Some(_) => -1.0,
    }
}

/// Every legal move with its score for the player to move: the exact result
/// when the move ends the game, else −V(position after the move).
pub fn score_moves(net: &TdNet, state: &GameState, rules: &RuleSet) -> Vec<(Move, f32)> {
    let mover = state.to_move();
    let mut scored = Vec::new();
    let mut pending = Vec::new();
    for m in legal_moves(state) {
        let next = apply_move_under(state, m, rules).expect("legal");
        match is_terminal(&next, rules) {
            Some(o) => scored.push((
                m,
                match o.winner() {
                    None => 0.0,
                    Some(w) if w == mover => 1.0,
                    Some(_) => -1.0,
                },
            )),
            None => pending.push((m, next)),
        }
    }
    let states: Vec<GameState> = pending.iter().map(|(_, s)| s.clone()).collect();
    for ((m, _), v) in pending.into_iter().zip(net.values(&states)) {
        scored.push((m, -v));
    }
    scored
}

/// Pick a move: the best-scored one when `temperature <= 0` (first in
/// engine order among equals, so deterministic), else a softmax sample.
pub fn choose(
    net: &TdNet,
    state: &GameState,
    rules: &RuleSet,
    temperature: f64,
    rng: &mut SplitMix64,
) -> Move {
    let mut scored = score_moves(net, state, rules);
    // Engine order, whatever order terminal and non-terminal moves came in.
    let order = legal_moves(state);
    scored.sort_by_key(|(m, _)| order.iter().position(|x| x == m));
    if temperature <= 0.0 {
        let best = scored.iter().map(|&(_, s)| s).fold(f32::MIN, f32::max);
        return scored
            .iter()
            .find(|&&(_, s)| s == best)
            .expect("a legal move")
            .0;
    }
    let max = scored
        .iter()
        .map(|&(_, s)| s as f64)
        .fold(f64::MIN, f64::max);
    let weights: Vec<f64> = scored
        .iter()
        .map(|&(_, s)| ((s as f64 - max) / temperature).exp())
        .collect();
    let mut r = rng.unit_f64() * weights.iter().sum::<f64>();
    for ((m, _), w) in scored.iter().zip(&weights) {
        if r < *w {
            return *m;
        }
        r -= w;
    }
    scored.last().expect("a legal move").0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TdEnd {
    Terminated(Outcome),
    Truncated,
}

/// One self-play game: the positions s_0..s_T and how it ended.
pub fn play_game(
    net: &TdNet,
    rules: &RuleSet,
    temperature: f64,
    max_plies: u32,
    rng: &mut SplitMix64,
) -> (Vec<GameState>, TdEnd) {
    let mut states = vec![initial_state()];
    loop {
        let s = states.last().expect("non-empty");
        if let Some(o) = is_terminal(s, rules) {
            return (states, TdEnd::Terminated(o));
        }
        if states.len() as u32 > max_plies {
            return (states, TdEnd::Truncated);
        }
        let m = choose(net, s, rules, temperature, rng);
        let next = apply_move_under(s, m, rules).expect("legal");
        states.push(next);
    }
}

/// λ-returns G_0..G_{T−1} from `values` = V(s_0)..V(s_T), where V(s_T) is the
/// exact outcome for a terminated game or the net's estimate for a truncated
/// one. Each value is from its own player-to-move's side, hence the sign flip.
pub fn lambda_returns(values: &[f32], lambda: f32) -> Vec<f32> {
    let t_end = values.len() - 1;
    let mut g = vec![0.0; t_end];
    let mut next_g = values[t_end];
    for t in (0..t_end).rev() {
        g[t] = -((1.0 - lambda) * values[t + 1] + lambda * next_g);
        next_g = g[t];
    }
    g
}

/// Targets for one game under the current net.
pub fn game_targets(net: &TdNet, states: &[GameState], end: TdEnd, lambda: f32) -> Vec<f32> {
    let mut values = net.values(states);
    if let TdEnd::Terminated(o) = end {
        let last = states.len() - 1;
        values[last] = outcome_for_mover(o, &states[last]);
    }
    lambda_returns(&values, lambda)
}

/// A TD net playing greedily (temperature 0), for the arena.
pub struct TdPlayer<'a> {
    pub net: &'a TdNet,
    pub label: String,
}

impl Agent for TdPlayer<'_> {
    fn name(&self) -> String {
        self.label.clone()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        choose(self.net, state, rules, 0.0, rng)
    }
}

/// A TD checkpoint loaded from disk, for the arena (`td:PATH[:HIDDEN]`).
pub struct TdCheckpoint {
    _vs: nn::VarStore,
    net: TdNet,
    label: String,
}

impl TdCheckpoint {
    pub fn load(path: &Path, hidden: &[i64], features: TdFeatures) -> anyhow::Result<Self> {
        let mut vs = nn::VarStore::new(tch::Device::Cpu);
        let net = TdNet::new(&vs.root(), hidden, features);
        load_var_store_strict(&mut vs, path)
            .with_context(|| format!("loading TD checkpoint {}", path.display()))?;
        Ok(Self {
            _vs: vs,
            net,
            label: format!("td:{}", path.display()),
        })
    }
}

impl Agent for TdCheckpoint {
    fn name(&self) -> String {
        self.label.clone()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        choose(&self.net, state, rules, 0.0, rng)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TdConfig {
    pub rules: String,
    pub features: TdFeatures,
    pub hidden: Vec<i64>,
    pub lambda: f32,
    pub lr: f64,
    pub batch_size: usize,
    pub iterations: u32,
    pub games_per_iteration: u32,
    /// Softmax temperature, decaying geometrically from start to end over
    /// `temp_decay_iterations`, then held at end. Independent of
    /// `iterations`, so extending a run does not change its past.
    pub temp_start: f64,
    pub temp_end: f64,
    pub temp_decay_iterations: u32,
    pub max_plies: u32,
    /// Evaluate against random and greedy every this many iterations (0 = never).
    pub eval_every: u32,
    pub eval_pairs: u32,
    pub checkpoint_every: u32,
    pub seed: u64,
}

impl Default for TdConfig {
    fn default() -> Self {
        Self {
            rules: "uncapped".into(),
            features: TdFeatures::MoverRelative,
            hidden: vec![128, 64],
            lambda: 0.7,
            lr: 0.01,
            batch_size: 64,
            iterations: 200,
            games_per_iteration: 50,
            temp_start: 0.5,
            temp_end: 0.02,
            temp_decay_iterations: 200,
            max_plies: 1000,
            eval_every: 10,
            eval_pairs: 100,
            checkpoint_every: 10,
            seed: 1,
        }
    }
}

impl TdConfig {
    pub fn temperature(&self, iteration: u32) -> f64 {
        let span = self.temp_decay_iterations.saturating_sub(1).max(1) as f64;
        let x = (iteration as f64 / span).min(1.0);
        self.temp_start * (self.temp_end / self.temp_start).powf(x)
    }
}

/// What a checkpoint needs besides the weights.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TdState {
    /// Iterations completed.
    pub iteration: u32,
    pub games_played: u64,
    pub rng_state: u64,
}

pub struct TdRun {
    pub dir: PathBuf,
}

impl TdRun {
    fn config_path(&self) -> PathBuf {
        self.dir.join("config.json")
    }
    fn state_path(&self) -> PathBuf {
        self.dir.join("state.json")
    }
    pub fn weights_path(&self) -> PathBuf {
        self.dir.join("weights.pt")
    }
    pub fn metrics_path(&self) -> PathBuf {
        self.dir.join("metrics.jsonl")
    }
    pub fn checkpoint_path(&self, iteration: u32) -> PathBuf {
        self.dir
            .join("checkpoints")
            .join(format!("iter_{iteration:05}.pt"))
    }
}

/// How a call to [`train_td`] stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TdStop {
    Finished,
    Interrupted,
}

/// Train, or resume a run found in `dir` (its saved config must equal `cfg`,
/// except for `iterations`, which may be raised to extend a run). Stops at
/// the end of the configured iterations, or at the next game boundary after
/// `crate::interrupt::requested()`, discarding the unfinished iteration: the
/// last completed iteration is always on disk, so a resumed run replays the
/// interrupted one exactly.
pub fn train_td(cfg: &TdConfig, dir: &Path) -> anyhow::Result<TdStop> {
    let rules: RuleSet = cfg.rules.parse().map_err(anyhow::Error::msg)?;
    ensure!(
        cfg.features.suffice_for(&rules),
        "refusing to train under {rules} with {:?} features: the input lacks what the rule reads",
        cfg.features
    );
    let run = TdRun {
        dir: dir.to_path_buf(),
    };
    std::fs::create_dir_all(dir.join("checkpoints"))
        .with_context(|| format!("creating {}", dir.display()))?;
    tch::set_num_threads(1);

    let mut vs = nn::VarStore::new(tch::Device::Cpu);
    let net = TdNet::new(&vs.root(), &cfg.hidden, cfg.features);
    seeded_init(&vs, cfg.seed);

    crate::checkpoint::journal::recover(dir)?;
    let mut state = if run.state_path().exists() {
        let saved: TdConfig = serde_json::from_str(&std::fs::read_to_string(run.config_path())?)?;
        ensure!(
            TdConfig {
                iterations: cfg.iterations,
                ..saved.clone()
            } == *cfg,
            "{} holds a run with a different configuration",
            dir.display()
        );
        load_var_store_strict(&mut vs, &run.weights_path())?;
        serde_json::from_str::<TdState>(&std::fs::read_to_string(run.state_path())?)?
    } else {
        TdState {
            iteration: 0,
            games_played: 0,
            rng_state: cfg.seed,
        }
    };
    std::fs::write(run.config_path(), serde_json::to_string_pretty(cfg)? + "\n")?;

    let mut opt = nn::Sgd::default().build(&vs, cfg.lr)?;
    let started = Instant::now();
    while state.iteration < cfg.iterations {
        let iter_start = Instant::now();
        let mut rng = SplitMix64::new(state.rng_state);
        let temperature = cfg.temperature(state.iteration);
        let mut xs = Vec::new();
        let mut ys = Vec::new();
        let (mut plies, mut truncated) = (0u64, 0u32);
        for _ in 0..cfg.games_per_iteration {
            if crate::interrupt::requested() {
                return Ok(TdStop::Interrupted);
            }
            let (states, end) = play_game(&net, &rules, temperature, cfg.max_plies, &mut rng);
            if end == TdEnd::Truncated {
                truncated += 1;
            }
            plies += states.len() as u64 - 1;
            let targets = game_targets(&net, &states, end, cfg.lambda);
            for (s, g) in states.iter().zip(targets) {
                xs.push(crate::encoding::encode(cfg.features, s));
                ys.push(g);
            }
        }

        // One SGD pass over this iteration's positions, in a seeded order.
        let n = xs.len();
        let mut order: Vec<usize> = (0..n).collect();
        for i in (1..n).rev() {
            order.swap(i, rng.below(i + 1));
        }
        let x_all = Tensor::stack(&xs, 0);
        let y_all = Tensor::from_slice(&ys).view([-1, 1]);
        let mut loss_sum = 0.0;
        let mut batches = 0;
        for chunk in order.chunks(cfg.batch_size) {
            let idx = Tensor::from_slice(&chunk.iter().map(|&i| i as i64).collect::<Vec<_>>());
            let pred = net.forward(&x_all.index_select(0, &idx));
            let loss = (pred - y_all.index_select(0, &idx))
                .pow_tensor_scalar(2)
                .mean(Kind::Float);
            opt.backward_step(&loss);
            loss_sum += f64::try_from(loss)?;
            batches += 1;
        }

        state.iteration += 1;
        state.games_played += cfg.games_per_iteration as u64;
        state.rng_state = rng.state();

        let mut entry = serde_json::json!({
            "iteration": state.iteration,
            "games_played": state.games_played,
            "temperature": temperature,
            "positions": n,
            "mean_plies": plies as f64 / cfg.games_per_iteration as f64,
            "truncated_games": truncated,
            "loss": if batches > 0 { loss_sum / batches as f64 } else { 0.0 },
            "iter_seconds": iter_start.elapsed().as_secs_f64(),
        });
        if cfg.eval_every > 0 && state.iteration % cfg.eval_every == 0 {
            for opponent in [Scripted::Random, Scripted::Greedy] {
                let mut me = TdPlayer {
                    net: &net,
                    label: "td".into(),
                };
                let mut them = opponent;
                let arena = ArenaConfig::new(rules, cfg.eval_pairs, 4, cfg.max_plies, 1);
                let r = run_match(&mut me, &mut them, &arena).map_err(anyhow::Error::msg)?;
                entry[format!("vs_{}", opponent.name())] = serde_json::json!({
                    "score": r.score, "ci95": r.ci95, "unfinished": r.a.unfinished,
                });
            }
        }

        // Commit the iteration atomically (see checkpoint::journal).
        use crate::checkpoint::journal;
        let mut files: Vec<String> = vec!["weights.pt".into()];
        save_var_store(&vs, &journal::staged(dir, "weights.pt"))?;
        if cfg.checkpoint_every > 0 && state.iteration % cfg.checkpoint_every == 0 {
            let name = format!("checkpoints/iter_{:05}.pt", state.iteration);
            save_var_store(&vs, &journal::staged(dir, &name))?;
            files.push(name);
        }
        std::fs::write(
            journal::staged(dir, "state.json"),
            serde_json::to_string_pretty(&state)? + "\n",
        )?;
        files.push("state.json".into());
        journal::commit(dir, state.iteration, &files, "metrics.jsonl", &entry)?;
        eprintln!("{entry}");
    }
    eprintln!(
        "TD training done in {:.0}s",
        started.elapsed().as_secs_f64()
    );
    Ok(TdStop::Finished)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encoding::{MAX_STACK, STATE_SIZE};
    use pogofish_engine::Color;

    #[test]
    fn lambda_one_is_the_game_result_with_alternating_signs() {
        // Three moves, then the player to move at s_3 has lost (-1).
        let g = lambda_returns(&[0.3, -0.2, 0.9, -1.0], 1.0);
        assert_eq!(g, vec![1.0, -1.0, 1.0]);
    }

    #[test]
    fn lambda_zero_is_one_step_bootstrapping() {
        let v = [0.3, -0.2, 0.9, 0.4];
        let g = lambda_returns(&v, 0.0);
        assert_eq!(g, vec![0.2, -0.9, -0.4]);
    }

    #[test]
    fn intermediate_lambda_mixes_both() {
        let v = [0.0, 0.5, -1.0];
        let g = lambda_returns(&v, 0.5);
        // G_1 = -(0.5·-1 + 0.5·-1) = 1 ; G_0 = -(0.5·0.5 + 0.5·1) = -0.75
        assert_eq!(g, vec![-0.75, 1.0]);
    }

    #[test]
    fn temperature_decays_from_start_to_end() {
        let cfg = TdConfig {
            temp_decay_iterations: 11,
            temp_start: 1.0,
            temp_end: 0.01,
            ..TdConfig::default()
        };
        assert!((cfg.temperature(0) - 1.0).abs() < 1e-12);
        assert!((cfg.temperature(10) - 0.01).abs() < 1e-12);
        assert!((cfg.temperature(5) - 0.1).abs() < 1e-9);
        assert!(
            (cfg.temperature(50) - 0.01).abs() < 1e-12,
            "held at the end"
        );
    }

    fn net() -> (nn::VarStore, TdNet) {
        tch::manual_seed(3);
        let vs = nn::VarStore::new(tch::Device::Cpu);
        let net = TdNet::new(&vs.root(), &[16], TdFeatures::Absolute);
        (vs, net)
    }

    #[test]
    fn a_winning_move_scores_one_and_greedy_takes_it() {
        use pogofish_engine::{testing::position, Cell, Color};
        let (_vs, net) = net();
        let mut cells: [Cell; 9] = std::array::from_fn(|_| Vec::new());
        cells[0] = vec![Color::White];
        cells[1] = vec![Color::Red];
        cells[3] = vec![Color::White, Color::White];
        let s = position(cells, Color::White, 0);
        let scores = score_moves(&net, &s, &RuleSet::Uncapped);
        assert_eq!(scores.len(), legal_moves(&s).len());
        let m = choose(&net, &s, &RuleSet::Uncapped, 0.0, &mut SplitMix64::new(0));
        let next = apply_move_under(&s, m, &RuleSet::Uncapped).unwrap();
        assert_eq!(
            is_terminal(&next, &RuleSet::Uncapped),
            Some(Outcome::WinWhite)
        );
    }

    #[test]
    fn a_terminated_game_targets_end_in_a_win_for_the_last_mover() {
        let (_vs, net) = net();
        let mut rng = SplitMix64::new(5);
        let (states, end) = play_game(&net, &RuleSet::Uncapped, 1.0, 1000, &mut rng);
        assert!(matches!(end, TdEnd::Terminated(_)), "{end:?}");
        let g = game_targets(&net, &states, end, 0.7);
        assert_eq!(g.len(), states.len() - 1);
        assert_eq!(
            *g.last().unwrap(),
            1.0,
            "the move that ends the game wins it"
        );
        assert!(g.iter().all(|x| (-1.0..=1.0).contains(x)));
    }

    #[test]
    fn a_truncated_game_still_has_targets() {
        let (_vs, net) = net();
        let (states, end) = play_game(&net, &RuleSet::Uncapped, 1.0, 2, &mut SplitMix64::new(1));
        assert_eq!(end, TdEnd::Truncated);
        assert_eq!(states.len(), 3);
        assert_eq!(game_targets(&net, &states, end, 0.7).len(), 2);
    }

    #[test]
    fn hidden_sizes_parse() {
        assert_eq!(parse_hidden("128x64").unwrap(), vec![128, 64]);
        assert_eq!(parse_hidden("32").unwrap(), vec![32]);
        for bad in ["", "x", "128x", "0x3", "a"] {
            assert!(parse_hidden(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn seeded_init_is_reproducible_and_scaled() {
        let make = |seed| {
            let vs = nn::VarStore::new(tch::Device::Cpu);
            let _net = TdNet::new(&vs.root(), &[16], TdFeatures::Absolute);
            seeded_init(&vs, seed);
            let mut v: Vec<(String, Tensor)> = vs.variables().into_iter().collect();
            v.sort_by(|a, b| a.0.cmp(&b.0));
            v
        };
        let (a, b, c) = (make(1), make(1), make(2));
        for ((n, x), (_, y)) in a.iter().zip(&b) {
            assert!(x.equal(y), "{n}");
        }
        assert!(!a[0].1.equal(&c[0].1));
        for (n, t) in &a {
            let max = f64::try_from(t.abs().max()).unwrap();
            let fan_in = if n.starts_with("td_fc0") {
                STATE_SIZE as f64
            } else {
                16.0
            };
            assert!(max <= 1.0 / fan_in.sqrt() + 1e-6, "{n}: {max}");
        }
    }

    #[test]
    fn mover_relative_features_are_the_same_board_seen_from_either_side() {
        use pogofish_engine::testing::with_to_move;
        let s0 = initial_state();
        let x = TdFeatures::MoverRelative.encode(&s0);
        assert_eq!(x.len(), MOVER_RELATIVE_SIZE);
        let w = MAX_STACK + 2;
        // White to move: cell 0 is White's (+1 top, height 2/12), cell 8 Red's.
        assert_eq!(&x[0..3], &[1.0, 1.0, 0.0]);
        assert_eq!((x[MAX_STACK], x[MAX_STACK + 1]), (1.0, 2.0 / 12.0));
        assert_eq!(x[8 * w + MAX_STACK], -1.0);
        assert_eq!(x[4 * w + MAX_STACK], 0.0, "empty centre");
        // Same board, Red to move: every sign flips.
        let y = TdFeatures::MoverRelative.encode(&with_to_move(&s0, Color::Red));
        for i in 0..x.len() {
            if i % w == MAX_STACK + 1 {
                assert_eq!(x[i], y[i]);
            } else {
                assert_eq!(x[i], -y[i], "feature {i}");
            }
        }
    }
}
