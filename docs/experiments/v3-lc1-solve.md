# Round 3 — `lc1-2` from the start: the reduction, and why it is not solved

Date: 2026-11-02 · Ruleset `lc1-2` (the third occurrence of a position — board and
player to move — loses for the player whose move produced it; a base win is checked
first) · Code: `crates/search/src/lc1solve.rs`, binary `crates/search/src/bin/lc1solve.rs`
· Tests: `crates/search/tests/lc1solve.rs` · Results: `v3-lc1-solve/` · Input: the
uncapped table of `v3-solve.md` (`models/v3-solve/table.bin`, not committed; read here from
`models/v3/v3-solve/table.bin` of the main checkout)

The question: under `lc1-2`, who wins from the start with perfect play? Every game is
finite and none is drawn, so by Zermelo's theorem one side has a forced win.

**Answer: not found.** The question reduces exactly to a game on a graph of 289,536
drawn positions (sections 1–2), and the reduction is checked (section 4). Solving that
game is beyond the methods tried here on this machine: the search over repetition
counts did not finish in the start's component, nor in the largest component, nor in
some components of 40 to 692 positions (section 3). Measured on the way: neither side
can leave the other without a move in G within 27 moves from the start.

## Reproduce

```bash
cargo build --release -p pogofish-search --bin lc1solve
L="nice -n 10 ./target/release/lc1solve"; T=models/v3-solve/table.bin; O=docs/experiments/v3-lc1-solve
$L graph  $T --out $O/graph.json                                 # structure of G
$L exits  $T --samples 300 --max-dist 7 --out $O/exits.json      # claim 2 on the engine
$L probe  $T --limit 2000000 --max-size 1000 --order --out $O/probe.json
$L probe  $T --limit 2000000 --max-size 1000 --out $O/probe-unordered.json
$L probe  $T --limit 20000000 --min-size 40 --max-size 62 --order --out $O/probe-20m.json
$L probe  $T --limit 20000000 --max-size 300 --plain --out $O/probe-plain.json
$L probe  $T --limit 10000000 --min-size 1000 --plain --out $O/probe-large-plain.json
$L pilot  $T --node-limit 50000000 --memo-limit 20000000      # the solve proper, sinks first (stops)
$L deepen $T --node-limit 300000000 --memo-cap 8000000 --max-depth 400 --out $O/deepen.json
cargo test --release -p pogofish-search --test lc1solve
```

All runs are deterministic (fixed seeds); times below are from one run each, on the
8 GB M2 shared with other work (it was swapping), at `nice -n 10`, one thread.

## 1. The reduction

Write a position's uncapped value from the table: win, loss or draw for the player to
move, with a distance in plies for wins and losses. The table is locally consistent
(`v3-solve.md`, 0 violations over all positions): a win in d has a move to a loss in
d − 1 and none faster, a loss in d has only moves to wins in at most d − 1, a draw has
no move to a loss and at least one move to a draw.

**Claim 1.** From a draw, every move leads either to a draw or to a position the
opponent wins. *Proof:* local consistency. `build_graph` re-asserts it on every move
out of every position of G (below).

**Claim 2.** Suppose every position of the game so far has been a draw, and the player
to move enters a position X that the opponent wins in d. Then, under `lc1-2`, the player
who entered X loses. *Proof:* X has never occurred (every earlier position was a draw),
so the move into X triggers nothing; X is not finished (its mover tops a stack). From X
the winner plays a move to a loss in d − 1; every reply leads to a win in at most d − 2;
and so on. Along this line the distance falls at every ply, so no position of the line
repeats another, and none equals an earlier position of the game (those are draws). No
position occurs even twice, whatever the loser plays, so the repetition rule never
fires, and the line ends in a position whose mover — the loser — tops no stack: a base
loss. The loser cannot force a repetition either: every position it can reach on this
line is new.

**Claim 3.** So, from the start (a draw), `lc1-2` is a game on the graph G whose nodes
are the draws reachable from the start through draw-keeping moves and whose edges are
the draw-keeping moves. Each node has an occurrence count, the start's at 1 after ply
0. The player to move picks a successor in G whose count is below 2 and increments it.
With no such successor, the player loses: every other move either leaves G (a loss by
claim 2) or produces a third occurrence (a loss by the rule). Moving into a node of G
is never a base win (its mover tops a stack). This is partisan vertex geography where
each vertex may be entered twice. G is bipartite by the player to move, so entering a
White-to-move node is always Red's move and vice versa: a node's capacity is spent only
by one side.

**Claim 4 (decomposition).** Once play leaves a strongly connected component (SCC) of
G it can never return to it, and it has never visited the component it enters. So a
state's value depends only on the current node and the counts of its component; a
component is entered with its entry node at count 1 and every other count at 0. Its
entries' values can be computed sinks first.

## 2. The graph G

`lc1solve graph` (`graph.json`, 0.8 s, 474 MiB with the table loaded):

| Measure | Value |
|---|---|
| Nodes (draws reachable through draw-keeping moves) | 289,536 |
| Edges (distinct draw-keeping moves) | 656,696 |
| SCCs | 25,886, of which 654 have more than one node (264,304 nodes) |
| Largest SCC | 233,472 nodes, 534,864 internal edges, 3,192 entry nodes |
| The start's SCC | 11,736 nodes, 33,960 internal edges, one entry (the start) |
| Next largest | 8 SCCs of 692 nodes (1,364 internal edges), then 276, 232, 112, 92, 71, 62, 57, 44, 40 … |
| Out-degree in G | 1: 130,832 nodes (45 %); 2: 70,416; 3: 40,336; at most 24 |
| Leaving the start's SCC | only into 3,216 single-node components |

The 289,536 and 11,736 match `v3-solve.md` (`draws.json`), computed there by a different
routine (bitset breadth-first search). Every component is reachable from the start.

What a component looks like, from the dump of a 40-node one (`lc1solve dump --size
40`): a frozen tall stack on a1 and two two-piece stacks, one topped by each side, that
jump around the free cells. Its positions are the pairs of their squares with the side
to move. The repetition fight there is a pursuit between two tokens.

## 3. Solver and feasibility

### The solver

`Solver::solve` treats the SCCs sinks first, recursively:

1. **Static retrograde** inside a component, with the values of the nodes it exits to
   already known and counts ignored: a node with a move to a lost node is won, a node
   all of whose moves lead to won nodes is lost (level by level). These values hold in
   every state in which the decided nodes of lower level can still be entered, which is
   every state play reaches, because a decided node is never passed through: from a won
   node the winner moves to a lost node of lower level, from a lost node every move goes
   to a won node of lower level. (By induction on the level; the doc comment of
   `Solver` and the tests carry the details.)
2. The undecided nodes are split into SCCs again and solved the same way.
3. A component in which nothing is decided is a **base case**: each entry is searched
   depth first over (node, counts), stopping at the first winning move, with a
   transposition table keyed by a 128-bit hash.

Inside the search, each state is **reduced**: among the nodes still enterable from the
current one, the same retrograde pass decides some nodes for this state. This is sound
at any state (a decided node's witnesses are other decided nodes, which an undecided
node's saturation does not touch); if the current node is decided, its value is
returned. Otherwise the value depends only on the undecided nodes reachable from it
through undecided enterable nodes and their counts, so the table key is the hash of
exactly those (node, count) pairs. A move-ordering option tries first the moves that
leave the opponent the fewest replies.

`Solver::solve_lazy` searches from the start only, entering later components on
demand; `Bounded` is a depth-limited search over the whole of G with no decomposition.

### Pilot

Each component class searched closed (moves out of it ignored), from each of its
entries, within a budget of searched states (`probe.json`, `probe-20m.json`,
`probe-large-plain.json`):

| Component (nodes / internal edges, copies) | Entries | Result |
|---|---|---|
| 22 classes of 4–23 nodes | 1–18 | solved, at most 1,859 states |
| 44/68, 57/169, 71/114 | 4–13 | solved, at most 2,385 states |
| 232/536 (2), 276/722 (8) | 80, 120 | solved, 37,353 and 33,459 states (13,298,583 and 142,522 without the reduction, `probe-plain.json`) |
| 92/352 (8), 112/452 (8) | 2, 13 | solved with move ordering (215,977 and 50,147 states); not within 2 million without it |
| 62/184 (8) | 16 | 14 of 16 entries within 20 million states (37 s); none within 2 million |
| **40/124 (26)** | 8 | **2 of 8 entries within 20 million states** (31 s, 1.06 GiB) |
| **692/1,364 (8)** | 48 | **none within 2 million** (23 s) |
| **11,736/33,960 (the start's)** | 1 | **not within 10 million** (plain search; the reduction costs a pass over the component per state) |
| **233,472/534,864** | 3,192 | **none within 10 million** (plain search) |

Hardness does not follow size: 57/169 takes 156 states, 40/124 does not finish in 20
million. The solve proper (`lc1solve pilot`, static decomposition from the sinks)
reaches the first 40/124 component after solving a 232-node one and stops there at a
20-million-entry table.

**Gate: failed.** No extrapolation is offered: no hard component finished, so there is
no measured growth curve to extrapolate from, only lower bounds (20 million states for
some entries of a 40-node component). The table costs about 50 bytes per state; the 3 GB
cap allows some 60 million.

### Bounded search from the start

`Bounded` (no decomposition, no reduction) asks, for d = 1, 2, …, whether either side
can leave the other with no legal move in G within d moves (`deepen.json`):

| d | White wins within d | Red wins within d | Nodes | Time |
|---|---|---|---|---|
| ≤ 27 | no | no | 251,848,256 at d = 27 | 22.3 s at d = 27 (37 s in all) |

The cost grows about 4.5-fold per two plies. **Neither side forces a win within 27 moves
of G**: a forced `lc1-2` win from the start, if it exists, takes at least 28 moves in G
before the loser's losing move. The plain search from the start reached lines 4,340
plies deep.

## 4. Controls

| Control | Result |
|---|---|
| Claim 1 on G: every move out of every node of G leads to a position the opponent wins | asserted in `build_graph`, held on all 289,536 nodes |
| Claim 2 on the engine (`exits.json`): 300 random `lc1-2` games inside G (each side a random draw-keeping move into a position seen fewer than twice; 288 of the 300 revisited a position; median 44 plies, longest 234), then a random move out of G into an uncapped win in d ≤ 7 for the opponent. Plain negamax on the engine with the real history under `RuleSet::LC1 { repetitions: 2 }`, no table | the move out triggered no rule in 300 / 300; the opponent wins within d in 300 / 300 (47, 72, 108, 73 at d = 1, 3, 5, 7) |
| Same, the opponent claimed to win within d − 2 (it must fail) | 0 / 253 (d = 3, 5, 7; not applicable at d = 1) |
| Solver against an engine brute force on the 3+2 and 2+1 variants (every live draw as the root: 532 and 96 roots, graphs of 7–38 and 44–46 nodes), capacities 1, 2, 3 against `LC1 { repetitions: 1, 2, 3 }`: negamax on the engine with the engine's repetition rule, no graph, no SCCs, no reduction; a move out of the draws is scored by the variant's uncapped table (claim 2, checked above) | 532 / 532 and 96 / 96 agree at every capacity |
| The four solver paths (static decomposition, lazy, plain search without the reduction, move ordering) | equal on every root of every control |
| Solver against the definition of the capacity game on random abstract graphs (300 graphs of 3–9 nodes, out-degree 0–3, every node as the root, capacities 1–3: 5,505 cases), exhaustive search with explicit counts | 5,505 / 5,505; the capacity changes the value of 88 roots |
| Mutated rule: solver at capacity 1, then 3, against the definition at capacity 2 (same graphs) | 84 and 59 roots disagree |
| `Bounded` against the solver (3+2, every root with G ≤ 24 nodes), depth 2·|G| + 2 | equal on every root |

On the 3+2 and 2+1 variants the capacity changes no root value: every root there is
decided by the static step, which ignores counts. The engine comparison therefore checks
the graph, the rule and the static step, not the counts search; the random graphs check
the counts search, where the capacity does matter. A brute force that also searches the
lines after a move out of the draws, with no table, did not finish within 200,000 nodes
on any 3+2 root tried, even with an 8-node G: the loser can drag those lines on through
the whole position space. That is why the brute force uses the table for claim 2, which
is checked on its own on the full game.

The random-graph control found two defects, both fixed before the measurements above
were (re)run: the plain search dropped a move into an already-solved lost entry instead
of taking it, and its incremental hash let a node's position key cancel out at count 0
(two different states could share a key). Reverting either fix makes the control fail.

## What would be needed

- **The 40/124 class (26 copies) and the 62- and 692-node classes**: a two-token pursuit
  with repetition counts. A search that exploits the product structure (each side's
  token moves alone) or a proof-number search might finish; plain depth-first search
  with the reduction does not within 20 million states.
- **The start's component (11,736 nodes, one entry)**: the per-state reduction costs a
  pass over the component, and the plain search runs lines thousands of plies long; its
  exits lead into single positions that feed the hard components, so its static step
  also waits on them.
- **The largest component (233,472 nodes, 3,192 entries)**: nothing measured here
  suggests a direct search can finish.

## What this does not show

- **Who wins `lc1-2` from the start.** Open. Neither side wins within 27 moves of G;
  nothing beyond that.
- **The winning first moves, the winning strategy, the longest forced game.** Not
  computed, since the root is not solved. The bundled net's choice at the start (c1-1-b1,
  a draw-keeping move) cannot be scored against an `lc1-2` value.
- **The reduction beyond the engine's reading of the rules.** Claims 1–3 assume the
  uncapped table is right (`v3-solve.md`: consistency proof plus controls) and the
  engine's `lc1-2` (a base win before the repetition check; the count is of earlier
  occurrences of board and player to move).
- **The hardness of a component as part of the real game.** The probe ignores moves out
  of a component. Where the component is a base case of the real solve, every move out
  of it loses (otherwise the static step would have decided the node) and the probe
  searches the same game; that was so for the first 40/124 component the real solve
  met. Elsewhere moves out can decide nodes and make the real game easier, and the
  probe's entry list may include entries the real game never needs.
