//! Game logic for the terminal game, with no terminal code: a human against
//! the bundled AlphaZero net (or another human), under the ruleset the net
//! was trained on.

use pogofish_engine::{
    apply_move_under, initial_state, is_terminal, legal_moves, notation::move_to_notation, Color,
    GameState, Move, Outcome, RuleSet,
};
use pogofish_infer::mcts::{search, MctsConfig, SearchResult};
use pogofish_infer::mlp::Mlp;
use serde::Serialize;

/// The ruleset of round 2 (docs/experiments/v2-ruleset.md): a position that
/// occurs for the third time loses for the player whose move produced it.
pub const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };

/// The network shipped with the game (docs/experiments/v2-results.md, seed 1).
pub const BUNDLED_NET: &[u8] = include_bytes!("../assets/az-lc1-s1.pfw");

pub struct Opponent {
    pub net: Mlp,
    pub sims: u32,
}

impl Opponent {
    pub fn bundled(sims: u32) -> anyhow::Result<Self> {
        Ok(Self {
            net: Mlp::from_bytes(BUNDLED_NET)?,
            sims,
        })
    }

    fn think(&self, state: &GameState) -> SearchResult {
        let cfg = MctsConfig {
            num_simulations: self.sims.max(1),
            ..MctsConfig::default()
        };
        search(&self.net, state, &RULES, &cfg, None)
    }
}

/// One move of the game, for the record.
#[derive(Debug, Clone, Serialize)]
pub struct MoveRecord {
    pub ply: usize,
    pub by: &'static str,
    #[serde(rename = "move")]
    pub notation: String,
    /// For the AI's moves: its search's estimate of the position before the
    /// move, from its own side, in [−1, 1].
    pub ai_value: Option<f32>,
}

/// A finished (or abandoned) game, as saved for the owner's notes.
#[derive(Debug, Clone, Serialize)]
pub struct GameRecord {
    pub rules: String,
    pub human: &'static str,
    pub ai_simulations: Option<u32>,
    pub result: String,
    pub moves: Vec<MoveRecord>,
}

pub fn color_name(c: Color) -> &'static str {
    match c {
        Color::White => "White",
        Color::Red => "Red",
    }
}

pub struct Session {
    pub state: GameState,
    /// The side the human plays; with no AI, both sides are human.
    pub human: Color,
    pub ai: Option<Opponent>,
    /// The AI's last move and its estimate before it (its side).
    pub last_ai: Option<(Move, f32)>,
    /// A suggestion for the human and the estimate for the human's side.
    pub hint: Option<(Move, f32)>,
    history: Vec<(GameState, Vec<MoveRecord>)>,
    redo: Vec<(GameState, Vec<MoveRecord>)>,
    moves: Vec<MoveRecord>,
}

impl Session {
    pub fn new(human: Color, ai: Option<Opponent>) -> Self {
        Self {
            state: initial_state(),
            human,
            ai,
            last_ai: None,
            hint: None,
            history: Vec::new(),
            redo: Vec::new(),
            moves: Vec::new(),
        }
    }

    pub fn outcome(&self) -> Option<Outcome> {
        is_terminal(&self.state, &RULES)
    }

    pub fn is_ai_turn(&self) -> bool {
        self.ai.is_some() && self.outcome().is_none() && self.state.to_move() != self.human
    }

    fn push(&mut self, m: Move, ai_value: Option<f32>) {
        let by = color_name(self.state.to_move());
        self.history.push((self.state.clone(), self.moves.clone()));
        self.moves.push(MoveRecord {
            ply: self.moves.len() + 1,
            by,
            notation: move_to_notation(m),
            ai_value,
        });
        self.state = apply_move_under(&self.state, m, &RULES).expect("checked legal");
        self.hint = None;
    }

    /// A move by the human whose turn it is. Errors if it is illegal, the
    /// game is over, or it is the AI's turn.
    pub fn play(&mut self, m: Move) -> Result<(), &'static str> {
        if self.outcome().is_some() {
            return Err("The game is over");
        }
        if self.is_ai_turn() {
            return Err("It is the AI's turn");
        }
        if !legal_moves(&self.state).contains(&m) {
            return Err("Illegal move \u{2014} check the distance rules");
        }
        self.push(m, None);
        self.redo.clear();
        Ok(())
    }

    /// Let the AI move. Returns its move, or None if it is not its turn.
    pub fn ai_move(&mut self) -> Option<Move> {
        if !self.is_ai_turn() {
            return None;
        }
        let result = self.ai.as_ref().expect("checked").think(&self.state);
        let m = result.best_move();
        self.push(m, Some(result.root_value));
        self.last_ai = Some((m, result.root_value));
        self.redo.clear();
        Some(m)
    }

    /// The AI's suggestion for the human, with the estimate for the human's
    /// side. Uses the bundled net even in a two-human game.
    pub fn compute_hint(&mut self, helper: &Opponent) -> Option<(Move, f32)> {
        if self.outcome().is_some() {
            return None;
        }
        let r = helper.think(&self.state);
        self.hint = Some((r.best_move(), r.root_value));
        self.hint
    }

    /// Undo back to the previous position where the human is to move (so,
    /// against the AI, the human's move and the AI's reply).
    pub fn undo(&mut self) -> bool {
        let Some(top) = self.history.pop() else {
            return false;
        };
        self.redo.push((self.state.clone(), self.moves.clone()));
        (self.state, self.moves) = top;
        while self.ai.is_some() && self.state.to_move() != self.human {
            let Some(prev) = self.history.pop() else {
                break;
            };
            self.redo.push((self.state.clone(), self.moves.clone()));
            (self.state, self.moves) = prev;
        }
        self.hint = None;
        self.last_ai = None;
        true
    }

    pub fn redo(&mut self) -> bool {
        let Some(next) = self.redo.pop() else {
            return false;
        };
        self.history.push((self.state.clone(), self.moves.clone()));
        (self.state, self.moves) = next;
        while self.ai.is_some() && self.state.to_move() != self.human && self.outcome().is_none() {
            let Some(n) = self.redo.pop() else { break };
            self.history.push((self.state.clone(), self.moves.clone()));
            (self.state, self.moves) = n;
        }
        self.hint = None;
        true
    }

    pub fn ply(&self) -> usize {
        self.moves.len()
    }

    /// Why the game ended, in words.
    pub fn result_text(&self) -> String {
        match self.outcome() {
            None => "unfinished".into(),
            Some(o) => {
                let winner = o.winner().map(color_name).unwrap_or("nobody");
                let loser_has_top = self
                    .state
                    .cells()
                    .iter()
                    .any(|c| c.last() == Some(&self.state.to_move()));
                let reason = if loser_has_top {
                    "the position occurred for the third time"
                } else {
                    "no stack is left with the loser's colour on top"
                };
                format!("{winner} wins: {reason}")
            }
        }
    }

    pub fn record(&self) -> GameRecord {
        GameRecord {
            rules: RULES.to_string(),
            human: if self.ai.is_some() {
                color_name(self.human)
            } else {
                "both"
            },
            ai_simulations: self.ai.as_ref().map(|a| a.sims),
            result: self.result_text(),
            moves: self.moves.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pogofish_search::players::Scripted;
    use pogofish_search::rng::SplitMix64;

    fn vs_ai(human: Color, sims: u32) -> Session {
        Session::new(human, Some(Opponent::bundled(sims).unwrap()))
    }

    #[test]
    fn the_bundled_net_loads_and_matches_the_ruleset() {
        let o = Opponent::bundled(10).unwrap();
        assert!(o.net.features.suffice_for(&RULES));
    }

    /// A whole game against a random human ends, with only legal moves, the
    /// AI moving whenever it is its turn, and a record of every move.
    #[test]
    fn a_full_game_against_a_random_human() {
        for (seed, human) in [(1, Color::White), (2, Color::Red)] {
            let mut s = vs_ai(human, 20);
            let mut rng = SplitMix64::new(seed);
            let mut guard = 0;
            while s.outcome().is_none() {
                guard += 1;
                assert!(guard < 2000, "game did not end");
                if s.is_ai_turn() {
                    s.ai_move().unwrap();
                } else {
                    assert_eq!(s.state.to_move(), human);
                    let m = Scripted::Random.choose(&s.state, &RULES, &mut rng);
                    s.play(m).unwrap();
                }
            }
            let r = s.record();
            assert_eq!(r.moves.len(), s.ply());
            assert!(r
                .moves
                .iter()
                .filter(|m| m.by != color_name(human))
                .all(|m| m.ai_value.is_some()));
            assert!(r.result.contains("wins"), "{}", r.result);
            serde_json::to_string(&r).unwrap();
        }
    }

    #[test]
    fn the_ai_plays_first_when_the_human_is_red() {
        let mut s = vs_ai(Color::Red, 10);
        assert!(s.is_ai_turn());
        assert!(
            s.play(legal_moves(&s.state)[0]).is_err(),
            "not the human's turn"
        );
        let m = s.ai_move().unwrap();
        assert!(legal_moves(&initial_state()).contains(&m));
        assert!(!s.is_ai_turn());
        assert!(s.last_ai.is_some());
    }

    #[test]
    fn undo_goes_back_to_the_humans_turn_and_redo_returns() {
        let mut s = vs_ai(Color::White, 10);
        let first = legal_moves(&s.state)[0];
        s.play(first).unwrap();
        s.ai_move().unwrap();
        let after = s.state.key();
        assert_eq!(s.ply(), 2);
        assert!(s.undo());
        assert_eq!(s.ply(), 0);
        assert_eq!(s.state.key(), initial_state().key());
        assert!(s.redo());
        assert_eq!(s.state.key(), after);
        assert_eq!(s.ply(), 2);
    }

    #[test]
    fn illegal_moves_are_refused() {
        let mut s = vs_ai(Color::White, 10);
        let bad = Move {
            from_cell: 8,
            num_pieces: 1,
            to_cell: 5,
        };
        assert!(s.play(bad).is_err());
        assert_eq!(s.ply(), 0);
    }

    #[test]
    fn the_hint_is_a_legal_move_for_the_human() {
        let mut s = vs_ai(Color::White, 10);
        let helper = Opponent::bundled(30).unwrap();
        let (m, v) = s.compute_hint(&helper).unwrap();
        assert!(legal_moves(&s.state).contains(&m));
        assert!((-1.0..=1.0).contains(&v));
    }

    #[test]
    fn a_repetition_loss_is_explained() {
        // Both sides shuffle one piece out and back. The start position
        // (White to move) recurs after moves 4 and 8; Red's move 8 makes it
        // the third occurrence, so Red loses.
        let mut s = Session::new(Color::White, None);
        let cycle = [
            Move {
                from_cell: 0,
                num_pieces: 1,
                to_cell: 3,
            },
            Move {
                from_cell: 6,
                num_pieces: 1,
                to_cell: 7,
            },
            Move {
                from_cell: 3,
                num_pieces: 1,
                to_cell: 0,
            },
            Move {
                from_cell: 7,
                num_pieces: 1,
                to_cell: 6,
            },
        ];
        for m in cycle.iter().cycle().take(8) {
            if s.outcome().is_some() {
                break;
            }
            s.play(*m).unwrap();
        }
        assert!(s.outcome().is_some());
        assert_eq!(s.ply(), 8);
        assert_eq!(s.outcome(), Some(Outcome::WinWhite));
        assert!(
            s.result_text().contains("third time"),
            "{}",
            s.result_text()
        );
    }
}
