//! A tabular value learner: classical reinforcement learning without a net
//! (round 4, `docs/experiments/v4-evaluation.md`, "Tabular learner —
//! pre-registration").
//!
//! One value V per position, dense: a `Vec<f32>` indexed by [`Game::rank`]
//! (board and player to move), plus a bitset of the positions whose value was
//! ever updated. The game is deterministic, so V defines Q for every move:
//! Q(s, a) is the exact result when the move ends the game under the live
//! rules (+1 a win for the mover, −1 a loss, including a third occurrence
//! under `lc1-2`), else −V(s′), s′ the position after the move (the opponent
//! to move). At each ply, before the move, V(s) ← V(s) + α·(max_a Q(s, a) −
//! V(s)) (Q-learning in afterstate form); the move is ε-greedy on Q, ties
//! uniform. A game cut at the ply limit has no result and no terminal reward;
//! the updates already made stand.
//!
//! V ignores history, so under `lc1-2` it is not a Markov state; the max
//! target still sees repetition losses through the live rules, played on the
//! real history.
//!
//! A run lives in a directory: `v.bin` (V, raw little-endian f32),
//! `visited.bin` (the bitset, little-endian u64 words), `state.json`
//! (counters, generator, checksums of the two files), `config.json` and
//! `metrics.jsonl`. A save writes the three files of the new generation to
//! temporary names, keeps the current generation as the previous one in
//! `prev/` (hard links, so no copy, but twice the disk while both differ),
//! then renames the new files into place, `state.json` last. `state.json`
//! carries the checksums, so a save cut between two renames is detected on
//! load, and the run resumes from `prev/` instead of from mixed files.

use crate::retro::{Bitset, Board, Game};
use crate::rng::SplitMix64;
use anyhow::{ensure, Context};
use pogofish_engine::{
    apply_move_under, is_terminal, legal_moves, GameState, Move, Outcome, RuleSet,
};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

/// The run's settings. The defaults are the pre-registered constants, except
/// `games`, the run length, which the pilot sets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QConfig {
    pub rules: String,
    /// Games in the run; ε decays over them.
    pub games: u64,
    pub alpha: f32,
    pub eps_start: f64,
    pub eps_end: f64,
    pub max_plies: u32,
    pub seed: u64,
}

impl Default for QConfig {
    fn default() -> Self {
        Self {
            rules: "lc1-2".into(),
            games: 0,
            alpha: 0.1,
            eps_start: 1.0,
            eps_end: 0.05,
            max_plies: 1000,
            seed: 1,
        }
    }
}

impl QConfig {
    /// ε for the game played after `game` games: linear from `eps_start`
    /// (first game) to `eps_end` (last game).
    pub fn epsilon(&self, game: u64) -> f64 {
        let span = self.games.saturating_sub(1).max(1) as f64;
        let x = (game as f64 / span).min(1.0);
        self.eps_start + (self.eps_end - self.eps_start) * x
    }
}

/// Counters and generator, saved with V.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QState {
    pub games_played: u64,
    /// Plies played, which is also the number of updates made.
    pub plies: u64,
    /// Games cut at the ply limit (no result, no terminal reward).
    pub unfinished: u64,
    pub rng_state: u64,
    /// Positions whose value was updated at least once.
    pub visited: u64,
    /// Checksums of `v.bin` and `visited.bin` as written with this state.
    pub v_checksum: u64,
    pub visited_checksum: u64,
}

/// How a game ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameEnd {
    Ended(Outcome),
    /// Cut at the ply limit.
    Truncated,
}

/// The value of an ended game for the player who made the last move.
fn result_for(o: Outcome, mover: pogofish_engine::Color) -> f32 {
    match o.winner() {
        None => 0.0,
        Some(w) if w == mover => 1.0,
        Some(_) => -1.0,
    }
}

/// The update rule: V + α·(target − V).
pub fn updated(v: f32, target: f32, alpha: f32) -> f32 {
    v + alpha * (target - v)
}

/// Indices of the maximum values (exact ties).
pub fn argmax_all(xs: &[f32]) -> Vec<usize> {
    let mut best: Vec<usize> = Vec::new();
    for (i, &x) in xs.iter().enumerate() {
        match best.first() {
            Some(&b) if x < xs[b] => {}
            Some(&b) if x == xs[b] => best.push(i),
            _ => best = vec![i],
        }
    }
    best
}

/// FNV-style checksum over little-endian u64 words, fed chunk by chunk.
#[derive(Clone, Copy)]
struct Checksum(u64);

impl Checksum {
    fn new() -> Self {
        Checksum(0xcbf2_9ce4_8422_2325)
    }
    fn feed(&mut self, bytes: &[u8]) {
        for c in bytes.chunks(8) {
            let mut w = [0u8; 8];
            w[..c.len()].copy_from_slice(c);
            self.0 = (self.0 ^ u64::from_le_bytes(w)).wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
}

const CHUNK: usize = 1 << 20;

/// The temporary name a file of `path` is written under before its rename.
fn staged(path: &Path) -> PathBuf {
    path.with_extension("tmp")
}

/// Write `bytes` (produced chunk by chunk) to `path` through a temporary
/// file and a rename; returns the checksum of what was written.
fn write_atomic(
    path: &Path,
    fill: impl FnMut(&mut dyn FnMut(&[u8]) -> std::io::Result<()>) -> std::io::Result<()>,
) -> anyhow::Result<u64> {
    let sum = write_staged(path, fill)?;
    install(path)?;
    Ok(sum)
}

/// Rename the staged file of `path` into place.
fn install(path: &Path) -> anyhow::Result<()> {
    std::fs::rename(staged(path), path).with_context(|| format!("renaming to {}", path.display()))
}

/// Write `bytes` (produced chunk by chunk) to the staged name of `path`,
/// synced; returns the checksum of what was written.
fn write_staged(
    path: &Path,
    mut fill: impl FnMut(&mut dyn FnMut(&[u8]) -> std::io::Result<()>) -> std::io::Result<()>,
) -> anyhow::Result<u64> {
    let tmp = staged(path);
    let mut f = std::io::BufWriter::new(
        std::fs::File::create(&tmp).with_context(|| format!("creating {}", tmp.display()))?,
    );
    let mut sum = Checksum::new();
    fill(&mut |b: &[u8]| {
        sum.feed(b);
        f.write_all(b)
    })?;
    let f = f.into_inner().map_err(|e| e.into_error())?;
    f.sync_all()?;
    Ok(sum.0)
}

/// The learnt table: V per position and the visited bitset.
pub struct QTable {
    pub v: Vec<f32>,
    pub visited: Bitset,
}

impl QTable {
    /// V₀ = 0 everywhere, nothing visited.
    pub fn new(size: u64) -> QTable {
        QTable {
            v: vec![0.0; size as usize],
            visited: Bitset::new(size),
        }
    }

    pub fn value(&self, g: &Game, s: &GameState) -> f32 {
        self.v[g.rank(&Board::from_state(s)) as usize]
    }

    pub fn is_visited(&self, g: &Game, s: &GameState) -> bool {
        self.visited.get(g.rank(&Board::from_state(s)))
    }

    /// Every legal move with Q(s, a): the exact result if the move ends the
    /// game under `rules` (on `s`'s history), else −V(position after it).
    pub fn q_values(&self, g: &Game, s: &GameState, rules: &RuleSet) -> Vec<(Move, f32)> {
        let mover = s.to_move();
        legal_moves(s)
            .into_iter()
            .map(|m| {
                let next = apply_move_under(s, m, rules).expect("legal move");
                let q = match is_terminal(&next, rules) {
                    Some(o) => result_for(o, mover),
                    None => -self.value(g, &next),
                };
                (m, q)
            })
            .collect()
    }

    /// Update V(s) towards max_a Q(s, a) and mark `s` visited; returns the
    /// Q values it used (unchanged by the update: no child is `s`, whose
    /// player to move differs).
    pub fn update(
        &mut self,
        g: &Game,
        s: &GameState,
        rules: &RuleSet,
        alpha: f32,
    ) -> Vec<(Move, f32)> {
        let qs = self.q_values(g, s, rules);
        let target = qs.iter().map(|&(_, q)| q).fold(f32::NEG_INFINITY, f32::max);
        let i = g.rank(&Board::from_state(s));
        self.v[i as usize] = updated(self.v[i as usize], target, alpha);
        self.visited.set(i);
        qs
    }

    /// Write `v.bin` and `visited.bin` of `dir` to their staged names;
    /// returns their checksums.
    fn save_staged(&self, dir: &Path) -> anyhow::Result<(u64, u64)> {
        let v_sum = write_staged(&dir.join("v.bin"), |out| {
            let mut buf = Vec::with_capacity(CHUNK * 4);
            for chunk in self.v.chunks(CHUNK) {
                buf.clear();
                for x in chunk {
                    buf.extend_from_slice(&x.to_le_bytes());
                }
                out(&buf)?;
            }
            Ok(())
        })?;
        let bytes = self.visited.to_bytes();
        let b_sum = write_staged(&dir.join("visited.bin"), |out| out(&bytes))?;
        Ok((v_sum, b_sum))
    }

    /// Load `v.bin` (any path) and the `visited.bin` and `state.json` next to
    /// it; the files must be the ones `state.json` was saved with.
    pub fn load(v_path: &Path, size: u64) -> anyhow::Result<(QTable, QState)> {
        let dir = v_path.parent().unwrap_or(Path::new("."));
        let state_path = dir.join("state.json");
        let state: QState = serde_json::from_str(
            &std::fs::read_to_string(&state_path)
                .with_context(|| format!("reading {}", state_path.display()))?,
        )
        .with_context(|| format!("parsing {}", state_path.display()))?;
        let mut f =
            std::fs::File::open(v_path).with_context(|| format!("opening {}", v_path.display()))?;
        let len = f.metadata()?.len();
        ensure!(
            len == size * 4,
            "{} has {len} bytes, expected {} (one f32 per position)",
            v_path.display(),
            size * 4
        );
        let mut v = Vec::with_capacity(size as usize);
        let mut buf = vec![0u8; CHUNK * 4];
        let mut sum = Checksum::new();
        let mut left = len as usize;
        while left > 0 {
            let n = left.min(buf.len());
            f.read_exact(&mut buf[..n])?;
            sum.feed(&buf[..n]);
            v.extend(
                buf[..n]
                    .chunks_exact(4)
                    .map(|c| f32::from_le_bytes(c.try_into().expect("4 bytes"))),
            );
            left -= n;
        }
        let bits_path = dir.join("visited.bin");
        let bytes = std::fs::read(&bits_path)
            .with_context(|| format!("reading {}", bits_path.display()))?;
        ensure!(
            bytes.len() as u64 == size.div_ceil(64) * 8,
            "{} has {} bytes, expected {}",
            bits_path.display(),
            bytes.len(),
            size.div_ceil(64) * 8
        );
        let mut bsum = Checksum::new();
        bsum.feed(&bytes);
        ensure!(
            sum.0 == state.v_checksum && bsum.0 == state.visited_checksum,
            "{} and {} are not the files {} was saved with (a save cut short?)",
            v_path.display(),
            bits_path.display(),
            state_path.display()
        );
        let visited = Bitset::from_bytes(&bytes);
        Ok((QTable { v, visited }, state))
    }
}

/// Play one self-play game from `start`, updating V at every ply before the
/// move; ε-greedy on Q with uniform ties. Returns how it ended and the plies
/// played.
pub fn play_game(
    table: &mut QTable,
    g: &Game,
    start: &GameState,
    rules: &RuleSet,
    cfg: &QConfig,
    eps: f64,
    rng: &mut SplitMix64,
) -> (GameEnd, u32) {
    let mut s = start.clone();
    if let Some(o) = is_terminal(&s, rules) {
        return (GameEnd::Ended(o), 0);
    }
    let mut plies = 0;
    loop {
        if plies == cfg.max_plies {
            return (GameEnd::Truncated, plies);
        }
        let qs = table.update(g, &s, rules, cfg.alpha);
        let m = if rng.unit_f64() < eps {
            qs[rng.below(qs.len())].0
        } else {
            let scores: Vec<f32> = qs.iter().map(|&(_, q)| q).collect();
            let tied = argmax_all(&scores);
            qs[tied[rng.below(tied.len())]].0
        };
        s = apply_move_under(&s, m, rules).expect("legal move");
        plies += 1;
        if let Some(o) = is_terminal(&s, rules) {
            return (GameEnd::Ended(o), plies);
        }
    }
}

/// How a call to [`train`] stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QStop {
    Finished,
    Interrupted,
}

fn config_path(dir: &Path) -> PathBuf {
    dir.join("config.json")
}

fn state_path(dir: &Path) -> PathBuf {
    dir.join("state.json")
}

/// The directory holding the previous generation of a run.
pub fn prev_dir(dir: &Path) -> PathBuf {
    dir.join("prev")
}

/// The files of one generation, `state.json` last (the order of install).
const GENERATION: [&str; 3] = ["v.bin", "visited.bin", "state.json"];

/// Save the run. The new generation is written to staged names first; when
/// `current_is_whole` (the files in place are a generation that loads), they
/// are hard-linked into `prev/`, replacing the previous one, before the new
/// files are renamed into place. When it is not (the run resumed from
/// `prev/`), `prev/` is the only whole generation and is left alone.
fn save_run(
    dir: &Path,
    table: &QTable,
    state: &mut QState,
    current_is_whole: bool,
) -> anyhow::Result<()> {
    let (v_sum, b_sum) = table.save_staged(dir)?;
    state.v_checksum = v_sum;
    state.visited_checksum = b_sum;
    let text = serde_json::to_string_pretty(state)? + "\n";
    write_staged(&state_path(dir), |out| out(text.as_bytes()))?;
    if current_is_whole && state_path(dir).exists() {
        let (prev, link) = (prev_dir(dir), dir.join("prev.tmp"));
        if link.exists() {
            std::fs::remove_dir_all(&link)?;
        }
        std::fs::create_dir(&link).with_context(|| format!("creating {}", link.display()))?;
        for f in GENERATION {
            std::fs::hard_link(dir.join(f), link.join(f))
                .with_context(|| format!("linking {} into {}", f, link.display()))?;
        }
        if prev.exists() {
            std::fs::remove_dir_all(&prev)?;
        }
        std::fs::rename(&link, &prev).with_context(|| format!("renaming to {}", prev.display()))?;
    }
    for f in GENERATION {
        install(&dir.join(f))?;
    }
    Ok(())
}

/// Load the run saved in `dir`: the current generation, or the previous one
/// in `prev/` when the current files do not load (a save cut between two
/// renames). `None` when no generation was ever saved. The flag is true
/// when the current generation loaded.
pub fn load_run(dir: &Path, size: u64) -> anyhow::Result<Option<(QTable, QState, bool)>> {
    let prev = prev_dir(dir);
    if !state_path(dir).exists() && !state_path(&prev).exists() {
        return Ok(None);
    }
    match QTable::load(&dir.join("v.bin"), size) {
        Ok((t, s)) => Ok(Some((t, s, true))),
        Err(current) if state_path(&prev).exists() => {
            let (t, s) = QTable::load(&prev.join("v.bin"), size).with_context(|| {
                format!(
                    "the current generation does not load ({current:#}), nor does the previous one"
                )
            })?;
            eprintln!(
                "{current:#}; resuming from the previous generation in {}",
                prev.display()
            );
            Ok(Some((t, s, false)))
        }
        Err(current) => Err(current),
    }
}

/// Train, or resume the run found in `dir` (its saved config must equal
/// `cfg`: ε decays over `cfg.games`, so changing the length would change the
/// games already played). A finished run is left untouched. Saves when
/// `stop` returns true (checked between games, with the state so far), at
/// the end, and at the first game boundary after every `save_every_s`
/// seconds; where the saves fall does not change the run, so a resumed run
/// is bit-identical to an uninterrupted one.
pub fn train(
    cfg: &QConfig,
    dir: &Path,
    g: &Game,
    start: &GameState,
    save_every_s: f64,
    mut stop: impl FnMut(&QState) -> bool,
) -> anyhow::Result<QStop> {
    let rules: RuleSet = cfg.rules.parse().map_err(anyhow::Error::msg)?;
    ensure!(cfg.games > 0, "--games must be at least 1");
    std::fs::create_dir_all(dir).with_context(|| format!("creating {}", dir.display()))?;
    if config_path(dir).exists() {
        let saved: QConfig = serde_json::from_str(&std::fs::read_to_string(config_path(dir))?)?;
        ensure!(
            saved == *cfg,
            "{} holds a run with a different configuration: {saved:?}",
            dir.display()
        );
    }
    let (mut table, mut state, mut current_is_whole) = match load_run(dir, g.size())? {
        Some(run) => run,
        None => {
            let state = QState {
                games_played: 0,
                plies: 0,
                unfinished: 0,
                rng_state: cfg.seed,
                visited: 0,
                v_checksum: 0,
                visited_checksum: 0,
            };
            (QTable::new(g.size()), state, false)
        }
    };
    if state.games_played >= cfg.games {
        return Ok(QStop::Finished);
    }
    let text = serde_json::to_string_pretty(cfg)? + "\n";
    write_atomic(&config_path(dir), |out| out(text.as_bytes()))?;

    let started = Instant::now();
    let mut last_save = Instant::now();
    let mut rng = SplitMix64::new(state.rng_state);
    let (games0, plies0) = (state.games_played, state.plies);
    let log = |state: &QState, table: &QTable, eps: f64| -> anyhow::Result<()> {
        let secs = started.elapsed().as_secs_f64();
        let entry = serde_json::json!({
            "games_played": state.games_played,
            "plies": state.plies,
            "unfinished": state.unfinished,
            "visited": table.visited.count(),
            "epsilon": eps,
            "seconds_this_session": secs,
            "games_per_s": (state.games_played - games0) as f64 / secs.max(1e-9),
            "plies_per_s": (state.plies - plies0) as f64 / secs.max(1e-9),
        });
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("metrics.jsonl"))?;
        writeln!(f, "{entry}")?;
        eprintln!("{entry}");
        Ok(())
    };
    while state.games_played < cfg.games {
        state.rng_state = rng.state();
        if stop(&state) {
            state.visited = table.visited.count();
            save_run(dir, &table, &mut state, current_is_whole)?;
            log(&state, &table, cfg.epsilon(state.games_played))?;
            return Ok(QStop::Interrupted);
        }
        let eps = cfg.epsilon(state.games_played);
        let (end, plies) = play_game(&mut table, g, start, &rules, cfg, eps, &mut rng);
        state.games_played += 1;
        state.plies += plies as u64;
        if end == GameEnd::Truncated {
            state.unfinished += 1;
        }
        if last_save.elapsed().as_secs_f64() >= save_every_s {
            state.rng_state = rng.state();
            state.visited = table.visited.count();
            save_run(dir, &table, &mut state, current_is_whole)?;
            current_is_whole = true;
            log(&state, &table, eps)?;
            last_save = Instant::now();
        }
    }
    state.rng_state = rng.state();
    state.visited = table.visited.count();
    save_run(dir, &table, &mut state, current_is_whole)?;
    log(&state, &table, cfg.epsilon(cfg.games - 1))?;
    Ok(QStop::Finished)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::retro::MoveRule;
    use pogofish_engine::Color;

    const LC1_2: RuleSet = RuleSet::LC1 { repetitions: 2 };

    fn small() -> Game {
        Game::new(3, 3, MoveRule::published())
    }

    /// The first position of the small game, by index, that satisfies `f`.
    fn find(g: &Game, f: impl Fn(&GameState) -> bool) -> GameState {
        (0..g.size())
            .map(|i| g.unrank(i).to_state())
            .find(|s| is_terminal(s, &LC1_2).is_none() && f(s))
            .expect("the small game has such a position")
    }

    fn ends(s: &GameState, m: Move) -> bool {
        is_terminal(&apply_move_under(s, m, &LC1_2).unwrap(), &LC1_2).is_some()
    }

    #[test]
    fn update_matches_hand_computation() {
        let g = small();
        // Two legal moves, neither ending the game.
        let s = find(&g, |s| {
            let ms = legal_moves(s);
            ms.len() == 2 && ms.iter().all(|&m| !ends(s, m))
        });
        let mut t = QTable::new(g.size());
        let ms = legal_moves(&s);
        let child = |m| apply_move_under(&s, m, &LC1_2).unwrap();
        let (a, b) = (child(ms[0]), child(ms[1]));
        t.v[g.rank(&Board::from_state(&a)) as usize] = 0.2;
        t.v[g.rank(&Board::from_state(&b)) as usize] = -0.4;
        assert_eq!(t.value(&g, &s), 0.0);
        assert!(!t.is_visited(&g, &s));
        let qs = t.update(&g, &s, &LC1_2, 0.1);
        assert_eq!(qs, vec![(ms[0], -0.2), (ms[1], 0.4)]);
        // 0 + 0.1 · (0.4 − 0)
        assert!((t.value(&g, &s) - 0.04).abs() < 1e-7, "{}", t.value(&g, &s));
        assert!(t.is_visited(&g, &s));
        assert_eq!(t.visited.count(), 1);

        // A move that wins at once: target 1 whatever the children's values.
        let s = find(&g, |s| {
            let mover = s.to_move();
            legal_moves(s).iter().any(|&m| {
                matches!(is_terminal(&apply_move_under(s, m, &LC1_2).unwrap(), &LC1_2),
                    Some(o) if o.winner() == Some(mover))
            })
        });
        let mut t = QTable::new(g.size());
        for m in legal_moves(&s) {
            let c = apply_move_under(&s, m, &LC1_2).unwrap();
            t.v[g.rank(&Board::from_state(&c)) as usize] = -0.9;
        }
        let qs = t.update(&g, &s, &LC1_2, 0.1);
        assert!(qs.iter().any(|&(_, q)| q == 1.0));
        assert!((t.value(&g, &s) - 0.1).abs() < 1e-7, "{}", t.value(&g, &s));
    }

    #[test]
    fn a_third_occurrence_is_a_loss_in_the_target() {
        let g = small();
        let s = find(&g, |s| legal_moves(s).iter().all(|&m| !ends(s, m)));
        let m = legal_moves(&s)[0];
        let child = apply_move_under(&s, m, &LC1_2).unwrap();
        let s = pogofish_engine::testing::state_with_repeated_key(&s, child.key(), 2);
        let t = QTable::new(g.size());
        let qs = t.q_values(&g, &s, &LC1_2);
        assert_eq!(qs[0], (m, -1.0));
        assert!(qs[1..].iter().all(|&(_, q)| q == 0.0));
    }

    /// A start position of the small game: White to move, a few moves.
    fn small_start(g: &Game) -> GameState {
        find(g, |s| {
            s.to_move() == Color::White
                && legal_moves(s).len() >= 4
                && legal_moves(s).iter().all(|&m| !ends(s, m))
        })
    }

    #[test]
    fn truncated_game_gets_no_terminal_reward() {
        let g = small();
        let start = small_start(&g);
        let cfg = QConfig {
            games: 1,
            ..QConfig::default()
        };
        // A seed whose fully random game ends after a few plies, won by the
        // player who made the last move (not a repetition loss).
        let (seed, len) = (1..200u64)
            .find_map(|seed| {
                let mut t = QTable::new(g.size());
                let mut rng = SplitMix64::new(seed);
                match play_game(&mut t, &g, &start, &LC1_2, &cfg, 1.0, &mut rng) {
                    (GameEnd::Ended(o), n)
                        if n >= 3
                            && o.winner()
                                == Some(if n % 2 == 1 { Color::White } else { Color::Red }) =>
                    {
                        Some((seed, n))
                    }
                    _ => None,
                }
            })
            .expect("some game ends");
        let run = |max_plies: u32| {
            let cfg = QConfig {
                max_plies,
                ..cfg.clone()
            };
            let mut t = QTable::new(g.size());
            let mut rng = SplitMix64::new(seed);
            let end = play_game(&mut t, &g, &start, &LC1_2, &cfg, 1.0, &mut rng);
            (t, end)
        };
        let (ended, e1) = run(1000);
        let (cut, e2) = run(len - 1);
        assert!(matches!(e1, (GameEnd::Ended(_), n) if n == len));
        assert_eq!(e2, (GameEnd::Truncated, len - 1));

        // Replay the moves to find the last position before the end.
        let mut rng = SplitMix64::new(seed);
        let mut t = QTable::new(g.size());
        let mut s = start.clone();
        for _ in 0..len - 1 {
            let qs = t.update(&g, &s, &LC1_2, 0.1);
            let _ = rng.unit_f64();
            let m = qs[rng.below(qs.len())].0;
            s = apply_move_under(&s, m, &LC1_2).unwrap();
        }
        let last = g.rank(&Board::from_state(&s)) as usize;
        let differ: Vec<usize> = (0..ended.v.len())
            .filter(|&i| ended.v[i].to_bits() != cut.v[i].to_bits())
            .collect();
        assert_eq!(differ, vec![last]);
        // The difference is exactly the last update, whose target holds the
        // terminal reward of the move that ended the game.
        let target = cut
            .q_values(&g, &s, &LC1_2)
            .iter()
            .map(|&(_, q)| q)
            .fold(f32::NEG_INFINITY, f32::max);
        assert_eq!(target, 1.0);
        assert_eq!(ended.v[last], updated(cut.v[last], target, 0.1));

        // In a run, the cut game counts as unfinished.
        let dir = std::env::temp_dir().join(format!("qtab-trunc-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let cfg = QConfig {
            games: 1,
            eps_start: 1.0,
            eps_end: 1.0,
            max_plies: len - 1,
            seed,
            ..QConfig::default()
        };
        train(&cfg, &dir, &g, &start, f64::INFINITY, |_| false).unwrap();
        let (_, st) = QTable::load(&dir.join("v.bin"), g.size()).unwrap();
        assert_eq!(
            (st.games_played, st.unfinished, st.plies),
            (1, 1, (len - 1) as u64)
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn resume_is_bit_identical() {
        let g = small();
        let start = small_start(&g);
        let cfg = QConfig {
            games: 60,
            max_plies: 200,
            seed: 7,
            ..QConfig::default()
        };
        let base = std::env::temp_dir().join(format!("qtab-resume-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let (one, two) = (base.join("one"), base.join("two"));
        assert_eq!(
            train(&cfg, &one, &g, &start, f64::INFINITY, |_| false).unwrap(),
            QStop::Finished
        );
        assert_eq!(
            train(&cfg, &two, &g, &start, f64::INFINITY, |s| s.games_played
                == 25)
            .unwrap(),
            QStop::Interrupted
        );
        let (_, half) = QTable::load(&two.join("v.bin"), g.size()).unwrap();
        assert_eq!(half.games_played, 25);
        assert_eq!(
            train(&cfg, &two, &g, &start, 0.0, |_| false).unwrap(),
            QStop::Finished
        );
        for f in ["v.bin", "visited.bin", "state.json"] {
            assert_eq!(
                std::fs::read(one.join(f)).unwrap(),
                std::fs::read(two.join(f)).unwrap(),
                "{f}"
            );
        }
        let (t, st) = QTable::load(&one.join("v.bin"), g.size()).unwrap();
        assert_eq!(st.games_played, 60);
        assert!(st.visited > 0 && st.visited == t.visited.count());
        assert!(t.v.iter().any(|&x| x != 0.0));

        // A finished run is a no-op: nothing is rewritten.
        let before = std::fs::metadata(one.join("v.bin"))
            .unwrap()
            .modified()
            .unwrap();
        assert_eq!(
            train(&cfg, &one, &g, &start, 0.0, |_| false).unwrap(),
            QStop::Finished
        );
        let after = std::fs::metadata(one.join("v.bin"))
            .unwrap()
            .modified()
            .unwrap();
        assert_eq!(before, after);
        // Another configuration is refused.
        let other = QConfig {
            seed: 8,
            ..cfg.clone()
        };
        assert!(train(&other, &one, &g, &start, 0.0, |_| false).is_err());
        // A v.bin that is not the one state.json was saved with is refused.
        let mut bytes = std::fs::read(one.join("v.bin")).unwrap();
        bytes[0] ^= 1;
        std::fs::write(one.join("v.bin"), bytes).unwrap();
        assert!(QTable::load(&one.join("v.bin"), g.size()).is_err());
        std::fs::remove_dir_all(&base).unwrap();
    }

    // Regression: <fix commit> — save_run renamed three files with no
    // previous generation kept, so a save cut between two renames lost the run.
    #[test]
    fn a_save_cut_between_renames_resumes_from_the_previous_generation() {
        let g = small();
        let start = small_start(&g);
        let cfg = QConfig {
            games: 60,
            max_plies: 200,
            seed: 7,
            ..QConfig::default()
        };
        let base = std::env::temp_dir().join(format!("qtab-cut-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let (reference, run, later) = (base.join("ref"), base.join("run"), base.join("later"));
        let games = |state: &Path| -> u64 {
            let text = std::fs::read_to_string(state).unwrap();
            serde_json::from_str::<QState>(&text).unwrap().games_played
        };
        let stop_at = |n: u64| move |s: &QState| s.games_played == n;
        let train_to = |dir: &Path, n: u64| train(&cfg, dir, &g, &start, f64::INFINITY, stop_at(n));
        assert_eq!(
            train(&cfg, &reference, &g, &start, f64::INFINITY, |_| false).unwrap(),
            QStop::Finished
        );
        // Two saves: game 30 in place, game 25 kept as the previous generation.
        assert_eq!(train_to(&run, 25).unwrap(), QStop::Interrupted);
        assert_eq!(train_to(&run, 30).unwrap(), QStop::Interrupted);
        assert_eq!(games(&run.join("prev/state.json")), 25);
        // The next save is cut after renaming v.bin, before state.json: the
        // v.bin in place is game 35's, state.json still game 30's.
        assert_eq!(train_to(&later, 35).unwrap(), QStop::Interrupted);
        std::fs::copy(later.join("v.bin"), run.join("v.bin")).unwrap();
        assert!(QTable::load(&run.join("v.bin"), g.size()).is_err());

        // The run resumes from game 25. Its first save keeps game 25 as the
        // previous generation (the files in place were not a whole one).
        assert_eq!(train_to(&run, 27).unwrap(), QStop::Interrupted);
        assert_eq!(games(&run.join("state.json")), 27);
        assert_eq!(games(&run.join("prev/state.json")), 25);
        assert!(QTable::load(&run.join("prev/v.bin"), g.size()).is_ok());
        // Then it ends exactly where the uninterrupted run does.
        assert_eq!(
            train(&cfg, &run, &g, &start, 0.0, |_| false).unwrap(),
            QStop::Finished
        );
        for f in ["v.bin", "visited.bin", "state.json"] {
            assert_eq!(
                std::fs::read(reference.join(f)).unwrap(),
                std::fs::read(run.join(f)).unwrap(),
                "{f}"
            );
        }
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn epsilon_decays_linearly_over_the_run() {
        let cfg = QConfig {
            games: 11,
            ..QConfig::default()
        };
        assert_eq!(cfg.epsilon(0), 1.0);
        assert!((cfg.epsilon(5) - 0.525).abs() < 1e-12);
        assert!((cfg.epsilon(10) - 0.05).abs() < 1e-12);
        assert!((cfg.epsilon(20) - 0.05).abs() < 1e-12);
    }
}
