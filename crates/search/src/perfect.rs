//! Principles of Pogo read from perfect play (round 3,
//! `docs/experiments/v3-principles-perfect.md`).
//!
//! Every legal move of a won or drawn position of the published game is
//! labelled by the solved table (`retro.rs`): it *keeps the value* if, from a
//! win, it leads to a position the opponent loses and, from a draw, to one the
//! opponent does not win. A move is described by the position features of
//! `principles.rs`, read on the position after it from the mover's side, and
//! by a few features of the move itself. From these labelled moves this module
//! learns readable rules (a short ranked list of criteria applied one after
//! the other, and a shallow decision tree) and turns them into players.

use crate::arena::Agent;
use crate::principles::{features, FEATURE_NAMES};
use crate::retro::{decode, load_reachable, load_solved, Bitset, Board, Game, Value};
use crate::rng::SplitMix64;
use pogofish_engine::{
    apply_move, is_terminal, legal_moves, manhattan_distance, Color, GameState, Move, RuleSet,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

/// The position features of `principles.rs` minus `repetition` (the
/// table's positions carry no history), in the same order.
pub const POS_FEATURES: usize = 18;
pub const MOVE_FEATURES: usize = 11;
pub const NF: usize = POS_FEATURES + MOVE_FEATURES;

/// Features of the move itself, read on the position before it.
pub const MOVE_FEATURE_NAMES: [&str; MOVE_FEATURES] = [
    "pieces_moved",   // 1, 2 or 3
    "distance",       // Manhattan distance travelled
    "lands_on_opp",   // the destination was topped by the opponent (a top is captured)
    "lands_on_own",   // the destination was topped by the mover
    "lands_on_empty", // the destination was empty
    "uncovers_opp",   // the piece left on top of the source is the opponent's
    "uncovers_own",   // the piece left on top of the source is the mover's
    "empties_source", // nothing is left on the source
    "advance",        // rows moved towards the opponent's home row (negative: backwards)
    "source_height",  // height of the source stack before the move
    "dest_height",    // height of the destination stack before the move
];

pub fn feature_name(i: usize) -> &'static str {
    if i < POS_FEATURES {
        FEATURE_NAMES[i]
    } else {
        MOVE_FEATURE_NAMES[i - POS_FEATURES]
    }
}

pub fn feature_index(name: &str) -> Option<usize> {
    (0..NF).find(|&i| feature_name(i) == name)
}

/// One move: position features after it (mover's side), then move features.
pub type Row = [f32; NF];

pub fn move_features(state: &GameState, m: Move) -> [f32; MOVE_FEATURES] {
    let cells = state.cells();
    let me = state.to_move();
    let (from, to, k) = (
        m.from_cell as usize,
        m.to_cell as usize,
        m.num_pieces as usize,
    );
    let mut f = [0.0; MOVE_FEATURES];
    f[0] = k as f32;
    f[1] = manhattan_distance(m.from_cell, m.to_cell) as f32;
    match cells[to].last() {
        None => f[4] = 1.0,
        Some(&c) if c == me => f[3] = 1.0,
        Some(_) => f[2] = 1.0,
    }
    let src = &cells[from];
    let left = src.len() - k;
    if left == 0 {
        f[7] = 1.0;
    } else if src[left - 1] == me {
        f[6] = 1.0;
    } else {
        f[5] = 1.0;
    }
    let forward = if me == Color::White { 1.0 } else { -1.0 };
    f[8] = forward * ((to / 3) as f32 - (from / 3) as f32);
    f[9] = src.len() as f32;
    f[10] = cells[to].len() as f32;
    f
}

/// The position features of `state` from `me`'s side, without `repetition`.
pub fn position_row(state: &GameState, me: Color) -> [f32; POS_FEATURES] {
    let f = features(state, me);
    std::array::from_fn(|i| f[i] as f32)
}

/// The row of move `m` from `state`, `next` being the position after it.
pub fn row_of(state: &GameState, m: Move, next: &GameState) -> Row {
    let p = position_row(next, state.to_move());
    let mf = move_features(state, m);
    let mut r = [0.0; NF];
    r[..POS_FEATURES].copy_from_slice(&p);
    r[POS_FEATURES..].copy_from_slice(&mf);
    r
}

/// The tree's input: position features as changes made by the move (after
/// minus before, mover's side), move features as they are. Within one
/// position this ranks moves exactly as the row does; across positions it
/// compares like with like.
pub fn tree_input(before: &[f32; POS_FEATURES], row: &Row) -> Row {
    let mut x = *row;
    for i in 0..POS_FEATURES {
        x[i] -= before[i];
    }
    x
}

/// Whether a move keeps the value of its position: from a win, the opponent
/// must be lost after it; from a draw, the opponent must not be winning.
/// `None` for a lost position (nothing to keep).
pub fn keeps_value(parent: Value, child: Value) -> Option<bool> {
    match parent {
        Value::Win(_) => Some(matches!(child, Value::Loss(_))),
        Value::Draw => Some(!matches!(child, Value::Win(_))),
        _ => None,
    }
}

/// A labelled position: every legal move with its row and label.
#[derive(Debug, Clone)]
pub struct Sample {
    pub won: bool,
    pub max_height: u8,
    pub state: GameState,
    pub before: [f32; POS_FEATURES],
    pub moves: Vec<Move>,
    pub rows: Vec<Row>,
    pub keeps: Vec<bool>,
}

/// One criterion of a ranked list: keep only the moves with the highest
/// `sign · feature`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Criterion {
    pub feature: usize,
    pub sign: f32,
}

impl Criterion {
    pub fn describe(&self) -> String {
        format!(
            "{} {}",
            if self.sign > 0.0 { "most" } else { "fewest" },
            feature_name(self.feature)
        )
    }

    pub fn negated(&self) -> Criterion {
        Criterion {
            feature: self.feature,
            sign: -self.sign,
        }
    }
}

/// Apply `criteria` one after the other to the moves `among` (indices into
/// `rows`): each keeps only the moves with the highest `sign · feature`.
pub fn select(criteria: &[Criterion], rows: &[Row], mut among: Vec<usize>) -> Vec<usize> {
    for c in criteria {
        let best = among
            .iter()
            .map(|&i| c.sign * rows[i][c.feature])
            .fold(f32::NEG_INFINITY, f32::max);
        among.retain(|&i| c.sign * rows[i][c.feature] >= best - 1e-4);
    }
    among
}

/// Share of `set` whose move keeps the value: the chance that a uniform
/// pick from the set keeps it.
pub fn keep_rate(set: &[usize], keeps: &[bool]) -> f64 {
    set.iter().filter(|&&i| keeps[i]).count() as f64 / set.len() as f64
}

/// Weighted mean keep rate of `criteria` over `samples`.
pub fn list_score(criteria: &[Criterion], samples: &[&Sample], weights: &[f64]) -> f64 {
    let mut num = 0.0;
    let mut den = 0.0;
    for (s, &w) in samples.iter().zip(weights) {
        let set = select(criteria, &s.rows, (0..s.rows.len()).collect());
        num += w * keep_rate(&set, &s.keeps);
        den += w;
    }
    num / den
}

/// One step of a learnt list and the training score once it is added.
#[derive(Debug, Clone, Serialize)]
pub struct ListStep {
    pub criterion: Criterion,
    pub train_score: f64,
}

/// Forward selection of a ranked list of at most `max_len` criteria: at each
/// step, the criterion (any feature, either direction, not yet used) that
/// most raises the weighted keep rate; stop when the gain is below
/// `min_gain`. Returns the starting score (uniform pick) and the steps.
pub fn learn_rule_list(
    samples: &[&Sample],
    weights: &[f64],
    max_len: usize,
    min_gain: f64,
) -> (f64, Vec<ListStep>) {
    let den: f64 = weights.iter().sum();
    let mut current: Vec<Vec<usize>> = samples
        .iter()
        .map(|s| (0..s.rows.len()).collect())
        .collect();
    let score_of = |sets: &[Vec<usize>]| -> f64 {
        sets.iter()
            .zip(samples)
            .zip(weights)
            .map(|((set, s), w)| w * keep_rate(set, &s.keeps))
            .sum::<f64>()
            / den
    };
    let base = score_of(&current);
    let mut score = base;
    let mut steps = Vec::new();
    let mut used = Vec::new();
    for _ in 0..max_len {
        let mut best: Option<(f64, Criterion)> = None;
        for feature in (0..NF).filter(|f| !used.contains(f)) {
            for sign in [1.0f32, -1.0] {
                let c = Criterion { feature, sign };
                let sc: f64 = current
                    .iter()
                    .zip(samples)
                    .zip(weights)
                    .map(|((set, s), w)| {
                        w * keep_rate(&select(&[c], &s.rows, set.clone()), &s.keeps)
                    })
                    .sum::<f64>()
                    / den;
                if best.map_or(true, |(b, _)| sc > b + 1e-12) {
                    best = Some((sc, c));
                }
            }
        }
        let Some((sc, c)) = best else { break };
        if sc < score + min_gain {
            break;
        }
        for (set, s) in current.iter_mut().zip(samples) {
            *set = select(&[c], &s.rows, std::mem::take(set));
        }
        score = sc;
        used.push(c.feature);
        steps.push(ListStep {
            criterion: c,
            train_score: score,
        });
    }
    (base, steps)
}

// ---------------------------------------------------------------- tree

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Node {
    Leaf {
        rate: f64,
        weight: f64,
    },
    /// `x[feature] <= threshold` goes left.
    Split {
        feature: usize,
        threshold: f32,
        left: usize,
        right: usize,
        rate: f64,
        weight: f64,
    },
}

/// A binary classification tree (CART, weighted Gini), predicting the share
/// of value-keeping moves.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tree {
    pub nodes: Vec<Node>,
}

fn gini(w: f64, wy: f64) -> f64 {
    if w <= 0.0 {
        return 0.0;
    }
    let p = wy / w;
    2.0 * p * (1.0 - p) * w
}

impl Tree {
    /// Fit on rows `x` with labels `y` and weights `w`, at most `depth`
    /// levels of splits, every leaf holding at least `min_leaf` weight.
    pub fn fit(x: &[Row], y: &[bool], w: &[f64], depth: usize, min_leaf: f64) -> Tree {
        let mut t = Tree { nodes: Vec::new() };
        let idx: Vec<usize> = (0..x.len()).collect();
        t.grow(x, y, w, idx, depth, min_leaf);
        t
    }

    // `f` indexes the columns of every row, not one slice.
    #[allow(clippy::needless_range_loop)]
    fn grow(
        &mut self,
        x: &[Row],
        y: &[bool],
        w: &[f64],
        idx: Vec<usize>,
        depth: usize,
        min_leaf: f64,
    ) -> usize {
        let tw: f64 = idx.iter().map(|&i| w[i]).sum();
        let twy: f64 = idx.iter().filter(|&&i| y[i]).map(|&i| w[i]).sum();
        let rate = if tw > 0.0 { twy / tw } else { 0.0 };
        let me = self.nodes.len();
        self.nodes.push(Node::Leaf { rate, weight: tw });
        if depth == 0 {
            return me;
        }
        let parent = gini(tw, twy);
        let mut best: Option<(f64, usize, f32)> = None;
        let mut order = idx.clone();
        for f in 0..NF {
            order.sort_by(|&a, &b| x[a][f].total_cmp(&x[b][f]));
            let (mut lw, mut lwy) = (0.0, 0.0);
            for k in 0..order.len() - 1 {
                let i = order[k];
                lw += w[i];
                if y[i] {
                    lwy += w[i];
                }
                let (v, next) = (x[i][f], x[order[k + 1]][f]);
                if v == next || lw < min_leaf || tw - lw < min_leaf {
                    continue;
                }
                let imp = gini(lw, lwy) + gini(tw - lw, twy - lwy);
                if best.map_or(true, |(b, _, _)| imp < b - 1e-12) {
                    best = Some((imp, f, (v + next) / 2.0));
                }
            }
        }
        let Some((imp, feature, threshold)) = best else {
            return me;
        };
        if imp >= parent - 1e-12 {
            return me;
        }
        let (l, r): (Vec<usize>, Vec<usize>) =
            idx.into_iter().partition(|&i| x[i][feature] <= threshold);
        let left = self.grow(x, y, w, l, depth - 1, min_leaf);
        let right = self.grow(x, y, w, r, depth - 1, min_leaf);
        self.nodes[me] = Node::Split {
            feature,
            threshold,
            left,
            right,
            rate,
            weight: tw,
        };
        me
    }

    pub fn predict(&self, x: &Row) -> f64 {
        let mut n = 0;
        loop {
            match self.nodes[n] {
                Node::Leaf { rate, .. } => return rate,
                Node::Split {
                    feature,
                    threshold,
                    left,
                    right,
                    ..
                } => n = if x[feature] <= threshold { left } else { right },
            }
        }
    }

    /// One line per leaf: the path to it, its keep rate and its share of the
    /// weight. Position features read as changes made by the move (`Δ`).
    pub fn describe(&self) -> Vec<String> {
        let total = match self.nodes.first() {
            Some(Node::Leaf { weight, .. } | Node::Split { weight, .. }) => *weight,
            None => return Vec::new(),
        };
        let mut out = Vec::new();
        self.describe_from(0, &mut Vec::new(), total, &mut out);
        out
    }

    fn describe_from(&self, n: usize, path: &mut Vec<String>, total: f64, out: &mut Vec<String>) {
        let name = |f: usize| {
            if f < POS_FEATURES {
                format!("Δ{}", feature_name(f))
            } else {
                feature_name(f).to_string()
            }
        };
        match &self.nodes[n] {
            Node::Leaf { rate, weight } => out.push(format!(
                "{} → keeps {:.3} ({:.1} % of weight)",
                if path.is_empty() {
                    "always".into()
                } else {
                    path.join(" and ")
                },
                rate,
                100.0 * weight / total
            )),
            Node::Split {
                feature,
                threshold,
                left,
                right,
                ..
            } => {
                path.push(format!("{} ≤ {threshold}", name(*feature)));
                self.describe_from(*left, path, total, out);
                path.pop();
                path.push(format!("{} > {threshold}", name(*feature)));
                self.describe_from(*right, path, total, out);
                path.pop();
            }
        }
    }
}

// ------------------------------------------------------------- players

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Policy {
    /// Every move.
    Random,
    /// A ranked list of criteria, applied one after the other.
    List(Vec<Criterion>),
    /// The moves the tree rates highest (lowest if `negated`), then the
    /// highest top difference among them.
    Tree { tree: Tree, negated: bool },
}

impl Policy {
    /// The tied best moves among `rows` (indices).
    pub fn choose_among(&self, before: &[f32; POS_FEATURES], rows: &[Row]) -> Vec<usize> {
        let all: Vec<usize> = (0..rows.len()).collect();
        match self {
            Policy::Random => all,
            Policy::List(c) => select(c, rows, all),
            Policy::Tree { tree, negated } => {
                let sign = if *negated { -1.0 } else { 1.0 };
                let score: Vec<f64> = rows
                    .iter()
                    .map(|r| sign * tree.predict(&tree_input(before, r)))
                    .collect();
                let best = score.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                let top: Vec<usize> = all
                    .into_iter()
                    .filter(|&i| score[i] >= best - 1e-12)
                    .collect();
                select(
                    &[Criterion {
                        feature: 0,
                        sign: 1.0,
                    }],
                    rows,
                    top,
                )
            }
        }
    }
}

/// A one-ply scripted player: takes a winning move if one exists, avoids a
/// move that loses at once when it has a choice (both as `Heuristic` does),
/// otherwise plays a uniform pick among the moves its policy selects. With
/// `Policy::List([top_diff up])` it is greedy, move for move.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyPlayer {
    pub name: String,
    pub policy: Policy,
}

impl PolicyPlayer {
    /// The moves the player picks from uniformly, in legal-move order. A move
    /// to a drawn finished position (not possible under `lc1-2`) is treated
    /// as a quiet move.
    pub fn best_moves(&self, state: &GameState, rules: &RuleSet) -> Vec<Move> {
        let moves = legal_moves(state);
        assert!(!moves.is_empty(), "choose() called with no legal move");
        let mover = state.to_move();
        let mut wins = Vec::new();
        let mut losing = Vec::new();
        let mut quiet = Vec::new();
        let mut rows = Vec::new();
        for m in moves {
            let next = apply_move(state, m).expect("legal move");
            match is_terminal(&next, rules) {
                Some(o) if o.winner() == Some(mover) => wins.push(m),
                Some(o) if o.winner().is_some() => losing.push(m),
                _ => {
                    rows.push(row_of(state, m, &next));
                    quiet.push(m);
                }
            }
        }
        if !wins.is_empty() {
            return wins;
        }
        if quiet.is_empty() {
            return losing;
        }
        let before = position_row(state, mover);
        self.policy
            .choose_among(&before, &rows)
            .into_iter()
            .map(|i| quiet[i])
            .collect()
    }
}

impl Agent for PolicyPlayer {
    fn name(&self) -> String {
        self.name.clone()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        let b = self.best_moves(state, rules);
        b[rng.below(b.len())]
    }
}

// ------------------------------------------------- per-feature comparison

/// Per feature: positions where the value-keeping moves have a higher, lower
/// or equal mean than the other moves.
#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct ShareTally {
    pub higher: u64,
    pub lower: u64,
    pub equal: u64,
}

impl ShareTally {
    /// Share higher among unequal, and its 95 % normal-approximation interval.
    pub fn share(&self) -> (f64, [f64; 2]) {
        let n = (self.higher + self.lower) as f64;
        if n == 0.0 {
            return (f64::NAN, [f64::NAN, f64::NAN]);
        }
        let p = self.higher as f64 / n;
        let h = 1.96 * (p * (1.0 - p) / n).sqrt();
        (p, [p - h, p + h])
    }
}

/// For each feature, compare the mean over value-keeping moves with the mean
/// over the other moves, in every sample holding both. With
/// `greedy_ties_only`, only greedy's tied best moves (highest top difference)
/// are compared. Returns the number of samples used and one tally per feature.
pub fn feature_shares(samples: &[&Sample], greedy_ties_only: bool) -> (usize, Vec<ShareTally>) {
    let mut tally = vec![ShareTally::default(); NF];
    let mut used = 0;
    for s in samples {
        let all: Vec<usize> = (0..s.rows.len()).collect();
        let set = if greedy_ties_only {
            select(
                &[Criterion {
                    feature: 0,
                    sign: 1.0,
                }],
                &s.rows,
                all,
            )
        } else {
            all
        };
        let (keep, other): (Vec<usize>, Vec<usize>) = set.into_iter().partition(|&i| s.keeps[i]);
        if keep.is_empty() || other.is_empty() {
            continue;
        }
        used += 1;
        for (f, t) in tally.iter_mut().enumerate() {
            let mean =
                |v: &[usize]| v.iter().map(|&i| s.rows[i][f] as f64).sum::<f64>() / v.len() as f64;
            let d = mean(&keep) - mean(&other);
            if d.abs() < 1e-9 {
                t.equal += 1;
            } else if d > 0.0 {
                t.higher += 1;
            } else {
                t.lower += 1;
            }
        }
    }
    (used, tally)
}

// ----------------------------------------------------------- the solved table

/// The solved uncapped game: its table and its reachable set.
pub struct Solved {
    pub g: Game,
    pub t: Vec<u16>,
    pub reach: Bitset,
}

impl Solved {
    /// Loads `table.bin` and `reachable.bin` from `dir`.
    pub fn load(dir: &Path) -> anyhow::Result<Solved> {
        let g = Game::published();
        let t = load_solved(&g, dir)?;
        let reach = load_reachable(&g, dir)?;
        Ok(Solved { g, t, reach })
    }

    pub fn value(&self, b: &Board) -> Value {
        decode(self.t[self.g.rank(b) as usize])
    }

    pub fn state_value(&self, s: &GameState) -> Value {
        self.value(&Board::from_state(s))
    }
}

// ----------------------------------------------------------- sampling

/// Uniform sample of `n` reachable positions of one class (won in 3 or
/// more plies, or drawn), skipping indices in `exclude`. Also returns the
/// number of draws from the index space, to estimate the class size.
pub fn sample_indices(
    sv: &Solved,
    won: bool,
    n: usize,
    seed: u64,
    exclude: &HashSet<u64>,
) -> (Vec<u64>, u64) {
    let mut rng = SplitMix64::new(seed);
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut tries = 0u64;
    while out.len() < n {
        tries += 1;
        let i = rng.next_u64() % sv.g.size();
        if !sv.reach.get(i) || exclude.contains(&i) || !seen.insert(i) {
            continue;
        }
        let ok = match decode(sv.t[i as usize]) {
            Value::Win(d) => won && d >= 3,
            Value::Draw => !won,
            _ => false,
        };
        if ok {
            out.push(i);
        } else {
            seen.remove(&i);
        }
    }
    (out, tries)
}

/// The held-out positions of `perfect learn`: the won and the drawn test
/// indices, drawn after the training ones (seeds `seed` and `seed + 1`) and
/// excluding them (seeds `seed + 2` and `seed + 3`).
pub fn held_out(sv: &Solved, n_train: usize, n_test: usize, seed: u64) -> (Vec<u64>, Vec<u64>) {
    let none = HashSet::new();
    let (tr_w, _) = sample_indices(sv, true, n_train, seed, &none);
    let (tr_d, _) = sample_indices(sv, false, n_train, seed + 1, &none);
    let train_set: HashSet<u64> = tr_w.iter().chain(&tr_d).copied().collect();
    let (te_w, _) = sample_indices(sv, true, n_test, seed + 2, &train_set);
    let (te_d, _) = sample_indices(sv, false, n_test, seed + 3, &train_set);
    (te_w, te_d)
}

pub fn build_sample(sv: &Solved, idx: u64) -> Sample {
    let b = sv.g.unrank(idx);
    let state = b.to_state();
    let parent = sv.value(&b);
    let mover = state.to_move();
    let moves = legal_moves(&state);
    let mut rows = Vec::with_capacity(moves.len());
    let mut keeps = Vec::with_capacity(moves.len());
    for &m in &moves {
        let next = apply_move(&state, m).expect("legal");
        rows.push(row_of(&state, m, &next));
        keeps.push(keeps_value(parent, sv.state_value(&next)).expect("won or drawn"));
    }
    Sample {
        won: matches!(parent, Value::Win(_)),
        max_height: *b.h.iter().max().unwrap(),
        before: position_row(&state, mover),
        state,
        moves,
        rows,
        keeps,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::players::Scripted;
    use pogofish_engine::testing::position;
    use pogofish_engine::{initial_state, Cell, NUM_CELLS};

    const W: Color = Color::White;
    const R: Color = Color::Red;

    fn empty() -> [Cell; NUM_CELLS] {
        std::array::from_fn(|_| Vec::new())
    }

    fn mf(state: &GameState, from: u8, k: u8, to: u8, name: &str) -> f32 {
        let m = Move {
            from_cell: from,
            num_pieces: k,
            to_cell: to,
        };
        move_features(state, m)[feature_index(name).unwrap() - POS_FEATURES]
    }

    #[test]
    fn names_are_unique_and_indexed() {
        for i in 0..NF {
            assert_eq!(feature_index(feature_name(i)), Some(i));
        }
        assert_eq!(feature_name(0), "top_diff");
        assert_eq!(feature_index("repetition"), None);
    }

    /// Cell 4: W R W (bottom to top); cell 1: R; cell 3: W; Red's home row
    /// is row 3 (cells 6–8).
    #[test]
    fn move_features_read_the_move() {
        let mut cells = empty();
        cells[4] = vec![W, R, W];
        cells[1] = vec![R];
        cells[3] = vec![W];
        cells[7] = vec![R, R];
        let s = position(cells.clone(), W, 0);
        // One piece 4 → 1: captures Red's top, leaves R on top of cell 4,
        // moves back towards White's home row.
        assert_eq!(mf(&s, 4, 1, 1, "lands_on_opp"), 1.0);
        assert_eq!(mf(&s, 4, 1, 1, "lands_on_own"), 0.0);
        assert_eq!(mf(&s, 4, 1, 1, "uncovers_opp"), 1.0);
        assert_eq!(mf(&s, 4, 1, 1, "uncovers_own"), 0.0);
        assert_eq!(mf(&s, 4, 1, 1, "advance"), -1.0);
        assert_eq!(mf(&s, 4, 1, 1, "source_height"), 3.0);
        assert_eq!(mf(&s, 4, 1, 1, "dest_height"), 1.0);
        // Two pieces 4 → 2 (empty), leaving W on top: uncovers its own piece.
        assert_eq!(mf(&s, 4, 2, 2, "uncovers_own"), 1.0);
        assert_eq!(mf(&s, 4, 2, 2, "lands_on_empty"), 1.0);
        assert_eq!(mf(&s, 4, 2, 2, "distance"), 2.0);
        assert_eq!(mf(&s, 4, 2, 2, "pieces_moved"), 2.0);
        // Three pieces 4 → 3 (own top), emptying the source.
        assert_eq!(mf(&s, 4, 3, 3, "empties_source"), 1.0);
        assert_eq!(mf(&s, 4, 3, 3, "lands_on_own"), 1.0);
        assert_eq!(mf(&s, 4, 3, 3, "advance"), 0.0);
        // White moving down the board advances.
        assert_eq!(mf(&s, 3, 1, 6, "advance"), 1.0);
        // Red advances by moving up the board.
        let r = position(cells, R, 0);
        assert_eq!(mf(&r, 7, 1, 4, "advance"), 1.0);
        assert_eq!(mf(&r, 1, 1, 0, "advance"), 0.0);
        assert_eq!(
            mf(&r, 7, 2, 1, "lands_on_opp"),
            0.0,
            "cell 1 is Red's own top"
        );
        assert_eq!(mf(&r, 7, 2, 1, "lands_on_own"), 1.0);
    }

    #[test]
    fn rows_and_tree_inputs_line_up() {
        let s = initial_state();
        let m = legal_moves(&s)[0];
        let next = apply_move(&s, m).unwrap();
        let row = row_of(&s, m, &next);
        let before = position_row(&s, W);
        assert_eq!(&row[..POS_FEATURES], &position_row(&next, W));
        let x = tree_input(&before, &row);
        assert_eq!(x[1], row[1] - before[1]);
        assert_eq!(x[POS_FEATURES..], row[POS_FEATURES..]);
    }

    #[test]
    fn value_keeping_follows_the_table_values() {
        assert_eq!(keeps_value(Value::Win(5), Value::Loss(4)), Some(true));
        assert_eq!(keeps_value(Value::Win(5), Value::Draw), Some(false));
        assert_eq!(keeps_value(Value::Win(5), Value::Win(2)), Some(false));
        assert_eq!(keeps_value(Value::Draw, Value::Draw), Some(true));
        assert_eq!(keeps_value(Value::Draw, Value::Loss(3)), Some(true));
        assert_eq!(keeps_value(Value::Draw, Value::Win(3)), Some(false));
        assert_eq!(keeps_value(Value::Loss(4), Value::Win(3)), None);
    }

    fn row(vals: &[(usize, f32)]) -> Row {
        let mut r = [0.0; NF];
        for &(i, v) in vals {
            r[i] = v;
        }
        r
    }

    #[test]
    fn select_applies_criteria_in_order() {
        let rows = vec![
            row(&[(0, 1.0), (3, 2.0)]),
            row(&[(0, 1.0), (3, 0.0)]),
            row(&[(0, 0.0), (3, -5.0)]),
        ];
        let up0 = Criterion {
            feature: 0,
            sign: 1.0,
        };
        let down3 = Criterion {
            feature: 3,
            sign: -1.0,
        };
        assert_eq!(select(&[up0], &rows, vec![0, 1, 2]), vec![0, 1]);
        assert_eq!(select(&[up0, down3], &rows, vec![0, 1, 2]), vec![1]);
        assert_eq!(select(&[down3, up0], &rows, vec![0, 1, 2]), vec![2]);
        assert_eq!(keep_rate(&[0, 1], &[true, false, true]), 0.5);
    }

    /// Synthetic samples whose value-keeping moves are exactly those with
    /// the fewest `own_singletons` (feature 10) and, among them, the most
    /// `prisoners` (2); feature 5 is noise. The learner must find both, in
    /// that order, with a perfect score.
    #[test]
    fn rule_list_learner_recovers_a_planted_list() {
        let mut rng = SplitMix64::new(9);
        let mut samples = Vec::new();
        for _ in 0..300 {
            let n = 3 + rng.below(6);
            let rows: Vec<Row> = (0..n)
                .map(|_| {
                    row(&[
                        (10, rng.below(3) as f32),
                        (2, rng.below(3) as f32),
                        (5, rng.below(4) as f32),
                    ])
                })
                .collect();
            let keep = select(
                &[
                    Criterion {
                        feature: 10,
                        sign: -1.0,
                    },
                    Criterion {
                        feature: 2,
                        sign: 1.0,
                    },
                ],
                &rows,
                (0..n).collect(),
            );
            let keeps = (0..n).map(|i| keep.contains(&i)).collect();
            samples.push(Sample {
                won: true,
                max_height: 2,
                state: initial_state(),
                before: [0.0; POS_FEATURES],
                moves: Vec::new(),
                rows,
                keeps,
            });
        }
        let refs: Vec<&Sample> = samples.iter().collect();
        let w = vec![1.0; refs.len()];
        let (base, steps) = learn_rule_list(&refs, &w, 3, 1e-6);
        assert!(base < 0.6);
        assert_eq!(steps.len(), 2, "{steps:?}");
        assert_eq!(
            steps[0].criterion,
            Criterion {
                feature: 10,
                sign: -1.0
            }
        );
        assert_eq!(
            steps[1].criterion,
            Criterion {
                feature: 2,
                sign: 1.0
            }
        );
        assert!((steps[1].train_score - 1.0).abs() < 1e-12);
    }

    /// Labels are 1 exactly when feature 7 exceeds 2; feature 3 is noise.
    #[test]
    fn tree_recovers_a_threshold() {
        let mut rng = SplitMix64::new(4);
        let x: Vec<Row> = (0..2000)
            .map(|_| row(&[(7, rng.below(6) as f32), (3, rng.below(6) as f32)]))
            .collect();
        let y: Vec<bool> = x.iter().map(|r| r[7] > 2.0).collect();
        let w = vec![1.0; x.len()];
        let t = Tree::fit(&x, &y, &w, 3, 10.0);
        match t.nodes[0] {
            Node::Split {
                feature, threshold, ..
            } => {
                assert_eq!(feature, 7);
                assert_eq!(threshold, 2.5);
            }
            ref n => panic!("expected a split, got {n:?}"),
        }
        for r in &x {
            assert_eq!(t.predict(r), if r[7] > 2.0 { 1.0 } else { 0.0 });
        }
        assert_eq!(t.describe().len(), 2, "pure children are not split further");
    }

    #[test]
    fn feature_shares_count_positions() {
        let mk = |rows: Vec<Row>, keeps: Vec<bool>| Sample {
            won: false,
            max_height: 2,
            state: initial_state(),
            before: [0.0; POS_FEATURES],
            moves: Vec::new(),
            rows,
            keeps,
        };
        // Sample 1: the keeping move has more of feature 4 and the same top
        // difference. Sample 2: the keeping move has a lower top
        // difference, so greedy's tied set holds no keeping move.
        let a = mk(vec![row(&[(4, 2.0)]), row(&[(4, 1.0)])], vec![true, false]);
        let b = mk(
            vec![row(&[(0, 0.0), (4, 0.0)]), row(&[(0, 1.0), (4, 3.0)])],
            vec![true, false],
        );
        let (used, t) = feature_shares(&[&a, &b], false);
        assert_eq!(used, 2);
        assert_eq!((t[4].higher, t[4].lower), (1, 1));
        assert_eq!((t[0].higher, t[0].lower, t[0].equal), (0, 1, 1));
        let (used, t) = feature_shares(&[&a, &b], true);
        assert_eq!(used, 1);
        assert_eq!((t[4].higher, t[4].lower), (1, 0));
    }

    /// The list [top_diff up] plays exactly like greedy, tie-breaking draws
    /// included: same moves from the same generator state.
    #[test]
    fn top_diff_list_reproduces_greedy() {
        let rules = RuleSet::LC1 { repetitions: 2 };
        let mut p = PolicyPlayer {
            name: "g".into(),
            policy: Policy::List(vec![Criterion {
                feature: 0,
                sign: 1.0,
            }]),
        };
        let mut s = initial_state();
        let mut walk = SplitMix64::new(3);
        for ply in 0..400 {
            if is_terminal(&s, &rules).is_some() {
                s = initial_state();
            }
            let seed = 500 + ply;
            let a = Scripted::Greedy.choose(&s, &rules, &mut SplitMix64::new(seed));
            let b = p.choose(&s, &rules, &mut SplitMix64::new(seed));
            assert_eq!(a, b, "ply {ply}");
            let legal = legal_moves(&s);
            s = pogofish_engine::apply_move_under(&s, legal[walk.below(legal.len())], &rules)
                .unwrap();
        }
    }

    #[test]
    fn players_take_a_win_and_the_tree_breaks_ties_on_top_difference() {
        // White can win by covering Red's only top (0→1 or 3-2→1).
        let mut cells = empty();
        cells[0] = vec![W];
        cells[1] = vec![R];
        cells[3] = vec![W, W];
        let s = position(cells, W, 0);
        let anti = PolicyPlayer {
            name: "anti".into(),
            policy: Policy::List(vec![Criterion {
                feature: 0,
                sign: -1.0,
            }]),
        };
        for m in anti.best_moves(&s, &RuleSet::Uncapped) {
            let next = apply_move(&s, m).unwrap();
            assert!(pogofish_engine::base_outcome(&next).is_some());
        }
        // A constant tree rates every move alike: it falls back to the top difference.
        let tree = Tree {
            nodes: vec![Node::Leaf {
                rate: 0.5,
                weight: 1.0,
            }],
        };
        let rows = vec![row(&[(0, 1.0)]), row(&[(0, 3.0)]), row(&[(0, 3.0)])];
        let p = Policy::Tree {
            tree,
            negated: false,
        };
        assert_eq!(p.choose_among(&[0.0; POS_FEATURES], &rows), vec![1, 2]);
    }

    /// Indices recorded from the unmodified `perfect learn` (seed 31,
    /// 200 train and 200 test positions per class) before the sampler moved
    /// into the library.
    #[test]
    #[ignore = "needs the solved table: POGOFISH_TABLE=models/v3-solve"]
    fn held_out_matches_perfect_learn_order() {
        let dir = std::env::var("POGOFISH_TABLE")
            .expect("POGOFISH_TABLE must name the directory holding table.bin and reachable.bin");
        let sv = Solved::load(std::path::Path::new(&dir)).expect("load the solved table");
        let (won, drawn) = held_out(&sv, 200, 200, 31);
        assert_eq!(
            &won[..5],
            &[1897416, 69852433, 185092407, 81198008, 81785303]
        );
        assert_eq!(
            &drawn[..5],
            &[184960122, 211983030, 78147537, 87706101, 32749533]
        );
    }
}
