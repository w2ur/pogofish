//! `lc1-N` from a drawn position of the uncapped game, solved exactly through
//! the reduction of `docs/experiments/v3-lc1-solve.md` (round 3).
//!
//! Under `lc1-N` a position's `(N + 1)`-th occurrence loses for the player
//! whose move produced it; a base win is checked first. From a position the
//! uncapped table calls a draw, while every position so far has been a draw:
//!
//! 1. no move leads to a position the opponent loses (the table is locally
//!    consistent), so each move either keeps the draw or enters a position
//!    the opponent wins under the uncapped rules;
//! 2. such a position has never occurred (every earlier one was a draw), and
//!    the winner can follow strictly decreasing distance, along which no
//!    position repeats, whatever the loser plays: entering it loses;
//! 3. so the game is played on the graph `G` of draws reachable through
//!    draw-keeping moves: the mover must move to a successor that has
//!    occurred fewer than `N` times (the root counts once), and loses
//!    otherwise (leaving `G`, or a third occurrence for `N = 2`).
//!
//! Once play leaves a strongly connected component of `G` it never returns,
//! so only the counts of the current component matter, and a component is
//! always entered with all its counts at zero. [`Solver`] searches
//! `(position, counts of the current component)` depth first with a
//! transposition table keyed by a 128-bit Zobrist hash of the counts, and
//! stops at the first winning move (outcomes are binary).

use crate::retro::{Board, Game, DIST_MASK, DRAW, WIN};
use crate::rng::SplitMix64;
use pogofish_engine::NUM_CELLS;
use std::collections::HashMap;

/// The graph `G`: draws reachable from `root` through draw-keeping moves.
pub struct DrawGraph {
    /// Node id → board.
    pub boards: Vec<Board>,
    /// Node id → table index.
    pub ranks: Vec<u64>,
    /// Successors of node `v`: `succ[off[v]..off[v + 1]]`, in engine move order,
    /// duplicates removed.
    pub off: Vec<u32>,
    pub succ: Vec<u32>,
    /// Per node: how many legal moves leave `G` (into a position the opponent
    /// wins under the uncapped rules).
    pub exits: Vec<u8>,
    /// Per node: the shortest uncapped distance among its exits (`u16::MAX`
    /// when it has none).
    pub min_exit_dist: Vec<u16>,
    /// The root is node 0.
    pub root: u32,
}

impl DrawGraph {
    #[inline]
    pub fn successors(&self, v: u32) -> &[u32] {
        &self.succ[self.off[v as usize] as usize..self.off[v as usize + 1] as usize]
    }

    pub fn len(&self) -> usize {
        self.boards.len()
    }

    pub fn is_empty(&self) -> bool {
        self.boards.is_empty()
    }

    pub fn edges(&self) -> usize {
        self.succ.len()
    }

    /// An abstract graph (no positions behind it), for testing the solver on
    /// graphs where the counts matter: `succ[v]` lists `v`'s successors.
    pub fn abstract_graph(succ: &[Vec<u32>], root: u32) -> DrawGraph {
        let empty = Board {
            h: [0; NUM_CELLS],
            c: [0; NUM_CELLS],
            red_to_move: false,
        };
        let mut off = vec![0u32];
        let mut flat = Vec::new();
        for s in succ {
            flat.extend_from_slice(s);
            off.push(flat.len() as u32);
        }
        DrawGraph {
            boards: vec![empty; succ.len()],
            ranks: vec![0; succ.len()],
            off,
            succ: flat,
            exits: vec![0; succ.len()],
            min_exit_dist: vec![u16::MAX; succ.len()],
            root,
        }
    }
}

/// Build `G` from a solved table `t`. Panics if `root` is not a draw or if a
/// draw has a move to a position its opponent loses (claim 1 violated).
pub fn build_graph(g: &Game, t: &[u16], root: &Board) -> DrawGraph {
    let r0 = g.rank(root);
    assert_eq!(t[r0 as usize], DRAW, "the root must be a draw");
    let mut id: HashMap<u64, u32> = HashMap::new();
    let mut boards = vec![*root];
    let mut ranks = vec![r0];
    id.insert(r0, 0);
    let mut off = vec![0u32];
    let mut succ = Vec::new();
    let mut exits = Vec::new();
    let mut min_exit_dist = Vec::new();
    let mut v = 0usize;
    while v < boards.len() {
        let b = boards[v];
        let mut out: Vec<u32> = Vec::new();
        let mut ex = 0u8;
        let mut min_d = u16::MAX;
        g.for_each_child(&b, |c| {
            let rc = g.rank(&c);
            let code = t[rc as usize];
            if code == DRAW {
                let next = boards.len() as u32;
                let w = *id.entry(rc).or_insert_with(|| {
                    boards.push(c);
                    ranks.push(rc);
                    next
                });
                if !out.contains(&w) {
                    out.push(w);
                }
            } else {
                // Claim 1: a draw never has a move to a position its opponent loses.
                assert!(
                    code & 0xC000 == WIN,
                    "a draw has a move to a non-win for the opponent (code {code:#06x})"
                );
                ex += 1;
                min_d = min_d.min(code & DIST_MASK);
            }
        });
        assert!(!out.is_empty(), "a draw with no draw-keeping move");
        succ.extend_from_slice(&out);
        off.push(succ.len() as u32);
        exits.push(ex);
        min_exit_dist.push(min_d);
        v += 1;
    }
    DrawGraph {
        boards,
        ranks,
        off,
        succ,
        exits,
        min_exit_dist,
        root: 0,
    }
}

/// Strongly connected components of the subgraph induced by `nodes`
/// (iterative Tarjan), in reverse topological order: a component has edges
/// only to itself and to components listed before it. `local` is scratch of
/// `gr.len()` entries, all `u32::MAX`, and is left that way.
pub fn sccs_within(gr: &DrawGraph, nodes: &[u32], local: &mut [u32]) -> Vec<Vec<u32>> {
    const UNSET: u32 = u32::MAX;
    for (i, &v) in nodes.iter().enumerate() {
        local[v as usize] = i as u32;
    }
    let n = nodes.len();
    let mut index = vec![UNSET; n];
    let mut low = vec![0u32; n];
    let mut on_stack = vec![false; n];
    let mut stack: Vec<u32> = Vec::new();
    let mut out: Vec<Vec<u32>> = Vec::new();
    let mut next_index = 0u32;
    let mut call: Vec<(u32, u32)> = Vec::new();
    for s in 0..n as u32 {
        if index[s as usize] != UNSET {
            continue;
        }
        index[s as usize] = next_index;
        low[s as usize] = next_index;
        next_index += 1;
        stack.push(s);
        on_stack[s as usize] = true;
        call.push((s, 0));
        while let Some(&mut (v, ref mut pos)) = call.last_mut() {
            let succ = gr.successors(nodes[v as usize]);
            if (*pos as usize) < succ.len() {
                let w = local[succ[*pos as usize] as usize];
                *pos += 1;
                if w == UNSET {
                    continue;
                }
                if index[w as usize] == UNSET {
                    index[w as usize] = next_index;
                    low[w as usize] = next_index;
                    next_index += 1;
                    stack.push(w);
                    on_stack[w as usize] = true;
                    call.push((w, 0));
                } else if on_stack[w as usize] {
                    low[v as usize] = low[v as usize].min(index[w as usize]);
                }
            } else {
                call.pop();
                if let Some(&(u, _)) = call.last() {
                    low[u as usize] = low[u as usize].min(low[v as usize]);
                }
                if low[v as usize] == index[v as usize] {
                    let mut c = Vec::new();
                    loop {
                        let w = stack.pop().expect("Tarjan stack");
                        on_stack[w as usize] = false;
                        c.push(nodes[w as usize]);
                        if w == v {
                            break;
                        }
                    }
                    c.sort_unstable();
                    out.push(c);
                }
            }
        }
    }
    for &v in nodes {
        local[v as usize] = UNSET;
    }
    out
}

/// The component of each node of `G` and the number of components; ids in
/// reverse topological order.
pub fn components(gr: &DrawGraph) -> (Vec<u32>, usize) {
    let all: Vec<u32> = (0..gr.len() as u32).collect();
    let mut local = vec![u32::MAX; gr.len()];
    let comps = sccs_within(gr, &all, &mut local);
    let mut comp = vec![0u32; gr.len()];
    for (i, c) in comps.iter().enumerate() {
        for &v in c {
            comp[v as usize] = i as u32;
        }
    }
    (comp, comps.len())
}

/// Zobrist keys: `[position, count 1, count 2, count 3, count 0 in a set]` per node.
fn zobrist(n: usize) -> Vec<[u128; 5]> {
    let mut rng = SplitMix64::new(0x1C1_501E);
    let mut k = || ((rng.next_u64() as u128) << 64) | rng.next_u64() as u128;
    (0..n).map(|_| [k(), k(), k(), k(), k()]).collect()
}

/// A node's contribution to an incremental counts hash: nothing at count 0
/// (index 0 of the keys is the position key, not a count).
#[inline]
fn count_key(k: &[u128; 5], c: u8) -> u128 {
    if c == 0 {
        0
    } else {
        k[c as usize]
    }
}

/// How a node's value was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum How {
    /// Not needed (an undetermined node that is no entry of its base case).
    Unvalued,
    /// Retrograde inside its component, independent of the counts.
    Static,
    /// Searched over counts, as an entry of a base case.
    Searched,
}

/// Called with each finished base case (progress reports).
pub type BaseCaseHook<'a> = Box<dyn FnMut(&BaseCase) + 'a>;

/// A component (at some depth of the recursion) in which the retrograde step
/// decided nothing, so the counts had to be searched.
#[derive(Debug, Clone, serde::Serialize)]
pub struct BaseCase {
    pub nodes: usize,
    pub edges: usize,
    pub entries: usize,
    pub entries_won: usize,
    pub contains_root: bool,
    pub searched: u64,
    pub memo: usize,
    pub max_depth: usize,
    pub seconds: f64,
    pub recursion_depth: usize,
}

/// Exact solver of the capacity-`cap` game on `G` (`cap` = `N` of `lc1-N`:
/// a successor may be entered while it has occurred fewer than `cap` times;
/// the root has occurred once).
///
/// [`Solver::solve`] decomposes the node set into strongly connected
/// components and treats them sinks first. In each component, with the
/// values of the nodes it can exit to already known, a retrograde pass
/// (ignoring counts) decides some nodes: a node with a move to a lost node
/// is won, a node whose every move leads to a won node is lost. These values
/// hold whatever the counts, as long as play has not passed through a
/// decided node of lower level, which play never needs to (see the doc). The
/// undecided nodes are solved recursively the same way; a component in which
/// nothing is decided is a base case, searched over counts.
pub struct Solver<'a> {
    pub gr: &'a DrawGraph,
    pub cap: u8,
    /// Each node's value for its player to move when it is entered with its
    /// count at 1 and its component's other counts at 0.
    pub value: Vec<Option<bool>>,
    pub how: Vec<How>,
    /// Retrograde level of statically decided nodes (0 for nodes decided by
    /// their exits alone).
    pub level: Vec<u32>,
    pub base_cases: Vec<BaseCase>,
    pred_off: Vec<u32>,
    pred: Vec<u32>,
    tag: Vec<u32>,
    next_tag: u32,
    local: Vec<u32>,
    remaining: Vec<u32>,
    decided: Vec<u8>,
    stamp: Vec<u32>,
    generation: u32,
    scratch: Vec<u32>,
    scratch2: Vec<u32>,
    /// Use the state reduction (the default); off, the plain search over counts.
    pub dynamic: bool,
    /// Order moves by the opponent's remaining replies (fewest first).
    pub order_by_mobility: bool,
    /// Treat moves out of the current component as losing (the probe).
    closed: bool,
    counts: Vec<u8>,
    keys: Vec<[u128; 5]>,
    memo: HashMap<u128, bool>,
    hash: u128,
    /// Positions searched in base cases.
    pub nodes: u64,
    /// Give up (the result is `None`) once a base case's table holds this many entries.
    pub memo_limit: usize,
    /// Give up once this many positions have been searched in all.
    pub node_limit: u64,
    depth: usize,
    max_depth: usize,
    aborted: bool,
    /// Called after each base case.
    pub on_base_case: Option<BaseCaseHook<'a>>,
}

impl<'a> Solver<'a> {
    pub fn new(gr: &'a DrawGraph, cap: u8) -> Solver<'a> {
        assert!((1..=3).contains(&cap), "capacity 1 to 3");
        let n = gr.len();
        let mut indeg = vec![0u32; n + 1];
        for &w in &gr.succ {
            indeg[w as usize + 1] += 1;
        }
        for i in 0..n {
            indeg[i + 1] += indeg[i];
        }
        let pred_off = indeg;
        let mut fill = pred_off.clone();
        let mut pred = vec![0u32; gr.succ.len()];
        for v in 0..n as u32 {
            for &w in gr.successors(v) {
                pred[fill[w as usize] as usize] = v;
                fill[w as usize] += 1;
            }
        }
        Solver {
            gr,
            cap,
            value: vec![None; n],
            how: vec![How::Unvalued; n],
            level: vec![u32::MAX; n],
            base_cases: Vec::new(),
            pred_off,
            pred,
            tag: vec![0; n],
            next_tag: 0,
            local: vec![u32::MAX; n],
            remaining: vec![0; n],
            decided: vec![0; n],
            stamp: vec![0; n],
            generation: 0,
            scratch: Vec::new(),
            scratch2: Vec::new(),
            dynamic: true,
            order_by_mobility: false,
            closed: false,
            counts: vec![0; n],
            keys: zobrist(n),
            memo: HashMap::new(),
            hash: 0,
            nodes: 0,
            memo_limit: usize::MAX,
            node_limit: u64::MAX,
            depth: 0,
            max_depth: 0,
            aborted: false,
            on_base_case: None,
        }
    }

    #[inline]
    fn predecessors(&self, v: u32) -> &[u32] {
        &self.pred[self.pred_off[v as usize] as usize..self.pred_off[v as usize + 1] as usize]
    }

    /// Solve every component; the root's value, or `None` if a limit was hit.
    pub fn solve(&mut self) -> Option<bool> {
        let all: Vec<u32> = (0..self.gr.len() as u32).collect();
        self.solve_set(&all, 0);
        if self.aborted {
            None
        } else {
            self.value[self.gr.root as usize]
        }
    }

    /// Solve only what the root needs: search from the root over counts,
    /// entering later components of `G` on demand (each entry's value is
    /// kept). The static retrograde step is not used; the state reduction
    /// is, if `dynamic`.
    pub fn solve_lazy(&mut self) -> Option<bool> {
        let (comp, n) = components(self.gr);
        for (v, &c) in comp.iter().enumerate() {
            self.tag[v] = self.next_tag + 1 + c;
        }
        self.next_tag += 1 + n as u32;
        let r = self.entry(self.gr.root);
        (!self.aborted).then_some(r)
    }

    /// The value of `w` entered fresh (its component's counts all 0).
    fn entry(&mut self, w: u32) -> bool {
        if let Some(x) = self.value[w as usize] {
            return x;
        }
        let saved = self.hash;
        self.counts[w as usize] = 1;
        self.hash = self.keys[w as usize][1];
        let r = self.search(w, self.tag[w as usize]);
        self.counts[w as usize] = 0;
        self.hash = saved;
        if !self.aborted {
            self.value[w as usize] = Some(r);
            self.how[w as usize] = How::Searched;
        }
        r
    }

    fn solve_set(&mut self, nodes: &[u32], rec: usize) {
        let comps = sccs_within(self.gr, nodes, &mut self.local);
        for c in comps {
            if self.aborted {
                return;
            }
            self.next_tag += 1;
            let t = self.next_tag;
            for &v in &c {
                self.tag[v as usize] = t;
            }
            let undecided = self.retrograde(&c, t);
            if undecided.is_empty() {
                continue;
            }
            if undecided.len() < c.len() {
                self.solve_set(&undecided, rec + 1);
            } else {
                self.base_case(&c, t, rec);
            }
        }
    }

    /// Decide what can be decided in component `c` (tagged `t`) without the
    /// counts; returns the undecided nodes.
    fn retrograde(&mut self, c: &[u32], t: u32) -> Vec<u32> {
        let gr = self.gr;
        let mut queue: Vec<u32> = Vec::new();
        for &v in c {
            let mut rem = 0;
            let mut win = false;
            for &w in gr.successors(v) {
                if self.tag[w as usize] == t {
                    rem += 1;
                } else {
                    match self.value[w as usize] {
                        Some(false) => win = true,
                        Some(true) => {}
                        None => panic!("node {w} exited to before it was valued"),
                    }
                }
            }
            self.remaining[v as usize] = rem;
            if win || rem == 0 {
                self.value[v as usize] = Some(win);
                self.how[v as usize] = How::Static;
                self.level[v as usize] = 0;
                queue.push(v);
            }
        }
        let mut head = 0;
        while head < queue.len() {
            let x = queue[head];
            head += 1;
            let lost = self.value[x as usize] == Some(false);
            let lvl = self.level[x as usize] + 1;
            for i in self.pred_off[x as usize]..self.pred_off[x as usize + 1] {
                let p = self.pred[i as usize];
                if self.tag[p as usize] != t || self.value[p as usize].is_some() {
                    continue;
                }
                if lost {
                    self.value[p as usize] = Some(true);
                } else {
                    self.remaining[p as usize] -= 1;
                    if self.remaining[p as usize] > 0 {
                        continue;
                    }
                    self.value[p as usize] = Some(false);
                }
                self.how[p as usize] = How::Static;
                self.level[p as usize] = lvl;
                queue.push(p);
            }
        }
        c.iter()
            .copied()
            .filter(|&v| self.value[v as usize].is_none())
            .collect()
    }

    /// Hardness probe: search component `c` of `G` as if every move out of
    /// it lost (exits ignored), from each of its entries, within `limit`
    /// searched positions in all. Returns the base-case record (`entries_won`
    /// counts entries solved as wins; `searched` reaching `limit` means not
    /// finished) and how many entries were solved. Leaves no values behind.
    pub fn probe(&mut self, c: &[u32], limit: u64) -> (BaseCase, usize) {
        self.next_tag += 1;
        let t = self.next_tag;
        for &v in c {
            self.tag[v as usize] = t;
        }
        self.closed = true;
        self.aborted = false;
        self.node_limit = self.nodes + limit;
        let saved: Vec<Option<bool>> = c.iter().map(|&v| self.value[v as usize]).collect();
        self.base_case(c, t, 0);
        let solved = c
            .iter()
            .filter(|&&v| self.how[v as usize] == How::Searched && self.value[v as usize].is_some())
            .count();
        for (&v, s) in c.iter().zip(saved) {
            self.value[v as usize] = s;
            self.how[v as usize] = How::Unvalued;
        }
        self.closed = false;
        self.aborted = false;
        self.node_limit = u64::MAX;
        let mut bc = self.base_cases.pop().expect("a base case");
        bc.entries_won = solved;
        (bc, solved)
    }

    /// Search the counts in component `c` (tagged `t`), in which no node is
    /// decided statically, from each of its entries.
    fn base_case(&mut self, c: &[u32], t: u32, rec: usize) {
        let t0 = std::time::Instant::now();
        let root = self.gr.root;
        let entries: Vec<u32> = c
            .iter()
            .copied()
            .filter(|&v| {
                v == root
                    || self
                        .predecessors(v)
                        .iter()
                        .any(|&p| self.tag[p as usize] != t)
            })
            .collect();
        let nodes_before = self.nodes;
        self.memo.clear();
        self.max_depth = 0;
        let mut won = 0;
        for &e in &entries {
            self.counts[e as usize] = 1;
            self.hash = self.keys[e as usize][1];
            let r = self.search(e, t);
            self.counts[e as usize] = 0;
            if self.aborted {
                break;
            }
            self.value[e as usize] = Some(r);
            self.how[e as usize] = How::Searched;
            won += r as usize;
        }
        let edges = c
            .iter()
            .map(|&v| {
                self.gr
                    .successors(v)
                    .iter()
                    .filter(|&&w| self.tag[w as usize] == t)
                    .count()
            })
            .sum();
        let bc = BaseCase {
            nodes: c.len(),
            edges,
            entries: entries.len(),
            entries_won: won,
            contains_root: c.contains(&root),
            searched: self.nodes - nodes_before,
            memo: self.memo.len(),
            max_depth: self.max_depth,
            seconds: t0.elapsed().as_secs_f64(),
            recursion_depth: rec,
        };
        self.memo = HashMap::new();
        if let Some(f) = self.on_base_case.as_mut() {
            f(&bc);
        }
        self.base_cases.push(bc);
    }

    /// Mover at `v` (already counted) wins? Only moves inside the base case
    /// matter: every move out of it leads to a node won for the opponent
    /// (otherwise `v` would have been decided statically).
    fn search(&mut self, v: u32, t: u32) -> bool {
        if self.aborted {
            return false;
        }
        let (key, moves) = if self.dynamic {
            match self.reduce(v, t) {
                Ok(x) => return x,
                Err(km) => km,
            }
        } else {
            let gr = self.gr;
            let moves: Vec<u32> = gr
                .successors(v)
                .iter()
                .copied()
                .filter(|&w| {
                    if self.tag[w as usize] == t {
                        self.counts[w as usize] < self.cap
                    } else {
                        // Known wins for the opponent are useless; a known loss wins at once.
                        !self.closed && self.value[w as usize] != Some(true)
                    }
                })
                .collect();
            (self.hash ^ self.keys[v as usize][0], moves)
        };
        if let Some(&x) = self.memo.get(&key) {
            return x;
        }
        self.nodes += 1;
        self.depth += 1;
        self.max_depth = self.max_depth.max(self.depth);
        let mut moves = moves;
        if self.order_by_mobility {
            // Try first the moves that leave the opponent the fewest replies.
            let gr = self.gr;
            moves.sort_by_key(|&w| {
                gr.successors(w)
                    .iter()
                    .filter(|&&x| self.tag[x as usize] == t && self.counts[x as usize] < self.cap)
                    .count()
            });
        }
        let mut win = false;
        for w in moves {
            let opp = if self.tag[w as usize] != t {
                self.entry(w)
            } else {
                let c = self.counts[w as usize];
                self.bump(w, c, c + 1);
                let opp = self.search(w, t);
                self.bump(w, c + 1, c);
                opp
            };
            if !opp {
                win = true;
                break;
            }
        }
        self.depth -= 1;
        if self.aborted {
            return false;
        }
        if self.memo.len() >= self.memo_limit || self.nodes >= self.node_limit {
            self.aborted = true;
            return false;
        }
        self.memo.insert(key, win);
        win
    }

    #[inline]
    fn bump(&mut self, w: u32, from: u8, to: u8) {
        let k = &self.keys[w as usize];
        self.hash ^= count_key(k, from) ^ count_key(k, to);
        self.counts[w as usize] = to;
    }
}

impl Solver<'_> {
    /// The state reduction of the doc (section "Search"): in the residual
    /// graph (nodes of the base case reachable from `v` through nodes that
    /// can still be entered), a retrograde pass ignoring counts decides some
    /// nodes. `Ok(value)` if it decides `v`; otherwise the hash of `v` and the
    /// counts of the undecided nodes reachable from `v` through undecided
    /// nodes (which alone determine the value), and `v`'s moves into them.
    fn reduce(&mut self, v: u32, t: u32) -> Result<bool, (u128, Vec<u32>)> {
        const UNDECIDED: u8 = 0;
        const WON: u8 = 1;
        const LOST: u8 = 2;
        let gr = self.gr;
        let cap = self.cap;
        self.generation += 2;
        let g = self.generation;
        let mut rs = std::mem::take(&mut self.scratch);
        rs.clear();
        rs.push(v);
        self.stamp[v as usize] = g;
        let mut i = 0;
        while i < rs.len() {
            let u = rs[i];
            i += 1;
            for &w in gr.successors(u) {
                if self.tag[w as usize] == t
                    && self.counts[w as usize] < cap
                    && self.stamp[w as usize] != g
                {
                    self.stamp[w as usize] = g;
                    rs.push(w);
                }
            }
        }
        let mut queue = std::mem::take(&mut self.scratch2);
        queue.clear();
        for &u in &rs {
            let mut rem = 0u32;
            let mut win = false;
            for &w in gr.successors(u) {
                if self.tag[w as usize] == t {
                    rem += (self.stamp[w as usize] == g && self.counts[w as usize] < cap) as u32;
                } else {
                    match if self.closed {
                        Some(true)
                    } else {
                        self.value[w as usize]
                    } {
                        Some(false) => win = true,
                        None => rem += 1, // not known yet: blocks a loss, gives no win
                        Some(true) => {}
                    }
                }
            }
            self.remaining[u as usize] = rem;
            self.decided[u as usize] = if win {
                WON
            } else if rem == 0 {
                LOST
            } else {
                UNDECIDED
            };
            if win || rem == 0 {
                queue.push(u);
            }
        }
        let mut h = 0;
        while h < queue.len() && self.decided[v as usize] == UNDECIDED {
            let x = queue[h];
            h += 1;
            if self.counts[x as usize] >= cap {
                continue; // the current node, saturated: nobody can enter it
            }
            let lost = self.decided[x as usize] == LOST;
            for k in self.pred_off[x as usize]..self.pred_off[x as usize + 1] {
                let p = self.pred[k as usize];
                if self.stamp[p as usize] != g || self.decided[p as usize] != UNDECIDED {
                    continue;
                }
                if lost {
                    self.decided[p as usize] = WON;
                } else {
                    self.remaining[p as usize] -= 1;
                    if self.remaining[p as usize] > 0 {
                        continue;
                    }
                    self.decided[p as usize] = LOST;
                }
                queue.push(p);
            }
        }
        let dv = self.decided[v as usize];
        let result = if dv != UNDECIDED {
            Ok(dv == WON)
        } else {
            // Undecided nodes reachable from v through undecided enterable nodes.
            let g2 = g + 1;
            queue.clear();
            queue.push(v);
            self.stamp[v as usize] = g2;
            let mut key = self.keys[v as usize][0];
            let mut i = 0;
            while i < queue.len() {
                let u = queue[i];
                i += 1;
                let c = self.counts[u as usize];
                key ^= self.keys[u as usize][if c == 0 { 4 } else { c as usize }];
                for &w in gr.successors(u) {
                    if self.stamp[w as usize] == g
                        && self.decided[w as usize] == UNDECIDED
                        && self.counts[w as usize] < cap
                    {
                        self.stamp[w as usize] = g2;
                        queue.push(w);
                    }
                }
            }
            let moves = gr
                .successors(v)
                .iter()
                .copied()
                .filter(|&w| {
                    if self.tag[w as usize] == t {
                        self.stamp[w as usize] == g2 && self.counts[w as usize] < cap
                    } else {
                        !self.closed && self.value[w as usize].is_none()
                    }
                })
                .collect();
            Err((key, moves))
        };
        self.scratch = rs;
        self.scratch2 = queue;
        result
    }
}

/// Bounded search over the whole of `G` (no decomposition, no reduction):
/// does the mover leave the opponent stuck within `d` moves? Used to look
/// for short forced wins and as an independent check of [`Solver`].
pub struct Bounded<'a> {
    gr: &'a DrawGraph,
    cap: u8,
    counts: Vec<u8>,
    keys: Vec<[u128; 5]>,
    hash: u128,
    /// Per state: (largest depth proven not to win, smallest depth proven to win).
    memo: HashMap<u128, (u16, u16)>,
    pub nodes: u64,
    /// Clear the table when it reaches this size (it is only a cache).
    pub memo_cap: usize,
}

impl<'a> Bounded<'a> {
    /// `counts`: the occurrences so far (node, count); the root must be among them.
    pub fn new(gr: &'a DrawGraph, cap: u8, counts: &[(u32, u8)]) -> Bounded<'a> {
        let mut b = Bounded {
            gr,
            cap,
            counts: vec![0; gr.len()],
            keys: zobrist(gr.len()),
            hash: 0,
            memo: HashMap::new(),
            nodes: 0,
            memo_cap: usize::MAX,
        };
        for &(v, c) in counts {
            b.counts[v as usize] = c;
            b.hash ^= b.keys[v as usize][c as usize];
        }
        b
    }

    pub fn memo_len(&self) -> usize {
        self.memo.len()
    }

    /// The mover at `v` (its count already included) wins within `d` moves.
    pub fn wins(&mut self, v: u32, d: u16) -> bool {
        if d == 0 {
            return false;
        }
        let key = self.hash ^ self.keys[v as usize][0];
        let (no, yes) = self.memo.get(&key).copied().unwrap_or((0, u16::MAX));
        if d <= no {
            return false;
        }
        if d >= yes {
            return true;
        }
        self.nodes += 1;
        let gr = self.gr;
        let mut win = false;
        for &w in gr.successors(v) {
            let c = self.counts[w as usize];
            if c >= self.cap {
                continue;
            }
            self.bump(w, c, c + 1);
            let r = self.loses(w, d - 1);
            self.bump(w, c + 1, c);
            if r {
                win = true;
                break;
            }
        }
        if self.memo.len() >= self.memo_cap {
            self.memo.clear();
        }
        let e = self.memo.entry(key).or_insert((0, u16::MAX));
        if win {
            e.1 = e.1.min(d);
        } else {
            e.0 = e.0.max(d);
        }
        win
    }

    /// The mover at `v` loses within `d` moves (is stuck now, or every move
    /// leads to a win within `d - 1` for the opponent).
    pub fn loses(&mut self, v: u32, d: u16) -> bool {
        let gr = self.gr;
        for &w in gr.successors(v) {
            let c = self.counts[w as usize];
            if c >= self.cap {
                continue;
            }
            if d == 0 {
                return false;
            }
            self.bump(w, c, c + 1);
            let r = self.wins(w, d - 1);
            self.bump(w, c + 1, c);
            if !r {
                return false;
            }
        }
        true
    }

    #[inline]
    fn bump(&mut self, w: u32, from: u8, to: u8) {
        let k = &self.keys[w as usize];
        self.hash ^= count_key(k, from) ^ count_key(k, to);
        self.counts[w as usize] = to;
    }
}
