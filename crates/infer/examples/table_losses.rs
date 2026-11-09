//! Why the perfect player scores 0.919 against greedy, not 1: replays the v4
//! arena (table vs greedy, lc1-2, 1,000 pairs, 4-ply openings, seed 404) game
//! by game and reads, in the uncapped table, the value of each opening for the
//! side the table plays. Control: the replayed totals must equal the arena's
//! (1,838 wins, 162 losses, 143 of them as Red), or the run exits 2.
//!
//! Usage: table_losses <solved-dir>
use pogofish_engine::{
    apply_move_under, base_outcome, is_terminal, Color, GameState, Outcome, RuleSet,
};
use pogofish_infer::players::{player_from_spec, TiedAgent};
use pogofish_search::arena::{random_opening, Agent};
use pogofish_search::measure::game_seed;
use pogofish_search::perfect::Solved;
use pogofish_search::players::Scripted;
use pogofish_search::retro::{Board, Value};
use pogofish_search::rng::SplitMix64;
use std::collections::BTreeMap;
use std::path::Path;
use std::process::ExitCode;

const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };

/// White's result (None if cut), whether the variant rule ended it.
fn play(
    start: &GameState,
    white: &mut dyn Agent,
    red: &mut dyn Agent,
    done: u32,
    rng: &mut SplitMix64,
) -> (Option<f64>, bool) {
    let mut s = start.clone();
    let mut n = 0u32;
    loop {
        if let Some(o) = is_terminal(&s, &RULES) {
            let w = match o {
                Outcome::WinWhite => 1.0,
                Outcome::WinRed => 0.0,
                Outcome::DrawEarned => 0.5,
            };
            return (Some(w), base_outcome(&s).is_none());
        }
        if done + n >= 1000 {
            return (None, false);
        }
        let m = match s.to_move() {
            Color::White => white.choose(&s, &RULES, rng),
            Color::Red => red.choose(&s, &RULES, rng),
        };
        s = apply_move_under(&s, m, &RULES).expect("legal");
        n += 1;
    }
}

fn main() -> ExitCode {
    let dir = std::env::args()
        .nth(1)
        .expect("usage: table_losses <solved-dir>");
    let sv = Solved::load(Path::new(&dir)).expect("table");
    let mut table = TiedAgent(player_from_spec("table", Some(&sv)).expect("table player"));
    let mut greedy = Scripted::Greedy;
    // key: (opening value for the table's side, table colour) -> [wins, losses]
    let mut tally: BTreeMap<(String, &str), [u32; 2]> = BTreeMap::new();
    let (mut wins, mut losses, mut red_losses) = (0, 0, 0);
    for pair in 0..1000u64 {
        let mut rng = SplitMix64::new(game_seed(404, 7, pair));
        let (start, opening) = random_opening(&RULES, 4, &mut rng).expect("opening");
        // Value for the player to move after the opening.
        let v = sv.value(&Board::from_state(&start));
        for game in 0..2 {
            let table_white = game == 0;
            let (w, _) = if table_white {
                play(
                    &start,
                    &mut table,
                    &mut greedy,
                    opening.len() as u32,
                    &mut rng,
                )
            } else {
                play(
                    &start,
                    &mut greedy,
                    &mut table,
                    opening.len() as u32,
                    &mut rng,
                )
            };
            let w = w.expect("no unfinished game in the arena");
            let r = if table_white { w } else { 1.0 - w };
            let table_to_move = (start.to_move() == Color::White) == table_white;
            let cls = match (v, table_to_move) {
                (Value::Draw, _) => "draw".to_string(),
                (Value::Win(_), true) | (Value::Loss(_), false) => "won for the table".to_string(),
                (Value::Loss(_), true) | (Value::Win(_), false) => "lost for the table".to_string(),
                (x, _) => format!("{x:?}"),
            };
            let colour = if table_white { "White" } else { "Red" };
            let e = tally.entry((cls, colour)).or_default();
            if r > 0.5 {
                e[0] += 1;
                wins += 1
            } else {
                e[1] += 1;
                losses += 1;
                if !table_white {
                    red_losses += 1
                }
            }
        }
    }
    println!("replayed: {wins} wins, {losses} losses, {red_losses} losses as Red");
    for ((cls, col), [w, l]) in &tally {
        println!("{cls:>20} as {col:<5}: {w:>4} wins, {l:>4} losses");
    }
    if (wins, losses, red_losses) != (1838, 162, 143) {
        eprintln!("control failed: replay differs from docs/experiments/v4/table.json");
        return ExitCode::from(2);
    }
    ExitCode::SUCCESS
}
