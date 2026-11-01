//! Strategic principles from the bundled AlphaZero net, kept only if they
//! survive the arena (docs/experiments/v2-principles.md).
//!
//!     cargo run --release -p pogofish-infer --example principles -- lenses \
//!         --net-games 600 --greedy-games 200 --seed 1 --out docs/experiments/v2-principles/lenses.json
//!     cargo run --release -p pogofish-infer --example principles -- explore \
//!         --lenses docs/experiments/v2-principles/lenses.json --pairs 500 --seed 101 \
//!         --out docs/experiments/v2-principles/explore.json
//!     cargo run --release -p pogofish-infer --example principles -- confirm \
//!         --explore docs/experiments/v2-principles/explore.json --pairs 1000 --seed 202 \
//!         --combined-seed 303 --out docs/experiments/v2-principles/confirm.json
//!
//! `lenses` plays the net (100 simulations; the first 10 plies sampled at
//! temperature 1) and greedy, and describes the positions three ways: what
//! explains the net's value (a), which move features the net's choice
//! prefers (b), and which features predict the winner of net games (c).
//! `explore` turns each feature into a player (greedy + weight · feature,
//! sign from lens b) and picks a weight per feature on one arena seed;
//! `confirm` replays the picks on a fresh seed with fresh openings. Both run
//! the controls. Ruleset `lc1-2` throughout.

use pogofish_engine::{
    apply_move, apply_move_under, initial_state, is_terminal, legal_moves, GameState,
    RuleSet,
};
use pogofish_infer::mcts::{sample, search, visit_distribution, MctsConfig};
use pogofish_infer::mlp::Mlp;
use pogofish_search::arena::{run_match, Agent, ArenaConfig, ArenaReport};
use pogofish_search::players::Scripted;
use pogofish_search::principles::{features, GreedyTwoPly, Heuristic, FEATURE_NAMES, NUM_FEATURES};
use pogofish_search::rng::SplitMix64;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

const NET: &str = "crates/cli/assets/az-lc1-s1.pfw";
const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };
const SIMS: u32 = 100;
const SAMPLED_PLIES: u16 = 10;
const MAX_PLIES: u32 = 1000;
const OPENING_PLIES: u32 = 4;
const THREADS: usize = 8;
/// Weight grid, in top-equivalents per standard deviation of the feature
/// across candidate moves (lens b). 0.05 acts as a tie-break.
const GRID: [f64; 5] = [0.05, 0.25, 0.5, 1.0, 2.0];
/// Pre-set rule: a feature goes to confirmation when its best exploration
/// score is at least this.
const ADVANCE_AT: f64 = 0.52;

type F = [f64; NUM_FEATURES];

struct Sample {
    source: &'static str,
    ply: u16,
    before: F,
    value: f32,
    /// After-move features (mover's side) of every move that does not lose at
    /// once.
    alts: Vec<F>,
    /// Index in `alts` of the net's most-visited move, if it is among them.
    net_choice: Option<usize>,
    greedy_best: Vec<usize>,
    /// 1 if the mover went on to win, 0 if it lost; `None` for greedy games
    /// and unfinished ones.
    mover_won: Option<f64>,
}

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1).cloned())
}

fn need(args: &[String], name: &str) -> anyhow::Result<String> {
    arg(args, name).ok_or_else(|| anyhow::anyhow!("missing {name}"))
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("lenses") => lenses(&args),
        Some("explore") => explore(&args),
        Some("confirm") => confirm(&args),
        _ => anyhow::bail!("usage: principles lenses|explore|confirm …"),
    }
}

/// Run `n` jobs on `THREADS` threads, results in job order.
fn par_map<T: Send>(n: usize, job: impl Fn(usize) -> T + Sync) -> Vec<T> {
    let next = AtomicUsize::new(0);
    let out: Mutex<Vec<Option<T>>> = Mutex::new((0..n).map(|_| None).collect());
    std::thread::scope(|s| {
        for _ in 0..THREADS {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= n {
                    break;
                }
                let r = job(i);
                out.lock().unwrap()[i] = Some(r);
            });
        }
    });
    out.into_inner()
        .unwrap()
        .into_iter()
        .map(|x| x.unwrap())
        .collect()
}

// ---------------------------------------------------------------- lenses

fn describe(net: &Mlp, s: &GameState, best: pogofish_engine::Move, source: &'static str) -> Sample {
    let mover = s.to_move();
    let mut alts = Vec::new();
    let mut tops = Vec::new();
    let mut net_choice = None;
    for m in legal_moves(s) {
        let next = apply_move(s, m).expect("legal");
        let loses = is_terminal(&next, &RULES).is_some_and(|o| o.winner() != Some(mover));
        if loses {
            continue;
        }
        if m == best {
            net_choice = Some(alts.len());
        }
        let f = features(&next, mover);
        tops.push(f[0]);
        alts.push(f);
    }
    let max = tops.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let greedy_best = (0..tops.len()).filter(|&i| tops[i] == max).collect();
    Sample {
        source,
        ply: s.move_count(),
        before: features(s, mover),
        value: net.forward(&net.features.encode(s)).1,
        alts,
        net_choice,
        greedy_best,
        mover_won: None,
    }
}

fn net_game(net: &Mlp, seed: u64) -> Vec<Sample> {
    let cfg = MctsConfig {
        num_simulations: SIMS,
        ..MctsConfig::default()
    };
    let mut rng = SplitMix64::new(seed);
    let mut s = initial_state();
    let mut out = Vec::new();
    let mut movers = Vec::new();
    let winner = loop {
        if let Some(o) = is_terminal(&s, &RULES) {
            break o.winner();
        }
        if s.move_count() as u32 >= MAX_PLIES {
            break None;
        }
        let r = search(net, &s, &RULES, &cfg, None);
        let best = r.best_move();
        let m = if s.move_count() < SAMPLED_PLIES {
            let counts: Vec<u32> = r.visits.iter().map(|&(_, v)| v).collect();
            r.visits[sample(&visit_distribution(&counts, 1.0), &mut rng)].0
        } else {
            best
        };
        out.push(describe(net, &s, best, "net"));
        movers.push(s.to_move());
        s = apply_move_under(&s, m, &RULES).expect("legal");
    };
    if let Some(w) = winner {
        for (x, mover) in out.iter_mut().zip(movers) {
            x.mover_won = Some((mover == w) as u8 as f64);
        }
    }
    out
}

fn greedy_game(net: &Mlp, seed: u64) -> Vec<Sample> {
    let cfg = MctsConfig {
        num_simulations: SIMS,
        ..MctsConfig::default()
    };
    let mut rng = SplitMix64::new(seed);
    let mut s = initial_state();
    let mut out = Vec::new();
    while is_terminal(&s, &RULES).is_none() && (s.move_count() as u32) < MAX_PLIES {
        let best = search(net, &s, &RULES, &cfg, None).best_move();
        out.push(describe(net, &s, best, "greedy"));
        let m = Scripted::Greedy.choose(&s, &RULES, &mut rng);
        s = apply_move_under(&s, m, &RULES).expect("legal");
    }
    out
}

fn mean_sd(xs: impl Iterator<Item = F>) -> (F, F, usize) {
    let v: Vec<F> = xs.collect();
    let n = v.len().max(1) as f64;
    let mut mean = [0.0; NUM_FEATURES];
    let mut sd = [0.0; NUM_FEATURES];
    for x in &v {
        for i in 0..NUM_FEATURES {
            mean[i] += x[i] / n;
        }
    }
    for x in &v {
        for i in 0..NUM_FEATURES {
            sd[i] += (x[i] - mean[i]).powi(2) / n;
        }
    }
    sd.iter_mut().for_each(|s| *s = s.sqrt());
    (mean, sd, v.len())
}

/// Solve `a x = b` (Gaussian elimination, partial pivoting).
fn solve(mut a: Vec<Vec<f64>>, mut b: Vec<f64>) -> Vec<f64> {
    let n = b.len();
    for c in 0..n {
        let p = (c..n)
            .max_by(|&i, &j| a[i][c].abs().total_cmp(&a[j][c].abs()))
            .unwrap();
        a.swap(c, p);
        b.swap(c, p);
        for r in c + 1..n {
            let k = a[r][c] / a[c][c];
            let pivot = a[c].clone();
            for (x, p) in a[r][c..].iter_mut().zip(&pivot[c..]) {
                *x -= k * p;
            }
            b[r] -= k * b[c];
        }
    }
    let mut x = vec![0.0; n];
    for r in (0..n).rev() {
        let s: f64 = (r + 1..n).map(|j| a[r][j] * x[j]).sum();
        x[r] = (b[r] - s) / a[r][r];
    }
    x
}

/// Ridge-stabilised least squares of `y` on standardised columns `cols` of
/// `x` (plus intercept). Returns (coefficients per column, R²).
fn ols(x: &[F], y: &[f64], cols: &[usize], mean: &F, sd: &F) -> (Vec<f64>, f64) {
    let k = cols.len() + 1;
    let row = |f: &F| -> Vec<f64> {
        std::iter::once(1.0)
            .chain(cols.iter().map(|&c| (f[c] - mean[c]) / sd[c]))
            .collect()
    };
    let mut a = vec![vec![0.0; k]; k];
    let mut b = vec![0.0; k];
    for (f, &t) in x.iter().zip(y) {
        let r = row(f);
        for i in 0..k {
            b[i] += r[i] * t;
            for j in 0..k {
                a[i][j] += r[i] * r[j];
            }
        }
    }
    for (i, ai) in a.iter_mut().enumerate().skip(1) {
        ai[i] += 1e-6 * x.len() as f64;
    }
    let beta = solve(a, b);
    let ym = y.iter().sum::<f64>() / y.len() as f64;
    let (mut ss_res, mut ss_tot) = (0.0, 0.0);
    for (f, &t) in x.iter().zip(y) {
        let p: f64 = row(f).iter().zip(&beta).map(|(a, b)| a * b).sum();
        ss_res += (t - p).powi(2);
        ss_tot += (t - ym).powi(2);
    }
    (beta[1..].to_vec(), 1.0 - ss_res / ss_tot)
}

fn corr(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len() as f64;
    let (mx, my) = (x.iter().sum::<f64>() / n, y.iter().sum::<f64>() / n);
    let (mut sxy, mut sxx, mut syy) = (0.0, 0.0, 0.0);
    for (a, b) in x.iter().zip(y) {
        sxy += (a - mx) * (b - my);
        sxx += (a - mx).powi(2);
        syy += (b - my).powi(2);
    }
    if sxx == 0.0 || syy == 0.0 {
        f64::NAN
    } else {
        sxy / (sxx * syy).sqrt()
    }
}

/// L2 penalty of the conditional logit, on standardised coefficients.
const CLOGIT_RIDGE: f64 = 1.0;

/// Penalised log-likelihood, gradient and (negated) Hessian at `beta`.
fn clogit_terms(zs: &[(Vec<Vec<f64>>, usize)], beta: &[f64]) -> (f64, Vec<f64>, Vec<Vec<f64>>) {
    let k = beta.len();
    let mut g = vec![0.0; k];
    let mut h = vec![vec![0.0; k]; k];
    let mut ll = 0.0;
    for (alts, c) in zs {
        let u: Vec<f64> = alts
            .iter()
            .map(|a| a.iter().zip(beta).map(|(x, b)| x * b).sum())
            .collect();
        let mx = u.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let e: Vec<f64> = u.iter().map(|x| (x - mx).exp()).collect();
        let tot: f64 = e.iter().sum();
        ll += u[*c] - mx - tot.ln();
        let mut m = vec![0.0; k];
        for (a, ei) in alts.iter().zip(&e) {
            for i in 0..k {
                m[i] += ei / tot * a[i];
            }
        }
        for i in 0..k {
            g[i] += alts[*c][i] - m[i];
        }
        for (a, ei) in alts.iter().zip(&e) {
            let p = ei / tot;
            for i in 0..k {
                for j in 0..k {
                    h[i][j] += p * (a[i] - m[i]) * (a[j] - m[j]);
                }
            }
        }
    }
    for i in 0..k {
        ll -= 0.5 * CLOGIT_RIDGE * beta[i] * beta[i];
        g[i] -= CLOGIT_RIDGE * beta[i];
        h[i][i] += CLOGIT_RIDGE;
    }
    (ll, g, h)
}

/// Conditional logit (McFadden) of the net's choice among the alternatives,
/// on standardised columns `cols`: ridge-penalised Newton with step halving.
/// Returns (coefficients, unpenalised log-likelihood, top-1 accuracy of the
/// fitted utility, ties counted as 1 / number tied).
fn clogit(set: &[&Sample], cols: &[usize], mean: &F, sd: &F) -> (Vec<f64>, f64, f64) {
    let k = cols.len();
    let z = |f: &F| -> Vec<f64> { cols.iter().map(|&c| (f[c] - mean[c]) / sd[c]).collect() };
    let zs: Vec<(Vec<Vec<f64>>, usize)> = set
        .iter()
        .map(|s| (s.alts.iter().map(z).collect(), s.net_choice.unwrap()))
        .collect();
    let mut beta = vec![0.0; k];
    let (mut ll, mut g, mut h) = clogit_terms(&zs, &beta);
    for _ in 0..100 {
        let step = solve(h.clone(), g.clone());
        let mut t = 1.0;
        let mut moved = false;
        while t > 1e-6 {
            let cand: Vec<f64> = beta.iter().zip(&step).map(|(b, s)| b + t * s).collect();
            let (ll2, g2, h2) = clogit_terms(&zs, &cand);
            if ll2 >= ll {
                moved = ll2 - ll > 1e-9;
                (beta, ll, g, h) = (cand, ll2, g2, h2);
                break;
            }
            t /= 2.0;
        }
        if !moved {
            break;
        }
    }
    let penalty: f64 = beta.iter().map(|b| 0.5 * CLOGIT_RIDGE * b * b).sum();
    let hits: f64 = zs
        .iter()
        .map(|(alts, c)| {
            let u: Vec<f64> = alts
                .iter()
                .map(|a| a.iter().zip(&beta).map(|(x, b)| x * b).sum())
                .collect();
            let best = u.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            let tied = u.iter().filter(|&&x| x >= best - 1e-12).count();
            if u[*c] >= best - 1e-12 {
                1.0 / tied as f64
            } else {
                0.0
            }
        })
        .sum();
    (beta, ll + penalty, hits / zs.len() as f64)
}

fn lenses(args: &[String]) -> anyhow::Result<()> {
    let net_games: usize = need(args, "--net-games")?.parse()?;
    let greedy_games: usize = need(args, "--greedy-games")?.parse()?;
    let seed: u64 = need(args, "--seed")?.parse()?;
    let out = need(args, "--out")?;
    let net = Mlp::from_bytes(&std::fs::read(NET)?)?;
    let t0 = Instant::now();
    let games = par_map(net_games + greedy_games, |i| {
        let gs = pogofish_search::measure::game_seed(seed, 31, i as u64);
        if i < net_games {
            net_game(&net, gs)
        } else {
            greedy_game(&net, gs)
        }
    });
    let elapsed = t0.elapsed().as_secs_f64();
    let unfinished_net = games[..net_games]
        .iter()
        .filter(|g| g.first().is_some_and(|s| s.mover_won.is_none()))
        .count();
    let samples: Vec<Sample> = games.into_iter().flatten().collect();
    let n_net = samples.iter().filter(|s| s.source == "net").count();
    eprintln!(
        "{} positions ({} from net games) in {elapsed:.1} s",
        samples.len(),
        n_net
    );

    // Lens (a): the net's raw value, position before the move, mover's side.
    let (mean_b, sd_b, _) = mean_sd(samples.iter().map(|s| s.before));
    let cols_a: Vec<usize> = (0..NUM_FEATURES).filter(|&i| sd_b[i] > 0.0).collect();
    let xb: Vec<F> = samples.iter().map(|s| s.before).collect();
    let yv: Vec<f64> = samples.iter().map(|s| s.value as f64).collect();
    let (beta_a, r2_a) = ols(&xb, &yv, &cols_a, &mean_b, &sd_b);
    let (_, r2_a_top) = ols(&xb, &yv, &[0], &mean_b, &sd_b);
    let lens_a: Vec<Value> = cols_a
        .iter()
        .zip(&beta_a)
        .map(|(&c, b)| {
            let col: Vec<f64> = xb.iter().map(|f| f[c]).collect();
            json!({"feature": FEATURE_NAMES[c], "std_coef": b, "corr": corr(&col, &yv),
                   "mean": mean_b[c], "sd": sd_b[c]})
        })
        .collect();

    // Lens (b): the net's choice among moves that do not lose at once, in
    // positions with no winning move and at least two such moves.
    let set_b: Vec<&Sample> = samples
        .iter()
        .filter(|s| s.before[16] == 0.0 && s.alts.len() >= 2 && s.net_choice.is_some())
        .collect();
    let (mean_alt, sd_alt, _) = mean_sd(set_b.iter().flat_map(|s| s.alts.iter().copied()));
    let cols_b: Vec<usize> = (0..NUM_FEATURES).filter(|&i| sd_alt[i] > 0.0).collect();
    let (beta_b, ll_b, acc_b) = clogit(&set_b, &cols_b, &mean_alt, &sd_alt);
    let (beta_b_top, ll_b_top, acc_b_top) = clogit(&set_b, &[0], &mean_alt, &sd_alt);
    // How the after-move features move together across candidate moves.
    let alt_corr: Vec<Vec<f64>> = {
        let all: Vec<F> = set_b.iter().flat_map(|s| s.alts.iter().copied()).collect();
        let col = |c: usize| -> Vec<f64> { all.iter().map(|f| f[c]).collect() };
        let cols: Vec<Vec<f64>> = (0..NUM_FEATURES).map(col).collect();
        (0..NUM_FEATURES)
            .map(|i| (0..NUM_FEATURES).map(|j| corr(&cols[i], &cols[j])).collect())
            .collect()
    };
    let ll0: f64 = set_b.iter().map(|s| -(s.alts.len() as f64).ln()).sum();
    let zf = |f: &F, c: usize| (f[c] - mean_alt[c]) / sd_alt[c];
    let avg = |s: &Sample, idx: &mut dyn Iterator<Item = usize>, c: usize| {
        let v: Vec<f64> = idx.map(|i| zf(&s.alts[i], c)).collect();
        v.iter().sum::<f64>() / v.len() as f64
    };
    let disagree: Vec<&&Sample> = set_b
        .iter()
        .filter(|s| !s.greedy_best.contains(&s.net_choice.unwrap()))
        .collect();
    let lens_b: Vec<Value> = cols_b
        .iter()
        .zip(&beta_b)
        .map(|(&c, b)| {
            let n = set_b.len() as f64;
            let vs_all = set_b
                .iter()
                .map(|s| zf(&s.alts[s.net_choice.unwrap()], c) - avg(s, &mut (0..s.alts.len()), c))
                .sum::<f64>()
                / n;
            let vs_greedy = disagree
                .iter()
                .map(|s| {
                    zf(&s.alts[s.net_choice.unwrap()], c)
                        - avg(s, &mut s.greedy_best.iter().copied(), c)
                })
                .sum::<f64>()
                / disagree.len().max(1) as f64;
            // The net's preference for this feature once the top difference is
            // accounted for: what a greedy-plus-one-term player adds.
            let (pair, _, _) = if c == 0 {
                (vec![f64::NAN, f64::NAN], 0.0, 0.0)
            } else {
                clogit(&set_b, &[0, c], &mean_alt, &sd_alt)
            };
            json!({"feature": FEATURE_NAMES[c], "clogit_coef": b,
                   "coef_given_top_diff": pair[1],
                   "chosen_minus_mean_alt_sd": vs_all,
                   "chosen_minus_greedy_best_sd_when_disagreeing": vs_greedy,
                   "sd_across_moves": sd_alt[c]})
        })
        .collect();

    // Lens (c): which features of the position, mover's side, predict that
    // the mover wins a net game, by ply.
    let buckets: [(u16, u16); 5] = [(0, 4), (4, 8), (8, 12), (12, 20), (20, u16::MAX)];
    let lens_c: Vec<Value> = buckets
        .iter()
        .map(|&(lo, hi)| {
            let set: Vec<&Sample> = samples
                .iter()
                .filter(|s| s.mover_won.is_some() && s.ply >= lo && s.ply < hi)
                .collect();
            let y: Vec<f64> = set.iter().map(|s| s.mover_won.unwrap()).collect();
            let per: Vec<Value> = (0..NUM_FEATURES)
                .map(|c| {
                    let x: Vec<f64> = set.iter().map(|s| s.before[c]).collect();
                    json!({"feature": FEATURE_NAMES[c], "corr_with_mover_win": corr(&x, &y)})
                })
                .collect();
            let x: Vec<F> = set.iter().map(|s| s.before).collect();
            let (m, sd, _) = mean_sd(x.iter().copied());
            let cols: Vec<usize> = (0..NUM_FEATURES).filter(|&i| sd[i] > 0.0).collect();
            let r2 = if set.len() > 50 {
                ols(&x, &y, &cols, &m, &sd).1
            } else {
                f64::NAN
            };
            let r2_top = if set.len() > 50 {
                ols(&x, &y, &[0], &m, &sd).1
            } else {
                f64::NAN
            };
            json!({"plies": [lo, hi.min(9999)], "positions": set.len(),
                   "mover_win_rate": y.iter().sum::<f64>() / y.len().max(1) as f64,
                   "linear_r2_all": r2, "linear_r2_top_diff": r2_top, "features": per})
        })
        .collect();

    let report = json!({
        "net": NET, "rules": RULES.to_string(), "simulations": SIMS,
        "sampled_plies_at_temperature_1": SAMPLED_PLIES, "seed": seed,
        "net_games": net_games, "greedy_games": greedy_games,
        "unfinished_net_games": unfinished_net,
        "positions": samples.len(), "positions_from_net_games": n_net,
        "seconds": elapsed,
        "lens_a_value": {"target": "raw net value, position before the move, mover's side",
            "r2_all": r2_a, "r2_top_diff_only": r2_a_top, "features": lens_a},
        "lens_b_choice": {"positions": set_b.len(),
            "net_move_outside_greedy_best": disagree.len(),
            "loglik_uniform": ll0, "loglik_all": ll_b, "loglik_top_diff_only": ll_b_top,
            "mcfadden_r2_all": 1.0 - ll_b / ll0, "mcfadden_r2_top_diff_only": 1.0 - ll_b_top / ll0,
            "top1_accuracy_all": acc_b, "top1_accuracy_top_diff_only": acc_b_top,
            "top_diff_only_coef": beta_b_top[0], "features": lens_b,
            "feature_names": FEATURE_NAMES, "after_move_feature_correlations": alt_corr},
        "lens_c_outcome": lens_c,
    });
    std::fs::write(&out, serde_json::to_string_pretty(&report)?)?;
    eprintln!("wrote {out}");
    Ok(())
}

// ---------------------------------------------------------------- arena

#[derive(Clone)]
enum Player {
    Greedy,
    Random,
    TwoPly,
    H(Heuristic),
}

impl Player {
    fn agent(&self) -> Box<dyn Agent> {
        match self {
            Player::Greedy => Box::new(Scripted::Greedy),
            Player::Random => Box::new(Scripted::Random),
            Player::TwoPly => Box::new(GreedyTwoPly),
            Player::H(h) => Box::new(h.clone()),
        }
    }
}

struct Match {
    role: String,
    feature: Option<usize>,
    k: Option<f64>,
    a: Player,
}

fn arena_cfg(pairs: u32, seed: u64) -> ArenaConfig {
    ArenaConfig::new(RULES, pairs, OPENING_PLIES, MAX_PLIES, seed)
}

fn run_all(matches: &[Match], pairs: u32, seed: u64) -> Vec<(ArenaReport, f64)> {
    run_against(matches, &Player::Greedy, pairs, seed)
}

fn run_against(
    matches: &[Match],
    opponent: &Player,
    pairs: u32,
    seed: u64,
) -> Vec<(ArenaReport, f64)> {
    par_map(matches.len(), |i| {
        let t = Instant::now();
        let mut a = matches[i].a.agent();
        let mut b = opponent.agent();
        let r = run_match(a.as_mut(), b.as_mut(), &arena_cfg(pairs, seed)).expect("arena");
        (r, t.elapsed().as_secs_f64())
    })
}

fn controls() -> Vec<Match> {
    let c = |role: &str, a: Player| Match {
        role: role.into(),
        feature: None,
        k: None,
        a,
    };
    vec![
        c("control: greedy vs greedy (expect 0.5)", Player::Greedy),
        c(
            "control: heuristic with greedy's weights vs greedy (expect 0.5)",
            Player::H(Heuristic::greedy_plus("heuristic-greedy", 0, 0.0)),
        ),
        c(
            "control: negated top difference vs greedy (expect clearly < 0.5)",
            Player::H(Heuristic::greedy_plus("negated-top-diff", 0, -2.0)),
        ),
        c(
            "control: random vs greedy (expect clearly < 0.5)",
            Player::Random,
        ),
        c(
            "power control: two-ply greedy vs greedy (expect > 0.5)",
            Player::TwoPly,
        ),
    ]
}

fn report_json(m: &Match, r: &ArenaReport, secs: f64, weights: Option<&[f64]>) -> Value {
    json!({"role": m.role, "feature": m.feature.map(|f| FEATURE_NAMES[f]), "k": m.k,
           "weights": weights, "player": r.player_a, "score": r.score, "ci95": r.ci95,
           "scored_pairs": r.scored_pairs, "unfinished": r.a.unfinished,
           "distinct_games": r.distinct_games, "seconds": secs, "report": r})
}

fn explore(args: &[String]) -> anyhow::Result<()> {
    let lenses: Value = serde_json::from_str(&std::fs::read_to_string(need(args, "--lenses")?)?)?;
    let pairs: u32 = need(args, "--pairs")?.parse()?;
    let seed: u64 = need(args, "--seed")?.parse()?;
    let out = need(args, "--out")?;
    let mut matches = controls();
    for f in lenses["lens_b_choice"]["features"].as_array().unwrap() {
        let name = f["feature"].as_str().unwrap();
        if name == "top_diff" {
            continue;
        }
        let idx = FEATURE_NAMES.iter().position(|&n| n == name).unwrap();
        let sign = f["coef_given_top_diff"].as_f64().unwrap().signum();
        let sd = f["sd_across_moves"].as_f64().unwrap();
        for k in GRID {
            let w = sign * k / sd;
            matches.push(Match {
                role: "candidate".into(),
                feature: Some(idx),
                k: Some(sign * k),
                a: Player::H(Heuristic::greedy_plus(
                    format!("greedy+{w:.4}*{name}"),
                    idx,
                    w,
                )),
            });
        }
    }
    let t = Instant::now();
    let results = run_all(&matches, pairs, seed);
    eprintln!(
        "{} matches in {:.1} s",
        matches.len(),
        t.elapsed().as_secs_f64()
    );
    let rows: Vec<Value> = matches
        .iter()
        .zip(&results)
        .map(|(m, (r, s))| {
            let w = match &m.a {
                Player::H(h) => Some(h.weights.to_vec()),
                _ => None,
            };
            report_json(m, r, *s, w.as_deref())
        })
        .collect();
    // Per feature, the best weight; advance by the pre-set rule.
    let mut picks = Vec::new();
    for (idx, name) in FEATURE_NAMES.iter().enumerate() {
        let best = matches
            .iter()
            .zip(&results)
            .filter(|(m, _)| m.feature == Some(idx))
            .max_by(|a, b| a.1 .0.score.total_cmp(&b.1 .0.score));
        if let Some((m, (r, _))) = best {
            let Player::H(h) = &m.a else { unreachable!() };
            picks.push(
                json!({"feature": name, "k": m.k, "weights": h.weights.to_vec(),
                "player": h.name, "explore_score": r.score, "explore_ci95": r.ci95,
                "advance": r.score >= ADVANCE_AT}),
            );
        }
    }
    let report = json!({"rules": RULES.to_string(), "pairs": pairs, "seed": seed,
        "opening_plies": OPENING_PLIES, "grid_k": GRID, "advance_at": ADVANCE_AT,
        "opponent": "greedy", "picks": picks, "matches": rows});
    std::fs::write(&out, serde_json::to_string_pretty(&report)?)?;
    for p in &picks {
        eprintln!(
            "{} k={} {:.3} {:?} advance={}",
            p["feature"],
            p["k"],
            p["explore_score"].as_f64().unwrap(),
            p["explore_ci95"],
            p["advance"]
        );
    }
    for row in rows.iter().take(5) {
        eprintln!(
            "{}: {:.3} {:?}",
            row["role"],
            row["score"].as_f64().unwrap(),
            row["ci95"]
        );
    }
    Ok(())
}

fn weights_of(v: &Value) -> [f64; NUM_FEATURES] {
    let w: Vec<f64> = v
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_f64().unwrap())
        .collect();
    w.try_into().unwrap()
}

fn confirm(args: &[String]) -> anyhow::Result<()> {
    let explored: Value =
        serde_json::from_str(&std::fs::read_to_string(need(args, "--explore")?)?)?;
    let pairs: u32 = need(args, "--pairs")?.parse()?;
    let seed: u64 = need(args, "--seed")?.parse()?;
    let combined_seed: u64 = need(args, "--combined-seed")?.parse()?;
    let out = need(args, "--out")?;
    anyhow::ensure!(
        seed != explored["seed"].as_u64().unwrap() && combined_seed != seed,
        "confirmation needs fresh seeds"
    );
    let mut matches = controls();
    for p in explored["picks"].as_array().unwrap() {
        if !p["advance"].as_bool().unwrap() {
            continue;
        }
        matches.push(Match {
            role: "candidate".into(),
            feature: FEATURE_NAMES
                .iter()
                .position(|&n| n == p["feature"].as_str().unwrap()),
            k: p["k"].as_f64(),
            a: Player::H(Heuristic {
                name: p["player"].as_str().unwrap().into(),
                weights: weights_of(&p["weights"]),
            }),
        });
        // Mirror: the same term with the opposite sign. If it also beats
        // greedy, the term acts as a tie-break of any content, not a direction.
        let idx = FEATURE_NAMES
            .iter()
            .position(|&n| n == p["feature"].as_str().unwrap())
            .unwrap();
        let mut w = weights_of(&p["weights"]);
        w[idx] = -w[idx];
        matches.push(Match {
            role: "mirror".into(),
            feature: Some(idx),
            k: p["k"].as_f64().map(|k| -k),
            a: Player::H(Heuristic {
                name: format!("mirror of {}", p["player"].as_str().unwrap()),
                weights: w,
            }),
        });
    }
    let t = Instant::now();
    let results = run_all(&matches, pairs, seed);
    let rows: Vec<Value> = matches
        .iter()
        .zip(&results)
        .map(|(m, (r, s))| report_json(m, r, *s, None))
        .collect();
    // Survivors: confirmation CI lower bound above 0.5.
    let survivors: Vec<&Match> = matches
        .iter()
        .zip(&results)
        .filter(|(m, (r, _))| m.role == "candidate" && r.ci95[0] > 0.5)
        .map(|(m, _)| m)
        .collect();
    // The survivors together, each at its explored weight, on a third seed:
    // summed, and summed then divided by their number (both fixed before
    // the confirmation run).
    let combined: Vec<Value> = if survivors.len() < 2 {
        Vec::new()
    } else {
        let mut sum = [0.0; NUM_FEATURES];
        for m in &survivors {
            let Player::H(h) = &m.a else { unreachable!() };
            for (s, w) in sum.iter_mut().zip(&h.weights).skip(1) {
                *s += w;
            }
        }
        let n = survivors.len() as f64;
        let variants: Vec<Match> = [("sum", 1.0), ("mean", 1.0 / n)]
            .iter()
            .map(|&(label, scale)| {
                let mut w = sum.map(|x| x * scale);
                w[0] = 1.0;
                Match {
                    role: format!("combined survivors ({label})"),
                    feature: None,
                    k: None,
                    a: Player::H(Heuristic {
                        name: format!("greedy+survivors-{label}"),
                        weights: w,
                    }),
                }
            })
            .collect();
        variants
            .iter()
            .zip(run_all(&variants, pairs, combined_seed))
            .map(|(m, (r, s))| {
                let Player::H(h) = &m.a else { unreachable!() };
                report_json(m, &r, s, Some(&h.weights))
            })
            .collect()
    };
    eprintln!(
        "{} matches in {:.1} s",
        matches.len() + combined.len(),
        t.elapsed().as_secs_f64()
    );
    for row in rows.iter().chain(&combined) {
        eprintln!(
            "{} {}: {:.3} {:?}",
            row["role"],
            row["player"],
            row["score"].as_f64().unwrap(),
            row["ci95"]
        );
    }
    // Descriptive only (not a retention test): survivors and plain greedy,
    // each against two-ply greedy, on the combined seed.
    let mut robust: Vec<Match> = vec![Match {
        role: "reference: greedy vs two-ply greedy".into(),
        feature: None,
        k: None,
        a: Player::Greedy,
    }];
    for m in &survivors {
        robust.push(Match {
            role: "robustness: survivor vs two-ply greedy".into(),
            feature: m.feature,
            k: m.k,
            a: m.a.clone(),
        });
    }
    let robust_rows: Vec<Value> = robust
        .iter()
        .zip(run_against(&robust, &Player::TwoPly, pairs, combined_seed))
        .map(|(m, (r, s))| report_json(m, &r, s, None))
        .collect();
    for row in &robust_rows {
        eprintln!("{} {}: {:.3} {:?}", row["role"], row["player"], row["score"].as_f64().unwrap(), row["ci95"]);
    }
    let report = json!({"rules": RULES.to_string(), "pairs": pairs, "seed": seed,
        "combined_seed": combined_seed, "explore_seed": explored["seed"],
        "opening_plies": OPENING_PLIES, "opponent": "greedy",
        "retained": survivors.iter().map(|m| m.feature.map(|f| FEATURE_NAMES[f])).collect::<Vec<_>>(),
        "matches": rows, "combined": combined, "vs_two_ply": robust_rows});
    std::fs::write(&out, serde_json::to_string_pretty(&report)?)?;
    Ok(())
}
