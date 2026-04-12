use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use pogofish_engine::{
    apply_move, initial_state, is_terminal, legal_moves, Color, Move, RuleSet,
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;

use crate::input::{self, Action, SelectionState};
use crate::ui;

pub fn run() -> anyhow::Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let result = main_loop(&mut terminal);

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;
    result
}

fn main_loop(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> anyhow::Result<()> {
    let rules = RuleSet::LC2 { cap: 50 };
    let mut state = initial_state();
    let mut selection = SelectionState::Idle;
    let perspective = Color::White;

    loop {
        terminal.draw(|f| {
            ui::render(f, &state, perspective, &selection);
        })?;

        if is_terminal(&state, &rules).is_some() {
            if let Event::Key(k) = event::read()? {
                if let Some(Action::Quit) = input::action_for(k) {
                    break;
                }
            }
            continue;
        }

        if let Event::Key(k) = event::read()? {
            let Some(action) = input::action_for(k) else {
                continue;
            };
            match action {
                Action::Quit => break,
                Action::SelectCell(cell) if cell < pogofish_engine::NUM_CELLS as u8 => {
                    match selection {
                        SelectionState::Idle | SelectionState::SourcePicked { .. } => {
                            if state.cell_owner(cell as usize) == Some(state.to_move()) {
                                selection = SelectionState::SourcePicked { cell };
                            }
                        }
                        SelectionState::PiecesPicked {
                            cell: from,
                            num_pieces,
                        } => {
                            let m = Move {
                                from_cell: from,
                                num_pieces,
                                to_cell: cell,
                            };
                            if legal_moves(&state).contains(&m) {
                                state = apply_move(&state, m).unwrap();
                                selection = SelectionState::Idle;
                            }
                        }
                    }
                }
                Action::Confirm => {
                    if let SelectionState::SourcePicked { cell } = selection {
                        selection = SelectionState::PiecesPicked {
                            cell,
                            num_pieces: 1,
                        };
                    }
                }
                Action::Cancel => {
                    selection = SelectionState::Idle;
                }
                Action::ChangePieces(delta) => match selection {
                    SelectionState::SourcePicked { cell } => {
                        let max = state.cells()[cell as usize].len().min(3) as i8;
                        let n = (1 + delta).clamp(1, max) as u8;
                        selection = SelectionState::PiecesPicked {
                            cell,
                            num_pieces: n,
                        };
                    }
                    SelectionState::PiecesPicked { cell, num_pieces } => {
                        let max = state.cells()[cell as usize].len().min(3) as i8;
                        let n = (num_pieces as i8 + delta).clamp(1, max) as u8;
                        selection = SelectionState::PiecesPicked {
                            cell,
                            num_pieces: n,
                        };
                    }
                    _ => {}
                },
                _ => {}
            }
        }
    }
    Ok(())
}
