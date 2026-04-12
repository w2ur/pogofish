use crossterm::{
    event::{self, DisableMouseCapture, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use pogofish_engine::{
    apply_move, initial_state, is_terminal, legal_moves, GameState, Move, RuleSet, BOARD_SIZE,
};
use std::io;
use std::time::Duration;

use crate::ui;

/// The phase of the 3-phase state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Browse,
    PickCount,
    Move,
    GameOver,
}

/// All mutable UI state for a single game tick.
pub struct AppState {
    pub phase: Phase,
    pub cursor: usize,
    pub source: Option<usize>,
    pub num_pieces: u8,
    pub error_msg: String,
    pub turn_number: u32,
    /// Index into the (1,2,3) tuple during PickCount phase.
    pub pick_selection: usize,
}

impl AppState {
    fn new() -> Self {
        Self {
            phase: Phase::Browse,
            cursor: 0,
            source: None,
            num_pieces: 0,
            error_msg: String::new(),
            turn_number: 1,
            pick_selection: 0,
        }
    }
}

/// Returns which of [1,2,3] are valid pickup counts from `cell_idx`.
/// The top piece must be the current player's color.
pub fn valid_pickup_counts(state: &GameState, cell_idx: usize) -> Vec<u8> {
    let player = state.to_move();
    let stack = &state.cells()[cell_idx];
    if stack.is_empty() || stack.last() != Some(&player) {
        return vec![];
    }
    let len = stack.len();
    (1u8..=3).filter(|&n| len >= n as usize).collect()
}

/// Move cursor by (dr, dc), clamping to grid edges.
fn cursor_move(cursor: usize, dr: i32, dc: i32) -> usize {
    let r = (cursor / BOARD_SIZE as usize) as i32;
    let c = (cursor % BOARD_SIZE as usize) as i32;
    let r = r.saturating_add(dr).clamp(0, BOARD_SIZE as i32 - 1);
    let c = c.saturating_add(dc).clamp(0, BOARD_SIZE as i32 - 1);
    (r * BOARD_SIZE as i32 + c) as usize
}

pub fn run() -> anyhow::Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    // Hide the cursor
    execute!(stdout, crossterm::cursor::Hide)?;

    let result = game_loop(&mut stdout);

    disable_raw_mode()?;
    execute!(stdout, LeaveAlternateScreen, DisableMouseCapture)?;
    execute!(stdout, crossterm::cursor::Show)?;
    result
}

fn game_loop(stdout: &mut io::Stdout) -> anyhow::Result<()> {
    let rules = RuleSet::LC2 { cap: 50 };

    let mut state = initial_state();
    let mut history: Vec<GameState> = Vec::new();
    let mut redo_stack: Vec<GameState> = Vec::new();
    let mut ui_state = AppState::new();

    loop {
        ui::draw(stdout, &state, &ui_state, false)?;

        // Poll for events; during GameOver we still block waiting for input
        let event = event::read()?;

        if let Event::Resize(_, _) = event {
            continue;
        }

        let key = match event {
            Event::Key(k) => k,
            _ => continue,
        };

        // Clear error each tick
        ui_state.error_msg.clear();

        // --- GAME OVER phase ---
        if ui_state.phase == Phase::GameOver {
            match key.code {
                KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
                KeyCode::Char('r') => {
                    state = initial_state();
                    history.clear();
                    redo_stack.clear();
                    ui_state = AppState::new();
                }
                _ => {}
            }
            continue;
        }

        // --- Global quit ---
        if key.code == KeyCode::Char('q') {
            return Ok(());
        }

        // --- PICK_COUNT phase arrow handling ---
        if ui_state.phase == Phase::PickCount {
            match key.code {
                KeyCode::Left => {
                    ui_state.pick_selection = ui_state.pick_selection.saturating_sub(1);
                    continue;
                }
                KeyCode::Right => {
                    ui_state.pick_selection = (ui_state.pick_selection + 1).min(2);
                    continue;
                }
                KeyCode::Up | KeyCode::Down => continue,
                _ => {}
            }
        } else {
            // --- Arrow keys for BROWSE and MOVE phases ---
            match key.code {
                KeyCode::Up => {
                    ui_state.cursor = cursor_move(ui_state.cursor, -1, 0);
                    continue;
                }
                KeyCode::Down => {
                    ui_state.cursor = cursor_move(ui_state.cursor, 1, 0);
                    continue;
                }
                KeyCode::Left => {
                    ui_state.cursor = cursor_move(ui_state.cursor, 0, -1);
                    continue;
                }
                KeyCode::Right => {
                    ui_state.cursor = cursor_move(ui_state.cursor, 0, 1);
                    continue;
                }
                _ => {}
            }
        }

        // --- BROWSE phase ---
        if ui_state.phase == Phase::Browse {
            match key.code {
                KeyCode::Enter => {
                    let cursor = ui_state.cursor;
                    let cell = &state.cells()[cursor];
                    if !cell.is_empty() && cell.last() == Some(&state.to_move()) {
                        let counts = valid_pickup_counts(&state, cursor);
                        if !counts.is_empty() {
                            ui_state.source = Some(cursor);
                            ui_state.phase = Phase::PickCount;
                            ui_state.pick_selection = 0;
                        } else {
                            ui_state.error_msg = "No valid pickups from this cell".to_string();
                        }
                    } else {
                        ui_state.error_msg = "Not your piece".to_string();
                    }
                }
                KeyCode::Char('u') => {
                    if let Some(prev) = history.pop() {
                        redo_stack.push(state.clone());
                        state = prev;
                        ui_state.turn_number = ui_state.turn_number.saturating_sub(1).max(1);
                    } else {
                        ui_state.error_msg = "Nothing to undo".to_string();
                    }
                }
                KeyCode::Char('R') | KeyCode::Char('r')
                    if key.modifiers.contains(KeyModifiers::SHIFT) =>
                {
                    if let Some(next) = redo_stack.pop() {
                        history.push(state.clone());
                        state = next;
                        ui_state.turn_number += 1;
                    } else {
                        ui_state.error_msg = "Nothing to redo".to_string();
                    }
                }
                _ => {}
            }
            continue;
        }

        // --- PICK_COUNT phase ---
        if ui_state.phase == Phase::PickCount {
            let source = match ui_state.source {
                Some(s) => s,
                None => {
                    ui_state.phase = Phase::Browse;
                    continue;
                }
            };

            match key.code {
                KeyCode::Esc => {
                    ui_state.phase = Phase::Browse;
                    ui_state.source = None;
                    ui_state.pick_selection = 0;
                }
                KeyCode::Enter => {
                    let n = (ui_state.pick_selection as u8) + 1;
                    let counts = valid_pickup_counts(&state, source);
                    if counts.contains(&n) {
                        ui_state.num_pieces = n;
                        ui_state.phase = Phase::Move;
                        ui_state.cursor = source;
                        ui_state.pick_selection = 0;
                    } else {
                        let piece_word = if n == 1 { "piece" } else { "pieces" };
                        ui_state.error_msg = format!("Cannot pick {n} {piece_word} here");
                    }
                }
                KeyCode::Char(c @ '1'..='3') => {
                    let n = c.to_digit(10).unwrap() as u8;
                    let counts = valid_pickup_counts(&state, source);
                    if counts.contains(&n) {
                        ui_state.num_pieces = n;
                        ui_state.phase = Phase::Move;
                        ui_state.cursor = source;
                        ui_state.pick_selection = 0;
                    } else {
                        let piece_word = if n == 1 { "piece" } else { "pieces" };
                        ui_state.error_msg = format!("Cannot pick {n} {piece_word} here");
                    }
                }
                _ => {}
            }
            continue;
        }

        // --- MOVE phase ---
        if ui_state.phase == Phase::Move {
            let source = match ui_state.source {
                Some(s) => s,
                None => {
                    ui_state.phase = Phase::Browse;
                    continue;
                }
            };

            match key.code {
                KeyCode::Esc => {
                    ui_state.phase = Phase::Browse;
                    ui_state.source = None;
                    ui_state.num_pieces = 0;
                }
                KeyCode::Enter => {
                    let mv = Move {
                        from_cell: source as u8,
                        num_pieces: ui_state.num_pieces,
                        to_cell: ui_state.cursor as u8,
                    };
                    let valid = legal_moves(&state);
                    if valid.contains(&mv) {
                        history.push(state.clone());
                        redo_stack.clear();
                        state = apply_move(&state, mv).unwrap();
                        ui_state.turn_number += 1;
                        ui_state.source = None;
                        ui_state.num_pieces = 0;

                        if is_terminal(&state, &rules).is_some() {
                            ui_state.phase = Phase::GameOver;
                            // Run victory animation
                            victory_animation(stdout, &state, &ui_state)?;
                        } else {
                            ui_state.phase = Phase::Browse;
                        }
                    } else {
                        ui_state.error_msg = "Invalid move \u{2014} check distance rules"
                            .to_string();
                    }
                }
                _ => {}
            }
            continue;
        }
    }
}

fn victory_animation(
    stdout: &mut io::Stdout,
    state: &GameState,
    ui_state: &AppState,
) -> anyhow::Result<()> {
    for i in 0..6 {
        let bright = i % 2 == 0;
        ui::draw(stdout, state, ui_state, bright)?;
        // Non-blocking wait 200ms, draining any input
        if event::poll(Duration::from_millis(200))? {
            let _ = event::read();
        }
    }
    ui::draw(stdout, state, ui_state, false)?;
    Ok(())
}
