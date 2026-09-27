# Pogo — rules as the engine plays them

This page states each rule, the engine line that implements it, and the test that
pins it. The engine is `crates/engine`; the regression positions are in
`crates/engine/tests/regression_positions.rs`.

## Sources

- Laurent Grégoire's POGO program, README and `check_move` in `pogo.c`:
  <https://github.com/laurentg/pogo>. Its distance check is the same table as ours
  (`n == 1 → d == 1`, `n == 2 → d == 2`, `n == 3 → d == 1 || d == 3`).
- BoardGameGeek entry: <https://boardgamegeek.com/boardgame/10095/pogo> (not
  re-read for this page: the site was unreachable from the machine that wrote it).

Neither source says anything about repetition, move caps or draws. Those are this
project's additions (the "variants" below), not part of the published game.

One reading the sources leave open: whether a multi-step move may turn or double
back. The engine, like `pogo.c`, only checks the Manhattan distance between start
and end, so a 3-piece move may end one step away (it doubled back) and no move may
end where it started.

Cells are numbered 0–8, row by row from the top; notation `a1`…`c3` has columns
`a`–`c` and rows `1` (top) to `3` (bottom).

## 1. Setup

Each player has 6 pieces in 3 stacks of 2 on their back row: White on cells 0–2,
Red on cells 6–8. White moves first.

- Engine: [`state.rs` `initial_state`](../crates/engine/src/state.rs#L78)
- Test: `initial_position_has_sixteen_moves`

**Example.** From the start White has 16 moves: 7 moves of one piece (2 from each
corner stack, 3 from the middle one) and 9 moves of two pieces (3 from each stack).
No 3-piece move exists because every stack has only 2 pieces.

## 2. Ownership

A stack belongs to the player whose piece is on top, whatever lies underneath. You
may only move from a stack you own.

- Engine: [`legal.rs` `legal_moves`, top check](../crates/engine/src/legal.rs#L22)
- Test: `a_stack_topped_by_the_opponent_cannot_be_moved`

**Example.** Cell 4 holds `W W W R` (bottom to top) and cell 0 holds `W`. White to
move: nothing can leave cell 4, even though three of its four pieces are White. The
only moves are from cell 0.

## 3. Moving

Take 1, 2 or 3 pieces off the top of a stack you own (never more than the stack
has) and move them together: 1 piece exactly 1 step, 2 pieces exactly 2 steps,
3 pieces 1 or 3 steps (Manhattan distance, orthogonal steps, jumping over
anything). They land on top of whatever is on the destination cell, in the same
order.

- Engine: [`types.rs` `DISTANCES`](../crates/engine/src/types.rs#L63),
  [`legal.rs` `legal_moves`](../crates/engine/src/legal.rs#L13),
  [`legal.rs` `apply_move`, `split_off`](../crates/engine/src/legal.rs#L88)
- Tests: `stack_of_three_moving_one_two_or_three`,
  `pickup_takes_the_top_pieces_in_order`, `a_lone_corner_piece_still_has_two_moves`

**Example.** A stack of three White pieces on the corner `a1` (cell 0) can send
1 piece to cells 1 or 3, 2 pieces to cells 2, 4 or 6, and 3 pieces to cells 1, 3, 5
or 7. Moving 3 pieces from `R W R W` on cell 4 to empty cell 1 leaves `R` on cell 4
and puts `W R W` on cell 1; moving just 1 piece uncovers the Red piece and hands Red
cell 4.

## 4. Winning

You lose when no stack has your colour on top. Buried pieces do not help. The
moving pieces always land on top, so the mover owns at least the destination after
every move: nobody can lose on their own move, and a player with no legal move has
already lost. There is no stalemate.

- Engine: [`rules.rs` `base_terminal`](../crates/engine/src/rules.rs#L33)
- Tests: `win_by_squeeze_with_buried_opponent_pieces`,
  `no_legal_move_only_when_the_game_is_already_lost`, and the property tests
  `mover_owns_destination_after_move` and `not_terminal_implies_has_legal_moves`
  in `crates/engine/tests/properties.rs`

**Example.** White `W` on cell 0, Red `R R` on cell 1, and `R W` on cell 4. White
moves the single piece from cell 0 onto cell 1: every stack now has White on top,
and White wins even though three Red pieces remain on the board.

## 5. Ending an endless game (project variants)

The base rules allow games that never end. `RuleSet::Uncapped` plays them as
published (base rule only; round 2 trains on it, with a safety limit treated as
truncation). The engine also offers three extra rules from round 1, chosen per
game with `RuleSet`; a base win (section 4) is always checked first.

| Variant | Rule | Engine | Tests (`crates/engine/tests/rules.rs`) |
|---|---|---|---|
| LC1 `repetitions: n` | The position (board and player to move) has occurred `n` times before: the player who just moved loses. | [`check_lc1`](../crates/engine/src/rules.rs#L58) | `lc1_first_repetition_loses` |
| LC2 `cap: c` | Nobody has won by move `c`: the player to move loses. Parity of `c` fixes the loser (White for even `c`). | [`check_lc2`](../crates/engine/src/rules.rs#L73) | `lc2_hard_cap_player_to_move_loses_if_not_winning`, `lc2_hard_cap_mover_loses_even_with_a_tower_lead`, `lc2_before_cap_not_terminal` |
| LC3 `cap: c` | Nobody has won by move `c`: the player with more stacks on top wins; equal counts are a draw. | [`check_lc3`](../crates/engine/src/rules.rs#L85) | `lc3_soft_cap_player_with_more_towers_wins`, `lc3_soft_cap_tie_is_earned_draw` |

**Example (LC2, cap 30).** Move 30 arrives with Red to move and Red on top of 5
stacks against White's 3. Red still loses: the cap ends the game against whoever is
to move.

Which of these (or none) the next training round uses is decided from measurements
in `docs/experiments/v2-ruleset.md`.

## Symmetry

The 8 symmetries of the square (4 rotations, 4 reflections) preserve Manhattan
distance, so they map legal moves to legal moves and wins to wins. This is checked,
not assumed: `crates/engine/tests/symmetry.rs` verifies on sampled positions that
each symmetry maps the legal-move set onto the transformed position's, that every
move commutes with it, and that the outcome is unchanged. Run over all 362,880
permutations of the 9 cells, the check passes for exactly those 8, and rejects
every other permutation. Round 2 may use all 8 for data augmentation
(`symmetry::verified_symmetries`), under rules that do not read the history.

## Mutation check

Each regression position was run against a one-line mutation of the rule it pins
(mutate, run `cargo test -p pogofish-engine --test regression_positions`, revert).
Every mutation made at least one test fail.

| Mutation | Tests that failed |
|---|---|
| `DISTANCES[3]` becomes `[3]` (3 pieces may not move 1 step) | `stack_of_three_moving_one_two_or_three`, `pickup_takes_the_top_pieces_in_order` |
| `apply_move` takes the bottom N pieces instead of the top N | `pickup_takes_the_top_pieces_in_order` |
| `legal_moves` skips the "top belongs to mover" check | `a_stack_topped_by_the_opponent_cannot_be_moved`, `no_legal_move_only_when_the_game_is_already_lost`, `stack_of_three_moving_one_two_or_three`, `a_lone_corner_piece_still_has_two_moves`, `initial_position_has_sixteen_moves` |
| `base_terminal` reads the bottom piece instead of the top | `win_by_squeeze_with_buried_opponent_pieces`, `no_legal_move_only_when_the_game_is_already_lost` |
| `base_terminal` names the wrong winner | `win_by_squeeze_with_buried_opponent_pieces`, `no_legal_move_only_when_the_game_is_already_lost` |
| White starts with stacks of 1 instead of 2 | `initial_position_has_sixteen_moves` |
