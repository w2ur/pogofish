use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use pogofish_engine::{
    apply_move, initial_state, is_terminal, legal_moves, Color, Move, Outcome, RuleSet,
};
use pogofish_search::{
    mcts::{Mcts, MctsConfig},
    minimax::{solve, SolveConfig},
};
use ratatui::{
    backend::CrosstermBackend,
    style::{Color as RColor, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Terminal,
};
use std::io;

use crate::input::{self, Action, SelectionState};
use crate::ui;

#[derive(Debug, Clone, Copy)]
enum Opponent {
    Human,
    Minimax(u16),
    Mcts(u32),
}

pub fn run() -> anyhow::Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let result = menu_loop(&mut terminal);

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;
    result
}

fn menu_loop(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> anyhow::Result<()> {
    let mut rules = RuleSet::LC2 { cap: 50 };

    loop {
        let rules_str = match rules {
            RuleSet::LC1 { repetitions } => format!("LC1(rep={})", repetitions),
            RuleSet::LC2 { cap } => format!("LC2(cap={})", cap),
            RuleSet::LC3 { cap } => format!("LC3(cap={})", cap),
        };

        terminal.draw(|f| {
            let lines = vec![
                Line::from(""),
                Line::from(Span::styled(
                    "  POGOFISH",
                    Style::default()
                        .fg(RColor::Cyan)
                        .add_modifier(Modifier::BOLD),
                )),
                Line::from(""),
                Line::from(format!("  Rules: {}", rules_str)),
                Line::from(""),
                Line::from("  [H] Human vs Human"),
                Line::from("  [M] Human vs Minimax (depth 6)"),
                Line::from("  [T] Human vs MCTS (200 sims)"),
                Line::from(""),
                Line::from("  [1] LC1 (repetition loss)"),
                Line::from("  [2] LC2 (hard cap 50)"),
                Line::from("  [3] LC3 (soft cap 50)"),
                Line::from(""),
                Line::from("  [Q] Quit"),
            ];
            let p = Paragraph::new(lines).block(Block::default().borders(Borders::ALL));
            f.render_widget(p, f.area());
        })?;

        if let Event::Key(k) = event::read()? {
            match k.code {
                crossterm::event::KeyCode::Char('q') | crossterm::event::KeyCode::Esc => break,
                crossterm::event::KeyCode::Char('h') => {
                    game_loop(terminal, rules, Opponent::Human)?;
                }
                crossterm::event::KeyCode::Char('m') => {
                    game_loop(terminal, rules, Opponent::Minimax(6))?;
                }
                crossterm::event::KeyCode::Char('t') => {
                    game_loop(terminal, rules, Opponent::Mcts(200))?;
                }
                crossterm::event::KeyCode::Char('1') => {
                    rules = RuleSet::LC1 { repetitions: 1 };
                }
                crossterm::event::KeyCode::Char('2') => {
                    rules = RuleSet::LC2 { cap: 50 };
                }
                crossterm::event::KeyCode::Char('3') => {
                    rules = RuleSet::LC3 { cap: 50 };
                }
                _ => {}
            }
        }
    }
    Ok(())
}

fn game_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    rules: RuleSet,
    opponent: Opponent,
) -> anyhow::Result<()> {
    let mut state = initial_state();
    let mut selection = SelectionState::Idle;
    let perspective = Color::White;
    let ai_color = Color::Red;

    loop {
        terminal.draw(|f| {
            ui::render(f, &state, perspective, &selection);
        })?;

        // Check terminal state
        if let Some(outcome) = is_terminal(&state, &rules) {
            terminal.draw(|f| {
                ui::render(f, &state, perspective, &selection);
            })?;
            // Show result and wait for key
            terminal.draw(|f| {
                let msg = match outcome {
                    Outcome::WinWhite => "White wins!",
                    Outcome::WinRed => "Red wins!",
                    Outcome::DrawEarned => "Draw!",
                };
                let lines = vec![
                    Line::from(""),
                    Line::from(Span::styled(
                        format!("  {}", msg),
                        Style::default()
                            .fg(RColor::Yellow)
                            .add_modifier(Modifier::BOLD),
                    )),
                    Line::from("  Press any key to return to menu"),
                ];
                let p = Paragraph::new(lines).block(Block::default().borders(Borders::ALL));
                f.render_widget(p, f.area());
            })?;
            let _ = event::read()?;
            break;
        }

        // AI turn
        if !matches!(opponent, Opponent::Human) && state.to_move() == ai_color {
            let ai_move = match opponent {
                Opponent::Minimax(depth) => {
                    let result = solve(
                        &state,
                        &rules,
                        SolveConfig {
                            max_depth: depth,
                            ..Default::default()
                        },
                    );
                    result.best_move.unwrap_or_else(|| legal_moves(&state)[0])
                }
                Opponent::Mcts(sims) => {
                    let mut mcts = Mcts::new(MctsConfig {
                        simulations: sims,
                        c_puct: 1.4,
                    });
                    mcts.search(&state, &rules)
                }
                Opponent::Human => unreachable!(),
            };
            state = apply_move(&state, ai_move).unwrap();
            continue;
        }

        // Human turn
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
