//! Elo ladder from arena results (plan task 3.3): a Bradley–Terry fit by
//! maximum likelihood, with intervals from the inverse Fisher information.
//!
//! Model: P(i beats j) = 1 / (1 + 10^((R_j − R_i) / 400)). A draw counts as
//! half a win each way; unfinished games are ignored. One player is the
//! anchor, fixed at 0.
//!
//! Prior: every pairing that played at least one game gets one extra virtual
//! draw. Without it a clean sweep (greedy beat random 399–1, first-legal can
//! lose every game) sends the maximum-likelihood gap to infinity. The virtual
//! draw pulls such gaps to a finite, large value and widens nothing else
//! noticeably at 400 games per pairing.
//!
//! Caveat: the intervals treat games as independent. Arena games come in
//! pairs sharing an opening, so these intervals are somewhat too narrow;
//! each match's own per-pair interval (in the arena report) is the stricter
//! test between two players.

use serde::Serialize;
use std::collections::BTreeMap;

pub const VIRTUAL_DRAWS_PER_PAIRING: f64 = 1.0;
const ELO_PER_NATURAL: f64 = 400.0 / std::f64::consts::LN_10;

/// Results of one pairing, from A's side.
#[derive(Debug, Clone, PartialEq)]
pub struct PairResult {
    pub a: String,
    pub b: String,
    pub a_wins: f64,
    pub draws: f64,
    pub a_losses: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Rating {
    pub player: String,
    pub elo: f64,
    /// 95 % interval relative to the anchor; zero width for the anchor.
    pub ci95: [f64; 2],
    pub games: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Ladder {
    pub anchor: String,
    pub virtual_draws_per_pairing: f64,
    /// Highest rating first.
    pub ratings: Vec<Rating>,
}

/// Fit the ladder. Self-pairings are ignored. Errors if the anchor is not a
/// player or the pairings do not connect every player to the anchor.
pub fn fit(results: &[PairResult], anchor: &str) -> Result<Ladder, String> {
    let mut index: BTreeMap<String, usize> = BTreeMap::new();
    for r in results.iter().filter(|r| r.a != r.b) {
        for p in [&r.a, &r.b] {
            let next = index.len();
            index.entry(p.clone()).or_insert(next);
        }
    }
    let n = index.len();
    let &anchor_idx = index
        .get(anchor)
        .ok_or_else(|| format!("anchor '{anchor}' played no game"))?;

    // wins[i][j]: points i scored against j (draws half); games[i][j] = games[j][i].
    let mut wins = vec![vec![0.0; n]; n];
    let mut games = vec![vec![0.0; n]; n];
    for r in results.iter().filter(|r| r.a != r.b) {
        let (i, j) = (index[&r.a], index[&r.b]);
        let played = r.a_wins + r.draws + r.a_losses;
        if played <= 0.0 {
            continue;
        }
        wins[i][j] += r.a_wins + 0.5 * r.draws;
        wins[j][i] += r.a_losses + 0.5 * r.draws;
        games[i][j] += played;
        games[j][i] += played;
    }
    // The prior: one virtual draw per distinct pairing, however many reports
    // (or orientations, A–B and B–A) it arrived in.
    for i in 0..n {
        for j in 0..n {
            if games[i][j] > 0.0 {
                wins[i][j] += 0.5 * VIRTUAL_DRAWS_PER_PAIRING;
                games[i][j] += VIRTUAL_DRAWS_PER_PAIRING;
            }
        }
    }
    check_connected(&games, anchor_idx)?;

    // Newton's method on the free parameters (all but the anchor).
    let free: Vec<usize> = (0..n).filter(|&i| i != anchor_idx).collect();
    let mut theta = vec![0.0f64; n];
    let mut converged = false;
    for _ in 0..MAX_NEWTON_STEPS {
        let (grad, info) = gradient_and_information(&theta, &free, &wins, &games);
        let step = solve(&info, &grad).ok_or("information matrix is singular")?;
        for (fi, &i) in free.iter().enumerate() {
            theta[i] += step[fi];
        }
        if step.iter().all(|s| s.abs() < 1e-10) {
            converged = true;
            break;
        }
    }
    if !converged {
        return Err(format!(
            "the fit did not converge in {MAX_NEWTON_STEPS} Newton steps"
        ));
    }
    // Intervals from the information at the final estimate.
    let (_, info) = gradient_and_information(&theta, &free, &wins, &games);
    let cov = invert(&info).ok_or("information matrix is singular")?;

    let mut ratings: Vec<Rating> = index
        .iter()
        .map(|(name, &i)| {
            let elo = theta[i] * ELO_PER_NATURAL;
            let half = match free.iter().position(|&x| x == i) {
                Some(fi) => 1.96 * cov[fi][fi].sqrt() * ELO_PER_NATURAL,
                None => 0.0,
            };
            let real_games: f64 = results
                .iter()
                .filter(|r| r.a != r.b && (r.a == *name || r.b == *name))
                .map(|r| r.a_wins + r.draws + r.a_losses)
                .sum();
            Rating {
                player: name.clone(),
                elo,
                ci95: [elo - half, elo + half],
                games: real_games,
            }
        })
        .collect();
    ratings.sort_by(|x, y| y.elo.total_cmp(&x.elo));
    Ok(Ladder {
        anchor: anchor.to_string(),
        virtual_draws_per_pairing: VIRTUAL_DRAWS_PER_PAIRING,
        ratings,
    })
}

const MAX_NEWTON_STEPS: usize = 200;

/// Gradient of the log-likelihood and the Fisher information, over the free
/// parameters.
fn gradient_and_information(
    theta: &[f64],
    free: &[usize],
    wins: &[Vec<f64>],
    games: &[Vec<f64>],
) -> (Vec<f64>, Vec<Vec<f64>>) {
    let mut grad = vec![0.0; free.len()];
    let mut info = vec![vec![0.0; free.len()]; free.len()];
    for (fi, &i) in free.iter().enumerate() {
        for j in 0..theta.len() {
            if games[i][j] == 0.0 {
                continue;
            }
            let p = 1.0 / (1.0 + (theta[j] - theta[i]).exp());
            grad[fi] += wins[i][j] - games[i][j] * p;
            let w = games[i][j] * p * (1.0 - p);
            info[fi][fi] += w;
            if let Some(fj) = free.iter().position(|&x| x == j) {
                info[fi][fj] -= w;
            }
        }
    }
    (grad, info)
}

fn check_connected(games: &[Vec<f64>], start: usize) -> Result<(), String> {
    let mut seen = vec![false; games.len()];
    let mut stack = vec![start];
    seen[start] = true;
    while let Some(i) = stack.pop() {
        for (j, &g) in games[i].iter().enumerate() {
            if g > 0.0 && !seen[j] {
                seen[j] = true;
                stack.push(j);
            }
        }
    }
    if seen.iter().all(|&s| s) {
        Ok(())
    } else {
        Err("some players are not connected to the anchor by any game".into())
    }
}

/// Solve A x = b by Gaussian elimination with partial pivoting.
fn solve(a: &[Vec<f64>], b: &[f64]) -> Option<Vec<f64>> {
    let n = b.len();
    let mut m: Vec<Vec<f64>> = a
        .iter()
        .zip(b)
        .map(|(row, &bi)| {
            let mut r = row.clone();
            r.push(bi);
            r
        })
        .collect();
    for col in 0..n {
        let piv = (col..n).max_by(|&x, &y| m[x][col].abs().total_cmp(&m[y][col].abs()))?;
        if m[piv][col].abs() < 1e-12 {
            return None;
        }
        m.swap(col, piv);
        let pivot_row = m[col].clone();
        for (row, r) in m.iter_mut().enumerate() {
            if row != col {
                let f = r[col] / pivot_row[col];
                for (x, p) in r.iter_mut().zip(&pivot_row).skip(col) {
                    *x -= f * p;
                }
            }
        }
    }
    Some((0..n).map(|i| m[i][n] / m[i][i]).collect())
}

fn invert(a: &[Vec<f64>]) -> Option<Vec<Vec<f64>>> {
    let n = a.len();
    let cols: Option<Vec<Vec<f64>>> = (0..n)
        .map(|c| {
            solve(
                a,
                &(0..n)
                    .map(|r| if r == c { 1.0 } else { 0.0 })
                    .collect::<Vec<_>>(),
            )
        })
        .collect();
    let cols = cols?;
    Some(
        (0..n)
            .map(|r| (0..n).map(|c| cols[c][r]).collect())
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn expected(a: &str, ra: f64, b: &str, rb: f64, games: f64) -> PairResult {
        let p = 1.0 / (1.0 + 10f64.powf((rb - ra) / 400.0));
        PairResult {
            a: a.into(),
            b: b.into(),
            a_wins: p * games,
            draws: 0.0,
            a_losses: (1.0 - p) * games,
        }
    }

    fn elo_of(l: &Ladder, p: &str) -> f64 {
        l.ratings.iter().find(|r| r.player == p).unwrap().elo
    }

    #[test]
    fn recovers_known_ratings() {
        // Exact expected results for ratings 0 / 150 / 400, 100,000 games per
        // pairing so the virtual draw is negligible.
        let n = 100_000.0;
        let res = vec![
            expected("a", 0.0, "b", 150.0, n),
            expected("b", 150.0, "c", 400.0, n),
            expected("a", 0.0, "c", 400.0, n),
        ];
        let l = fit(&res, "a").unwrap();
        assert!((elo_of(&l, "b") - 150.0).abs() < 0.5, "{l:?}");
        assert!((elo_of(&l, "c") - 400.0).abs() < 0.5, "{l:?}");
        assert_eq!(l.ratings[0].player, "c");
        let a = l.ratings.iter().find(|r| r.player == "a").unwrap();
        assert_eq!(a.ci95, [0.0, 0.0]);
    }

    #[test]
    fn interval_shrinks_with_more_games_and_contains_the_truth() {
        let small = fit(&[expected("a", 0.0, "b", 100.0, 100.0)], "a").unwrap();
        let large = fit(&[expected("a", 0.0, "b", 100.0, 10_000.0)], "a").unwrap();
        let w = |l: &Ladder| {
            let r = l.ratings.iter().find(|r| r.player == "b").unwrap();
            assert!(r.ci95[0] < 100.0 && 100.0 < r.ci95[1], "{r:?}");
            r.ci95[1] - r.ci95[0]
        };
        assert!(w(&large) < w(&small) / 5.0);
    }

    #[test]
    fn a_clean_sweep_gives_a_finite_rating() {
        let res = vec![PairResult {
            a: "g".into(),
            b: "r".into(),
            a_wins: 400.0,
            draws: 0.0,
            a_losses: 0.0,
        }];
        let l = fit(&res, "r").unwrap();
        let g = elo_of(&l, "g");
        assert!(g.is_finite() && g > 800.0, "{g}");
    }

    #[test]
    fn draws_count_half_each_way() {
        let res = vec![PairResult {
            a: "x".into(),
            b: "y".into(),
            a_wins: 0.0,
            draws: 200.0,
            a_losses: 0.0,
        }];
        assert!(elo_of(&fit(&res, "y").unwrap(), "x").abs() < 1e-9);
    }

    #[test]
    fn self_pairings_and_bad_anchors() {
        let res = vec![
            PairResult {
                a: "x".into(),
                b: "x".into(),
                a_wins: 5.0,
                draws: 0.0,
                a_losses: 5.0,
            },
            expected("x", 0.0, "y", 50.0, 100.0),
        ];
        assert!(fit(&res, "x").is_ok());
        assert!(fit(&res, "z").is_err());
        let split = vec![
            expected("x", 0.0, "y", 0.0, 10.0),
            expected("u", 0.0, "v", 0.0, 10.0),
        ];
        assert!(fit(&split, "x").is_err());
    }

    /// Review finding: a pairing split across reports (or given in both
    /// orientations) must get the same single virtual draw as one report.
    #[test]
    fn the_prior_is_per_pairing_not_per_report() {
        let sweep = |a: &str, b: &str, w: f64| PairResult {
            a: a.into(),
            b: b.into(),
            a_wins: w,
            draws: 0.0,
            a_losses: 0.0,
        };
        let one = fit(&[sweep("g", "r", 400.0)], "r").unwrap();
        let split = fit(&[sweep("g", "r", 200.0), sweep("g", "r", 200.0)], "r").unwrap();
        let flipped = fit(
            &[
                sweep("g", "r", 200.0),
                PairResult {
                    a: "r".into(),
                    b: "g".into(),
                    a_wins: 0.0,
                    draws: 0.0,
                    a_losses: 200.0,
                },
            ],
            "r",
        )
        .unwrap();
        assert!((elo_of(&one, "g") - elo_of(&split, "g")).abs() < 1e-6);
        assert!((elo_of(&one, "g") - elo_of(&flipped, "g")).abs() < 1e-6);
    }
}
