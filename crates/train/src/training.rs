use crate::gatekeeper::gatekeeper;
use crate::metrics::append_metrics;
use crate::net::{make_var_store, ArchConfig, AzNet};
use crate::selfplay::{play_one_game, SelfPlayConfig, TrainingExample};
use anyhow::Context;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tch::{
    nn::{self, OptimizerConfig},
    Device, Kind, Tensor,
};
use pogofish_engine::RuleSet;

pub struct TrainConfig {
    pub iterations: u32,
    pub games_per_iteration: u32,
    pub num_simulations: u32,
    pub arch: ArchConfig,
    pub c_puct: f32,
    pub lr: f64,
    pub lr_end: f64,
    pub weight_decay: f64,
    pub batch_size: usize,
    pub training_epochs: u32,
    pub window_capacity: usize,
    pub dirichlet_alpha: f32,
    pub dirichlet_epsilon: f32,
    pub gatekeeper_games: u32,
    pub gatekeeper_threshold: f64,
    pub max_moves: u16,
    pub output_dir: PathBuf,
}

impl Default for TrainConfig {
    fn default() -> Self {
        Self {
            iterations: 100,
            games_per_iteration: 100,
            num_simulations: 100,
            arch: ArchConfig::mlp_small(),
            c_puct: 1.5,
            lr: 1e-3,
            lr_end: 1e-4,
            weight_decay: 1e-4,
            batch_size: 256,
            training_epochs: 5,
            window_capacity: 500,
            dirichlet_alpha: 0.3,
            dirichlet_epsilon: 0.25,
            gatekeeper_games: 80,
            gatekeeper_threshold: 0.55,
            max_moves: 200,
            output_dir: PathBuf::from("models/alphazero"),
        }
    }
}

/// Sliding window of training examples across recent iterations.
struct GameWindow {
    games: VecDeque<Vec<TrainingExample>>,
    capacity: usize,
}

impl GameWindow {
    fn new(capacity: usize) -> Self {
        Self { games: VecDeque::new(), capacity }
    }

    fn push(&mut self, game: Vec<TrainingExample>) {
        if self.games.len() >= self.capacity {
            self.games.pop_front();
        }
        self.games.push_back(game);
    }

    fn collect_examples(&self) -> (Vec<Tensor>, Vec<Tensor>, Vec<f32>) {
        let mut states = Vec::new();
        let mut policies = Vec::new();
        let mut values = Vec::new();
        for game in &self.games {
            for ex in game {
                states.push(ex.state.shallow_clone());
                policies.push(ex.policy.shallow_clone());
                values.push(ex.value);
            }
        }
        (states, policies, values)
    }

    fn total_examples(&self) -> usize {
        self.games.iter().map(|g| g.len()).sum()
    }

    /// Evict the oldest 50% of games from the window.
    /// Called after a gatekeeper adoption to flush stale self-play data from
    /// earlier model generations, so the challenger trains on fresher examples.
    fn evict_oldest_half(&mut self) {
        let half = self.games.len() / 2;
        for _ in 0..half {
            self.games.pop_front();
        }
    }
}

/// Count completed iterations by reading existing metrics.jsonl lines.
fn count_completed_iterations(metrics_path: &std::path::Path) -> u32 {
    match std::fs::read_to_string(metrics_path) {
        Ok(content) => content.lines().filter(|l| !l.trim().is_empty()).count() as u32,
        Err(_) => 0,
    }
}

/// Main AlphaZero training loop.
///
/// Crash-safe: metrics are appended per iteration, model_best.pt is saved on
/// every adoption, and SIGINT triggers a graceful shutdown saving the current
/// best model before exiting. Resumes from the last completed iteration.
pub fn train(rules: &RuleSet, cfg: &TrainConfig) -> anyhow::Result<()> {
    std::fs::create_dir_all(&cfg.output_dir)
        .with_context(|| format!("creating output dir: {}", cfg.output_dir.display()))?;

    let metrics_path = cfg.output_dir.join("metrics.jsonl");
    let best_path = cfg.output_dir.join("model_best.pt");

    // --- SIGINT handler ---
    let interrupted = Arc::new(AtomicBool::new(false));
    let interrupted_clone = interrupted.clone();
    ctrlc_handler(&interrupted_clone);

    // --- Resume detection ---
    let start_iteration = count_completed_iterations(&metrics_path) + 1;
    if start_iteration > 1 {
        println!("Resuming from iteration {start_iteration} ({} already completed)", start_iteration - 1);
    }

    // Initialise best net
    let mut best_vs = make_var_store();
    let mut best_net = AzNet::from_config(&best_vs.root(), &cfg.arch);

    // Load existing best model if resuming
    if start_iteration > 1 && best_path.exists() {
        best_vs.load(&best_path).context("loading existing best model for resume")?;
        println!("Loaded best model from {}", best_path.display());
    } else {
        best_vs.save(&best_path).context("saving initial best model")?;
    }

    let mut window = GameWindow::new(cfg.window_capacity);
    let selfplay_cfg = SelfPlayConfig {
        num_simulations: cfg.num_simulations,
        c_puct: cfg.c_puct,
        max_moves: cfg.max_moves,
        dirichlet_alpha: cfg.dirichlet_alpha,
        dirichlet_epsilon: cfg.dirichlet_epsilon,
    };

    let train_start = Instant::now();
    let mut last_adoption_iter: u32 = 0;
    let mut best_loss: f64 = f64::MAX;

    for iteration in start_iteration..=cfg.iterations {
        if interrupted.load(Ordering::Relaxed) {
            println!("\nInterrupted before iteration {iteration}. Saving best model...");
            best_vs.save(&best_path).context("saving best model on interrupt")?;
            println!("Best model saved to {}. Safe to exit.", best_path.display());
            return Ok(());
        }

        let iter_start = Instant::now();
        println!("=== Iteration {}/{} ===", iteration, cfg.iterations);

        // --- Self-play phase ---
        println!("  Self-play: {} games...", cfg.games_per_iteration);
        for game_idx in 0..cfg.games_per_iteration {
            if interrupted.load(Ordering::Relaxed) {
                println!("\n  Interrupted during self-play. Saving best model...");
                best_vs.save(&best_path).context("saving best model on interrupt")?;
                println!("  Best model saved to {}. Safe to exit.", best_path.display());
                return Ok(());
            }

            let examples = play_one_game(&best_net, rules, &selfplay_cfg);
            window.push(examples);
            if (game_idx + 1) % 10 == 0 || game_idx + 1 == cfg.games_per_iteration {
                print!("\r  Self-play {}/{}", game_idx + 1, cfg.games_per_iteration);
                use std::io::Write;
                let _ = std::io::stdout().flush();
            }
        }
        println!();
        println!("  Window: {} examples", window.total_examples());

        // --- Training phase ---
        let (states, policies, values) = window.collect_examples();
        let n = states.len();
        if n < cfg.batch_size {
            println!("  Skipping training: not enough examples ({n})");
            continue;
        }

        let mut challenger_vs = make_var_store();
        let challenger_net = AzNet::from_config(&challenger_vs.root(), &cfg.arch);
        challenger_vs.copy(&best_vs).context("copying best weights to challenger")?;

        // Cosine LR with warm restart after each adoption.
        // After adoption, reset the cycle so the new model gets a full LR burst
        // on fresh self-play data. Cap each mini-cycle at 30 iterations.
        let cycle_len = 30u32;
        let t_since_adopt =
            (iteration - 1 - last_adoption_iter).min(cycle_len) as f64 / cycle_len as f64;
        let lr = cfg.lr_end
            + 0.5 * (cfg.lr - cfg.lr_end) * (1.0 + (std::f64::consts::PI * t_since_adopt).cos());

        let mut opt = nn::Adam::default().build(&challenger_vs, lr)?;
        opt.set_weight_decay(cfg.weight_decay);

        let states_tensor = Tensor::stack(&states, 0).to_kind(Kind::Float);
        let policies_tensor = Tensor::stack(&policies, 0).to_kind(Kind::Float);
        let values_tensor = Tensor::from_slice(&values).unsqueeze(1).to_kind(Kind::Float);

        println!("  Training: {} epochs on {} examples (lr={:.6})", cfg.training_epochs, n, lr);

        let mut last_avg_loss = 0f64;
        for epoch in 1..=cfg.training_epochs {
            let perm = Tensor::randperm(n as i64, (Kind::Int64, Device::Cpu));
            let mut total_loss = 0f64;
            let mut num_batches = 0usize;

            let mut start = 0i64;
            while start < n as i64 {
                let end = (start + cfg.batch_size as i64).min(n as i64);
                let idx = perm.narrow(0, start, end - start);

                let s_batch = states_tensor.index_select(0, &idx);
                let p_batch = policies_tensor.index_select(0, &idx);
                let v_batch = values_tensor.index_select(0, &idx);

                let (policy_logits, value_pred) = challenger_net.forward(&s_batch);

                let log_probs = policy_logits.log_softmax(-1, Kind::Float);
                let policy_loss = -(p_batch * log_probs).sum_dim_intlist(&[-1i64][..], false, Kind::Float).mean(Kind::Float);
                let value_loss = (value_pred - v_batch).pow_tensor_scalar(2).mean(Kind::Float);
                let loss = policy_loss + value_loss;

                opt.backward_step(&loss);

                total_loss += f64::try_from(loss.detach()).unwrap_or(0.0);
                num_batches += 1;
                start = end;
            }

            if num_batches > 0 {
                last_avg_loss = total_loss / num_batches as f64;
                println!("    Epoch {}/{}: avg_loss={:.4}", epoch, cfg.training_epochs, last_avg_loss);
            }
        }

        if last_avg_loss < best_loss {
            best_loss = last_avg_loss;
        }

        // --- Gatekeeper phase ---
        println!("  Gatekeeper: {} games...", cfg.gatekeeper_games);
        let result = gatekeeper(
            &challenger_net,
            &best_net,
            rules,
            cfg.gatekeeper_games,
            cfg.num_simulations,
            cfg.c_puct,
            cfg.max_moves,
            0.1, // slight randomness to break determinism; still mostly picks best move
        );
        println!(
            "  Challenger: win_rate={:.3} (W:{} L:{} D:{})",
            result.win_rate, result.wins, result.losses, result.draws
        );

        let adopted = result.win_rate >= cfg.gatekeeper_threshold;
        if adopted {
            println!("  Challenger ACCEPTED");
            best_vs = challenger_vs;
            let mut new_best_vs = make_var_store();
            let new_best_net = AzNet::from_config(&new_best_vs.root(), &cfg.arch);
            new_best_vs.copy(&best_vs).context("promoting challenger to best")?;
            best_vs = new_best_vs;
            best_net = new_best_net;
            best_vs.save(&best_path).context("saving best model")?;
            // Flush stale examples from earlier generations so the new model
            // trains primarily on data it generated.
            window.evict_oldest_half();
            last_adoption_iter = iteration;
            println!("  Window after eviction: {} examples", window.total_examples());
        } else {
            println!("  Challenger REJECTED");
        }

        // Save checkpoint (always, so we can resume even without adoption)
        let checkpoint_path = cfg.output_dir.join(format!("checkpoint_{iteration:04}.pt"));
        best_vs.save(&checkpoint_path).context("saving checkpoint")?;

        // --- Metrics ---
        let iter_secs = iter_start.elapsed().as_secs_f64();
        let total_secs = train_start.elapsed().as_secs_f64();
        let remaining = (cfg.iterations - iteration) as f64 * iter_secs;
        let eta_h = remaining / 3600.0;

        let entry = serde_json::json!({
            "iteration": iteration,
            "window_examples": window.total_examples(),
            "avg_loss": (last_avg_loss * 10000.0).round() / 10000.0,
            "best_loss": if best_loss == f64::MAX { serde_json::Value::Null } else { serde_json::json!((best_loss * 10000.0).round() / 10000.0) },
            "lr": (lr * 1e8).round() / 1e8,
            "gatekeeper_win_rate": result.win_rate,
            "gatekeeper_wins": result.wins,
            "gatekeeper_losses": result.losses,
            "gatekeeper_draws": result.draws,
            "adopted": adopted,
            "iter_seconds": (iter_secs * 10.0).round() / 10.0,
            "total_seconds": (total_secs * 10.0).round() / 10.0,
            "eta_hours": (eta_h * 100.0).round() / 100.0,
        });
        append_metrics(&metrics_path, &entry).context("writing metrics")?;

        println!("  Iter: {iter_secs:.0}s | Total: {total_secs:.0}s | ETA: {eta_h:.1}h");
    }

    println!("Training complete. Best model saved to {}", best_path.display());
    Ok(())
}

/// Register a Ctrl+C handler that sets the flag instead of killing the process.
fn ctrlc_handler(flag: &Arc<AtomicBool>) {
    let f = flag.clone();
    let _ = unsafe {
        libc::signal(libc::SIGINT, sigint_handler as libc::sighandler_t)
    };
    // Store the flag in a static so the signal handler can access it
    INTERRUPTED.store(flag.as_ref() as *const AtomicBool as usize, Ordering::SeqCst);
    let _ = f; // keep the arc alive
}

static INTERRUPTED: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

extern "C" fn sigint_handler(_sig: libc::c_int) {
    let ptr = INTERRUPTED.load(Ordering::SeqCst);
    if ptr != 0 {
        let flag = unsafe { &*(ptr as *const AtomicBool) };
        flag.store(true, Ordering::SeqCst);
    }
}
