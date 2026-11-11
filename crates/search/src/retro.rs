//! Retrograde analysis of the published game (`RuleSet::Uncapped`), the
//! chess-endgame-table method (round 3, `docs/experiments/v3-solve.md`).
//!
//! A position is the board (9 ordered stacks of the pieces) and the player to
//! move; nothing else matters under the uncapped rules. Every position gets an
//! index in `0..Game::size()` through a perfect ranking: the pieces read cell
//! by cell, bottom to top, form a colour sequence (`C(n, red)` of them), the
//! stack heights form a composition of `n` into 9 parts (`C(n + 8, 8)`), and the
//! side to move doubles it. The table holds one `u16` per index.
//!
//! Solving: positions whose mover tops no stack are losses at distance 0. Level
//! by level, every position resolved at distance `d` is expanded backwards
//! through un-moves; a parent of a loss becomes a win at `d + 1`, a parent of a
//! win loses one from its count of unresolved children and becomes a loss at
//! `d + 1` when that count reaches 0. What is never resolved is a draw: neither
//! side can force a win. Distances are in plies, so a win in `d` is reached by
//! the shortest forced line and a loss in `d` by the longest defence.
//!
//! The board representation and move generator here are separate from the
//! engine's (for speed); `tests/retro.rs` checks them against it.

use pogofish_engine::{testing::position, Cell, Color, GameState, DISTANCES, NUM_CELLS};
use std::sync::atomic::{AtomicU16, AtomicU64, Ordering};

/// Table codes. Below `0x100`: an unresolved position's count of children not
/// yet known to be wins for the opponent (only during the solve).
pub const DRAW: u16 = 0x4000;
/// The mover tops every stack: the opponent has already lost. Such a position
/// cannot arise in play (the side that just moved always tops its landing
/// cell), so it is set aside rather than valued.
pub const OVER: u16 = 0x7FFF;
pub const LOSS: u16 = 0x8000;
pub const WIN: u16 = 0xC000;
pub const DIST_MASK: u16 = 0x3FFF;

/// The value of a position for its player to move.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize)]
pub enum Value {
    Win(u16),
    Loss(u16),
    Draw,
    Over,
    /// Not finalised: only seen in a table that is still being solved.
    Pending(u8),
}

pub fn decode(v: u16) -> Value {
    match v {
        DRAW => Value::Draw,
        OVER => Value::Over,
        _ if v & 0xC000 == WIN => Value::Win(v & DIST_MASK),
        _ if v & 0xC000 == LOSS => Value::Loss(v & DIST_MASK),
        _ if v < 0x100 => Value::Pending(v as u8),
        _ => panic!("invalid table code {v:#06x}"),
    }
}

/// Which Manhattan distances a stack of `k` moved pieces may travel:
/// `allowed[k][d]`. [`MoveRule::published`] is the engine's `DISTANCES`; other
/// rules exist only for the mutation control.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MoveRule {
    pub allowed: [[bool; 5]; 4],
}

impl MoveRule {
    pub fn published() -> Self {
        let mut allowed = [[false; 5]; 4];
        for (k, ds) in DISTANCES.iter().enumerate() {
            for &d in ds.iter() {
                allowed[k][d as usize] = true;
            }
        }
        Self { allowed }
    }
}

/// A board in compact form. `c[i]` holds the colours of cell `i`, bit `j` for
/// the `j`-th piece from the bottom, 1 for Red.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Board {
    pub h: [u8; NUM_CELLS],
    pub c: [u16; NUM_CELLS],
    pub red_to_move: bool,
}

/// Whether a position can still be played.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    /// The mover tops no stack: lost.
    Lost,
    /// The opponent tops no stack (see [`OVER`]).
    Over,
    Live,
}

impl Board {
    /// Colour of the top of cell `i` (true = Red), if any.
    #[inline]
    pub fn top(&self, i: usize) -> Option<bool> {
        let h = self.h[i];
        (h > 0).then(|| (self.c[i] >> (h - 1)) & 1 == 1)
    }

    #[inline]
    pub fn tops(&self, red: bool) -> usize {
        (0..NUM_CELLS).filter(|&i| self.top(i) == Some(red)).count()
    }

    #[inline]
    pub fn status(&self) -> Status {
        let mut mine = false;
        let mut theirs = false;
        for i in 0..NUM_CELLS {
            match self.top(i) {
                Some(r) if r == self.red_to_move => mine = true,
                Some(_) => theirs = true,
                None => {}
            }
        }
        match (mine, theirs) {
            (false, _) => Status::Lost,
            (true, false) => Status::Over,
            (true, true) => Status::Live,
        }
    }

    /// Move the top `k` pieces of `from` onto `to` and pass the turn.
    #[inline]
    pub fn moved(&self, from: usize, k: u8, to: usize) -> Board {
        let mut b = *self;
        let rest = b.h[from] - k;
        let block = (b.c[from] >> rest) & ((1 << k) - 1);
        b.c[from] &= (1 << rest) - 1;
        b.h[from] = rest;
        b.c[to] |= block << b.h[to];
        b.h[to] += k;
        b.red_to_move = !b.red_to_move;
        b
    }

    /// The same position with the cells permuted (`perm[i]` is where cell `i` goes).
    pub fn permuted(&self, perm: &[u8; NUM_CELLS]) -> Board {
        let mut b = *self;
        for (i, &to) in perm.iter().enumerate() {
            b.h[to as usize] = self.h[i];
            b.c[to as usize] = self.c[i];
        }
        b
    }

    /// Every piece changes colour and so does the player to move.
    pub fn colour_swapped(&self) -> Board {
        let mut b = *self;
        for i in 0..NUM_CELLS {
            b.c[i] ^= (1u16 << b.h[i]) - 1;
        }
        b.red_to_move = !b.red_to_move;
        b
    }

    pub fn from_state(s: &GameState) -> Board {
        let mut b = Board {
            h: [0; NUM_CELLS],
            c: [0; NUM_CELLS],
            red_to_move: s.to_move() == Color::Red,
        };
        for (i, stack) in s.cells().iter().enumerate() {
            b.h[i] = stack.len() as u8;
            for (j, &p) in stack.iter().enumerate() {
                if p == Color::Red {
                    b.c[i] |= 1 << j;
                }
            }
        }
        b
    }

    /// The engine position (move count 0, empty history).
    pub fn to_state(&self) -> GameState {
        let cells: [Cell; NUM_CELLS] = std::array::from_fn(|i| {
            (0..self.h[i])
                .map(|j| {
                    if (self.c[i] >> j) & 1 == 1 {
                        Color::Red
                    } else {
                        Color::White
                    }
                })
                .collect()
        });
        let mover = if self.red_to_move {
            Color::Red
        } else {
            Color::White
        };
        position(cells, mover, 0)
    }

    /// One line per row, top row first; each cell bottom to top (`W`/`R`), `.` empty.
    pub fn diagram(&self) -> String {
        let cell = |i: usize| -> String {
            if self.h[i] == 0 {
                return ".".into();
            }
            (0..self.h[i])
                .map(|j| if (self.c[i] >> j) & 1 == 1 { 'R' } else { 'W' })
                .collect()
        };
        let mut out = String::new();
        for r in 0..3 {
            let row: Vec<String> = (0..3).map(|c| format!("{:>6}", cell(r * 3 + c))).collect();
            out.push_str(&format!("{}  {}\n", r + 1, row.join(" ")));
        }
        out.push_str(&format!(
            "   {:>6} {:>6} {:>6}   {} to move\n",
            "a",
            "b",
            "c",
            if self.red_to_move { "Red" } else { "White" }
        ));
        out
    }
}

impl Board {
    /// The board a [`Board::diagram`] shows (round 5 reads the puzzles of
    /// `v3-solve/answers.json` back). `None` if the text is not a diagram.
    pub fn from_diagram(text: &str) -> Option<Board> {
        let lines: Vec<&str> = text.lines().collect();
        if lines.len() != 4 {
            return None;
        }
        let mut b = Board {
            h: [0; NUM_CELLS],
            c: [0; NUM_CELLS],
            red_to_move: false,
        };
        for (r, line) in lines[..3].iter().enumerate() {
            let mut words = line.split_whitespace();
            if words.next()? != (r + 1).to_string() {
                return None;
            }
            for c in 0..3 {
                let w = words.next()?;
                let i = r * 3 + c;
                if w == "." {
                    continue;
                }
                for (j, ch) in w.chars().enumerate() {
                    match ch {
                        'R' => b.c[i] |= 1 << j,
                        'W' => {}
                        _ => return None,
                    }
                }
                b.h[i] = w.len() as u8;
            }
            if words.next().is_some() {
                return None;
            }
        }
        b.red_to_move = match lines[3].trim_end() {
            l if l.ends_with("Red to move") => true,
            l if l.ends_with("White to move") => false,
            _ => return None,
        };
        (b.diagram() == text).then_some(b)
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct Dests {
    n: u8,
    d: [u8; 8],
}

/// A variant (piece counts and move rule) with its ranking tables.
pub struct Game {
    pub white: u8,
    pub red: u8,
    pub n: u8,
    pub rule: MoveRule,
    dests: [[Dests; NUM_CELLS]; 4],
    colour_rank: Vec<u32>,
    colour_unrank: Vec<u16>,
    comp_unrank: Vec<[u8; NUM_CELLS]>,
    binom: [[u64; 24]; 24],
    pub n_colour: u64,
    pub n_comp: u64,
}

pub fn binomial(n: u64, k: u64) -> u64 {
    if k > n {
        return 0;
    }
    (0..k).fold(1u64, |acc, i| acc * (n - i) / (i + 1))
}

fn manhattan(a: usize, b: usize) -> usize {
    (a / 3).abs_diff(b / 3) + (a % 3).abs_diff(b % 3)
}

impl Game {
    pub fn new(white: u8, red: u8, rule: MoveRule) -> Game {
        let n = white + red;
        assert!((1..=12).contains(&n), "1 to 12 pieces");
        let mut dests = [[Dests::default(); NUM_CELLS]; 4];
        for (k, row) in dests.iter_mut().enumerate().skip(1) {
            for (from, d) in row.iter_mut().enumerate() {
                for to in 0..NUM_CELLS {
                    if to != from && rule.allowed[k][manhattan(from, to)] {
                        d.d[d.n as usize] = to as u8;
                        d.n += 1;
                    }
                }
            }
        }
        let mut binom = [[0u64; 24]; 24];
        for (a, row) in binom.iter_mut().enumerate() {
            for (b, x) in row.iter_mut().enumerate() {
                *x = binomial(a as u64, b as u64);
            }
        }
        let mut colour_rank = vec![u32::MAX; 1 << n];
        let mut colour_unrank = Vec::new();
        for seq in 0..(1u32 << n) {
            if seq.count_ones() == red as u32 {
                colour_rank[seq as usize] = colour_unrank.len() as u32;
                colour_unrank.push(seq as u16);
            }
        }
        let n_comp = binomial(n as u64 + 8, 8);
        let mut g = Game {
            white,
            red,
            n,
            rule,
            dests,
            colour_rank,
            colour_unrank,
            comp_unrank: Vec::new(),
            binom,
            n_colour: 0,
            n_comp,
        };
        g.n_colour = g.colour_unrank.len() as u64;
        let mut comp_unrank = vec![[0u8; NUM_CELLS]; n_comp as usize];
        let mut h = [0u8; NUM_CELLS];
        fn rec(
            g: &Game,
            cell: usize,
            left: u8,
            h: &mut [u8; NUM_CELLS],
            out: &mut [[u8; NUM_CELLS]],
        ) {
            if cell == NUM_CELLS - 1 {
                h[cell] = left;
                out[g.comp_rank(h) as usize] = *h;
                return;
            }
            for x in 0..=left {
                h[cell] = x;
                rec(g, cell + 1, left - x, h, out);
            }
        }
        rec(&g, 0, n, &mut h, &mut comp_unrank);
        g.comp_unrank = comp_unrank;
        g
    }

    /// The published game: 6 White, 6 Red, the engine's distances.
    pub fn published() -> Game {
        Game::new(6, 6, MoveRule::published())
    }

    /// Number of indices: boards × 2 sides to move.
    pub fn size(&self) -> u64 {
        2 * self.n_colour * self.n_comp
    }

    /// Colex rank of the bar positions of the composition (stars and bars).
    #[inline]
    fn comp_rank(&self, h: &[u8; NUM_CELLS]) -> u64 {
        let mut r = 0;
        let mut p = 0usize;
        for (i, &x) in h.iter().take(NUM_CELLS - 1).enumerate() {
            p += x as usize;
            r += self.binom[p + i][i + 1];
        }
        r
    }

    #[inline]
    pub fn rank(&self, b: &Board) -> u64 {
        let mut seq = 0u32;
        let mut off = 0;
        for i in 0..NUM_CELLS {
            seq |= (b.c[i] as u32) << off;
            off += b.h[i];
        }
        let colour = self.colour_rank[seq as usize] as u64;
        debug_assert!(colour != u32::MAX as u64, "wrong piece counts");
        ((b.red_to_move as u64) * self.n_colour + colour) * self.n_comp + self.comp_rank(&b.h)
    }

    #[inline]
    pub fn unrank(&self, idx: u64) -> Board {
        let comp = idx % self.n_comp;
        let rest = idx / self.n_comp;
        let h = self.comp_unrank[comp as usize];
        let mut seq = self.colour_unrank[(rest % self.n_colour) as usize];
        let mut c = [0u16; NUM_CELLS];
        for i in 0..NUM_CELLS {
            c[i] = seq & ((1 << h[i]) - 1);
            seq >>= h[i];
        }
        Board {
            h,
            c,
            red_to_move: rest / self.n_colour == 1,
        }
    }

    /// The start position (White to move); needs 6 + 6 pieces.
    pub fn start(&self) -> Board {
        Board::from_state(&pogofish_engine::initial_state())
    }

    /// Every legal move of `b`'s mover, applied (engine order: source cell,
    /// then piece count, then destination). Call only on a live position.
    #[inline]
    pub fn for_each_child(&self, b: &Board, mut f: impl FnMut(Board)) {
        for from in 0..NUM_CELLS {
            if b.top(from) != Some(b.red_to_move) {
                continue;
            }
            for k in 1..=b.h[from].min(3) {
                let d = &self.dests[k as usize][from];
                for &to in &d.d[..d.n as usize] {
                    f(b.moved(from, k, to as usize));
                }
            }
        }
    }

    /// Legal moves as `(from, k, to)`, in the same order as [`Self::for_each_child`].
    pub fn moves(&self, b: &Board) -> Vec<(u8, u8, u8)> {
        let mut out = Vec::new();
        for from in 0..NUM_CELLS {
            if b.top(from) != Some(b.red_to_move) {
                continue;
            }
            for k in 1..=b.h[from].min(3) {
                let d = &self.dests[k as usize][from];
                for &to in &d.d[..d.n as usize] {
                    out.push((from as u8, k, to));
                }
            }
        }
        out
    }

    #[inline]
    pub fn move_count(&self, b: &Board) -> u32 {
        let mut n = 0;
        for from in 0..NUM_CELLS {
            if b.top(from) != Some(b.red_to_move) {
                continue;
            }
            for k in 1..=b.h[from].min(3) {
                n += self.dests[k as usize][from].n as u32;
            }
        }
        n
    }

    /// Every live position with a legal move to `b`: the player who just
    /// moved (not `b`'s mover) put the top `k` pieces of some stack it tops
    /// there from a cell at an allowed distance. Distances are symmetric, so
    /// the forward destination table serves backwards.
    #[inline]
    pub fn for_each_parent(&self, b: &Board, mut f: impl FnMut(Board)) {
        let just_moved = !b.red_to_move;
        for to in 0..NUM_CELLS {
            if b.top(to) != Some(just_moved) {
                continue;
            }
            for k in 1..=b.h[to].min(3) {
                let d = &self.dests[k as usize][to];
                for &from in &d.d[..d.n as usize] {
                    // Undo: lift k from `to` back onto `from`; the turn returns.
                    let p = b.moved(to, k, from as usize);
                    if p.status() == Status::Live {
                        f(p);
                    }
                }
            }
        }
    }
}

/// View a `u16` table as atomics (same size and alignment).
pub fn as_atomic(t: &mut [u16]) -> &[AtomicU16] {
    // SAFETY: AtomicU16 has the same size and alignment as u16, and the
    // exclusive borrow guarantees no other non-atomic access while it lives.
    unsafe { &*(t as *mut [u16] as *const [AtomicU16]) }
}

/// Run `job(start, end)` on `threads` threads over `0..n` in chunks; results summed.
pub fn par_range(n: u64, threads: usize, job: impl Fn(u64, u64) -> u64 + Sync) -> u64 {
    let chunk = (n / (threads.max(1) as u64 * 64)).clamp(1, 1 << 16);
    let next = AtomicU64::new(0);
    let total = AtomicU64::new(0);
    std::thread::scope(|s| {
        for _ in 0..threads.max(1) {
            s.spawn(|| loop {
                let a = next.fetch_add(chunk, Ordering::Relaxed);
                if a >= n {
                    break;
                }
                let r = job(a, (a + chunk).min(n));
                total.fetch_add(r, Ordering::Relaxed);
            });
        }
    });
    total.into_inner()
}

/// Fill the table: losses at 0, OVER, and each live position's move count.
pub fn init_table(g: &Game, t: &mut [u16], threads: usize) {
    assert_eq!(t.len() as u64, g.size());
    let at = as_atomic(t);
    par_range(g.size(), threads, |a, z| {
        for i in a..z {
            let b = g.unrank(i);
            let v = match b.status() {
                Status::Lost => LOSS,
                Status::Over => OVER,
                Status::Live => {
                    let m = g.move_count(&b);
                    assert!((1..0x100).contains(&m), "move count {m} out of range");
                    m as u16
                }
            };
            at[i as usize].store(v, Ordering::Relaxed);
        }
        0
    });
}

/// Expand every position resolved at distance `level`; returns how many
/// positions were resolved at `level + 1`.
pub fn propagate_level(g: &Game, t: &mut [u16], level: u16, threads: usize) -> u64 {
    assert!(level + 1 < DIST_MASK, "distance overflow");
    let at = as_atomic(t);
    let win_here = WIN | level;
    let loss_here = LOSS | level;
    let win_next = WIN | (level + 1);
    let loss_next = LOSS | (level + 1);
    par_range(g.size(), threads, |a, z| {
        let mut resolved = 0u64;
        for i in a..z {
            let v = at[i as usize].load(Ordering::Relaxed);
            if v != win_here && v != loss_here {
                continue;
            }
            let b = g.unrank(i);
            let child_lost = v == loss_here;
            g.for_each_parent(&b, |p| {
                let slot = &at[g.rank(&p) as usize];
                let r = slot.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |x| {
                    if x >= 0x100 {
                        None
                    } else if child_lost {
                        Some(win_next)
                    } else if x == 1 {
                        Some(loss_next)
                    } else {
                        Some(x - 1)
                    }
                });
                if let Ok(old) = r {
                    if child_lost || old == 1 {
                        resolved += 1;
                    }
                }
            });
        }
        resolved
    })
}

/// Turn every unresolved count into DRAW.
pub fn finalize(t: &mut [u16]) {
    for v in t.iter_mut() {
        if *v < 0x100 {
            *v = DRAW;
        }
    }
}

/// Solve a whole table in memory (small variants and tests). Returns the
/// largest distance.
pub fn solve_in_memory(g: &Game, threads: usize) -> (Vec<u16>, u16) {
    let mut t = vec![0u16; g.size() as usize];
    init_table(g, &mut t, threads);
    let mut level = 0;
    while propagate_level(g, &mut t, level, threads) > 0 {
        level += 1;
    }
    finalize(&mut t);
    (t, level)
}

/// Violations found by [`check_consistency`], by kind.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct Violations {
    /// Loss at 0 / OVER / live status does not match the board.
    pub status: u64,
    /// A win with no move to a loss at distance − 1, or with a faster one.
    pub win: u64,
    /// A loss with a move to a non-win, or whose longest defence is not distance − 1.
    pub loss: u64,
    /// A draw with a move to a loss, or with no move to a draw.
    pub draw: u64,
    /// A child valued OVER or still pending.
    pub child: u64,
    /// Indices of the first few violations, for diagnosis.
    pub examples: Vec<u64>,
}

impl Violations {
    pub fn total(&self) -> u64 {
        self.status + self.win + self.loss + self.draw + self.child
    }
}

/// Recompute each position's value from its children's and compare, over
/// every index in `0..g.size()` (or `indices` when given).
pub fn check_consistency(
    g: &Game,
    t: &[u16],
    threads: usize,
    indices: Option<&[u64]>,
) -> Violations {
    use std::sync::Mutex;
    let out = Mutex::new(Violations::default());
    let check = |i: u64, v: &mut Violations| {
        let b = g.unrank(i);
        let val = decode(t[i as usize]);
        let ok_status = match b.status() {
            Status::Lost => val == Value::Loss(0),
            Status::Over => val == Value::Over,
            Status::Live => matches!(val, Value::Win(_) | Value::Draw)
                || matches!(val, Value::Loss(d) if d > 0),
        };
        let mut bad = false;
        if !ok_status {
            v.status += 1;
            bad = true;
        } else if b.status() == Status::Live {
            let mut min_loss = u16::MAX;
            let mut max_win = 0u16;
            let mut any_draw = false;
            let mut non_win = false;
            let mut bad_child = false;
            g.for_each_child(&b, |c| match decode(t[g.rank(&c) as usize]) {
                Value::Loss(d) => {
                    min_loss = min_loss.min(d);
                    non_win = true;
                }
                Value::Win(d) => max_win = max_win.max(d),
                Value::Draw => {
                    any_draw = true;
                    non_win = true;
                }
                _ => bad_child = true,
            });
            if bad_child {
                v.child += 1;
                bad = true;
            }
            match val {
                Value::Win(d) if min_loss == u16::MAX || min_loss + 1 != d => {
                    v.win += 1;
                    bad = true;
                }
                Value::Loss(d) if non_win || max_win + 1 != d => {
                    v.loss += 1;
                    bad = true;
                }
                Value::Draw if min_loss != u16::MAX || !any_draw => {
                    v.draw += 1;
                    bad = true;
                }
                _ => {}
            }
        }
        if bad && v.examples.len() < 10 {
            v.examples.push(i);
        }
    };
    let merge = |local: Violations| {
        let mut o = out.lock().unwrap();
        o.status += local.status;
        o.win += local.win;
        o.loss += local.loss;
        o.draw += local.draw;
        o.child += local.child;
        for e in local.examples {
            if o.examples.len() < 10 {
                o.examples.push(e);
            }
        }
    };
    match indices {
        Some(list) => {
            let mut v = Violations::default();
            for &i in list {
                check(i, &mut v);
            }
            merge(v);
        }
        None => {
            par_range(g.size(), threads, |a, z| {
                let mut v = Violations::default();
                for i in a..z {
                    check(i, &mut v);
                }
                merge(v);
                0
            });
        }
    }
    out.into_inner().unwrap()
}

/// Positions whose value differs from that of their image under one of the
/// 8 board symmetries (`perms`) or under the colour swap.
pub fn check_symmetry(
    g: &Game,
    t: &[u16],
    perms: &[[u8; NUM_CELLS]],
    threads: usize,
) -> (u64, u64) {
    let board_bad = AtomicU64::new(0);
    let swap_bad = par_range(g.size(), threads, |a, z| {
        let mut swap = 0;
        let mut board = 0;
        for i in a..z {
            let b = g.unrank(i);
            let v = t[i as usize];
            for p in perms {
                if t[g.rank(&b.permuted(p)) as usize] != v {
                    board += 1;
                }
            }
            if t[g.rank(&b.colour_swapped()) as usize] != v {
                swap += 1;
            }
        }
        board_bad.fetch_add(board, Ordering::Relaxed);
        swap
    });
    (board_bad.into_inner(), swap_bad)
}

/// A bit per index.
pub struct Bitset {
    pub words: Vec<AtomicU64>,
}

impl Bitset {
    pub fn new(n: u64) -> Bitset {
        Bitset {
            words: (0..n.div_ceil(64)).map(|_| AtomicU64::new(0)).collect(),
        }
    }

    #[inline]
    pub fn get(&self, i: u64) -> bool {
        self.words[(i / 64) as usize].load(Ordering::Relaxed) >> (i % 64) & 1 == 1
    }

    /// Set bit `i`; true if it was clear.
    #[inline]
    pub fn set(&self, i: u64) -> bool {
        let m = 1u64 << (i % 64);
        self.words[(i / 64) as usize].fetch_or(m, Ordering::Relaxed) & m == 0
    }

    pub fn count(&self) -> u64 {
        self.words
            .iter()
            .map(|w| w.load(Ordering::Relaxed).count_ones() as u64)
            .sum()
    }

    pub fn clear(&self) {
        for w in &self.words {
            w.store(0, Ordering::Relaxed);
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        self.words
            .iter()
            .flat_map(|w| w.load(Ordering::Relaxed).to_le_bytes())
            .collect()
    }

    pub fn from_bytes(bytes: &[u8]) -> Bitset {
        Bitset {
            words: bytes
                .chunks_exact(8)
                .map(|c| AtomicU64::new(u64::from_le_bytes(c.try_into().unwrap())))
                .collect(),
        }
    }
}

/// Breadth-first search over positions from `start`: forward through legal
/// moves (never out of a lost position), or backward through un-moves,
/// keeping only indices set in `within` when given. Returns the visited set
/// and the number of positions first reached at each depth.
pub fn bfs(
    g: &Game,
    start: &Board,
    threads: usize,
    backward: bool,
    within: Option<&Bitset>,
) -> (Bitset, Vec<u64>) {
    let n = g.size();
    let seen = Bitset::new(n);
    let mut frontier = Bitset::new(n);
    let mut next = Bitset::new(n);
    let s = g.rank(start);
    seen.set(s);
    frontier.set(s);
    let mut per_depth = vec![1u64];
    loop {
        let found = par_range(frontier.words.len() as u64, threads, |a, z| {
            let mut found = 0;
            for w in a..z {
                let mut bits = frontier.words[w as usize].load(Ordering::Relaxed);
                while bits != 0 {
                    let i = w * 64 + bits.trailing_zeros() as u64;
                    bits &= bits - 1;
                    let b = g.unrank(i);
                    let mut visit = |c: Board| {
                        let j = g.rank(&c);
                        if within.map_or(true, |w| w.get(j)) && seen.set(j) {
                            next.set(j);
                            found += 1;
                        }
                    };
                    if backward {
                        g.for_each_parent(&b, &mut visit);
                    } else if b.status() == Status::Live {
                        g.for_each_child(&b, &mut visit);
                    }
                }
            }
            found
        });
        if found == 0 {
            break;
        }
        per_depth.push(found);
        std::mem::swap(&mut frontier, &mut next);
        next.clear();
    }
    (seen, per_depth)
}

// ------------------------------------------------------------ table files

const MAGIC: &[u8; 8] = b"POGORT01";

/// Write a table file: magic, next level to expand (u16), done flag (u16),
/// 4 bytes padding, then one little-endian u16 per index. Level and data go
/// to a temporary file renamed into place, so a crash never pairs a table
/// with the wrong level (re-expanding a level would decrement counts twice).
pub fn save_table(path: &std::path::Path, t: &[u16], level: u16, done: bool) -> std::io::Result<()> {
    use std::io::Write;
    let tmp = path.with_extension("tmp");
    {
        let mut w = std::io::BufWriter::with_capacity(1 << 22, std::fs::File::create(&tmp)?);
        w.write_all(MAGIC)?;
        w.write_all(&level.to_le_bytes())?;
        w.write_all(&(done as u16).to_le_bytes())?;
        w.write_all(&[0; 4])?;
        let mut buf = Vec::with_capacity(1 << 21);
        for chunk in t.chunks(1 << 20) {
            buf.clear();
            for v in chunk {
                buf.extend_from_slice(&v.to_le_bytes());
            }
            w.write_all(&buf)?;
        }
        w.flush()?;
        w.get_ref().sync_all()?;
    }
    std::fs::rename(&tmp, path)
}

/// Read a table file: the table, the next level to expand, and whether it is finished.
pub fn load_table(path: &std::path::Path, size: u64) -> anyhow::Result<(Vec<u16>, u16, bool)> {
    use std::io::Read;
    let mut r = std::io::BufReader::with_capacity(1 << 22, std::fs::File::open(path)?);
    let mut header = [0u8; 16];
    r.read_exact(&mut header)?;
    if &header[..8] != MAGIC {
        anyhow::bail!("{} is not a table file", path.display());
    }
    let level = u16::from_le_bytes([header[8], header[9]]);
    let done = u16::from_le_bytes([header[10], header[11]]) == 1;
    let mut t = vec![0u16; size as usize];
    let mut buf = vec![0u8; 1 << 21];
    for chunk in t.chunks_mut(1 << 20) {
        let bytes = &mut buf[..chunk.len() * 2];
        r.read_exact(bytes)?;
        for (v, b) in chunk.iter_mut().zip(bytes.chunks_exact(2)) {
            *v = u16::from_le_bytes([b[0], b[1]]);
        }
    }
    let mut rest = [0u8; 1];
    if r.read(&mut rest)? != 0 {
        anyhow::bail!("{} is longer than a table of {size} entries", path.display());
    }
    Ok((t, level, done))
}

/// The finished table in `dir/table.bin`.
pub fn load_solved(g: &Game, dir: &std::path::Path) -> anyhow::Result<Vec<u16>> {
    let (t, _, done) = load_table(&dir.join("table.bin"), g.size())?;
    if !done {
        anyhow::bail!("the table in {} is not finished: run `retro solve` first", dir.display());
    }
    Ok(t)
}

/// The reachable set in `dir/reachable.bin`.
pub fn load_reachable(g: &Game, dir: &std::path::Path) -> anyhow::Result<Bitset> {
    let bytes = std::fs::read(dir.join("reachable.bin"))
        .map_err(|e| anyhow::anyhow!("reachable.bin: {e} (run `retro reach` first)"))?;
    let b = Bitset::from_bytes(&bytes);
    if b.words.len() as u64 != g.size().div_ceil(64) {
        anyhow::bail!("reachable.bin has the wrong size");
    }
    Ok(b)
}

// ------------------------------------------------------ principles vs table

/// The features of `v2-principles.md`, each in the direction tested there
/// (+1: more is better for the mover, read on the position after its move).
/// `top_diff` is greedy's own evaluation; `centre` and `my_win_now` were not
/// retained in round 2 and are kept as comparisons.
pub const PRINCIPLES: [(&str, f64); 18] = [
    ("top_diff", 1.0),
    ("own_max_height", 1.0),
    ("opp_mobility", -1.0),
    ("own_exposed", -1.0),
    ("opp_max_height", -1.0),
    ("prisoners", 1.0),
    ("hostages", -1.0),
    ("opp_singletons", 1.0),
    ("own_mobility", 1.0),
    ("own_singletons", -1.0),
    ("opp_exposed", -1.0),
    ("own_tall", 1.0),
    ("opp_win_now", -1.0),
    ("own_tops", -1.0),
    ("corners", -1.0),
    ("own_solid", 1.0),
    ("centre", -1.0),
    ("my_win_now", 1.0),
];

/// For each position with both winning moves (to a position the opponent
/// loses, per `value`) and other moves: does the mean of each feature, in its
/// principle's direction, favour the winning moves? Rows count positions
/// where winning moves score higher, lower or equal on average, and the mean
/// difference. With `greedy_ties_only`, only the moves with the highest top
/// difference after the move are compared (greedy's tied best set), which is
/// how round 2 used the principles: as tie-breaks at equal top count.
pub fn principle_comparison(
    positions: &[GameState],
    value: impl Fn(&GameState) -> Value,
    greedy_ties_only: bool,
) -> serde_json::Value {
    use crate::principles::{feature_index, features, NUM_FEATURES};
    use pogofish_engine::{apply_move, legal_moves};
    let idx: Vec<usize> = PRINCIPLES
        .iter()
        .map(|(n, _)| feature_index(n).expect("a known feature"))
        .collect();
    let mut used = 0usize;
    let mut tally = vec![(0u64, 0u64, 0u64, 0f64); PRINCIPLES.len()];
    for s in positions {
        let mover = s.to_move();
        let mut win_f: Vec<[f64; NUM_FEATURES]> = Vec::new();
        let mut other_f: Vec<[f64; NUM_FEATURES]> = Vec::new();
        let scored: Vec<([f64; NUM_FEATURES], bool)> = legal_moves(s)
            .into_iter()
            .map(|m| {
                let mut c = apply_move(s, m).expect("legal");
                c.forget_history();
                (features(&c, mover), matches!(value(&c), Value::Loss(_)))
            })
            .collect();
        let top = scored.iter().map(|(f, _)| f[0]).fold(f64::NEG_INFINITY, f64::max);
        for (f, wins) in scored {
            if greedy_ties_only && f[0] < top {
                continue;
            }
            if wins {
                win_f.push(f);
            } else {
                other_f.push(f);
            }
        }
        if win_f.is_empty() || other_f.is_empty() {
            continue;
        }
        used += 1;
        for (p, &fi) in idx.iter().enumerate() {
            let sign = PRINCIPLES[p].1;
            let mean = |v: &[[f64; NUM_FEATURES]]| v.iter().map(|f| f[fi]).sum::<f64>() / v.len() as f64;
            let diff = sign * (mean(&win_f) - mean(&other_f));
            let e = &mut tally[p];
            if diff.abs() < 1e-9 {
                e.2 += 1;
            } else if diff > 0.0 {
                e.0 += 1;
            } else {
                e.1 += 1;
            }
            e.3 += diff;
        }
    }
    let rows: Vec<serde_json::Value> = PRINCIPLES
        .iter()
        .zip(&tally)
        .map(|((name, sign), &(hi, lo, eq, sum))| {
            serde_json::json!({
                "feature": name,
                "direction": if *sign > 0.0 { "up" } else { "down" },
                "winning_moves_higher": hi,
                "winning_moves_lower": lo,
                "equal": eq,
                "share_higher_among_unequal": hi as f64 / (hi + lo).max(1) as f64,
                "mean_difference_in_direction": sum / used.max(1) as f64,
            })
        })
        .collect();
    serde_json::json!({
        "positions": positions.len(),
        "positions_with_winning_and_other_moves": used,
        "rows": rows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_size_is_colour_sequences_times_compositions_times_two() {
        let g = Game::published();
        assert_eq!(g.n_colour, 924);
        assert_eq!(g.n_comp, 125_970);
        assert_eq!(g.size(), 232_792_560);
    }

    #[test]
    fn start_position_ranks_and_unranks() {
        let g = Game::published();
        let s = g.start();
        assert_eq!(g.unrank(g.rank(&s)), s);
        assert_eq!(g.move_count(&s), 16);
    }
}
