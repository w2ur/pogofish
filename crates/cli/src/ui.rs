use pogofish_engine::{Color, GameState};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color as RColor, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use crate::input::SelectionState;

pub fn render(
    f: &mut Frame,
    state: &GameState,
    perspective: Color,
    selection: &SelectionState,
) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Min(0),
            Constraint::Length(3),
        ])
        .split(f.area());

    let turn = match state.to_move() {
        Color::White => Span::styled("White", Style::default().fg(RColor::White).add_modifier(Modifier::BOLD)),
        Color::Red => Span::styled("Red", Style::default().fg(RColor::LightRed).add_modifier(Modifier::BOLD)),
    };
    let title = Line::from(vec![
        Span::raw("Pogofish — "),
        turn,
        Span::raw(" to move"),
    ]);
    f.render_widget(Paragraph::new(title), chunks[0]);

    render_board(f, chunks[1], state, perspective, selection);

    let status_text = match selection {
        SelectionState::Idle => "Select source cell (1-9) | q to quit".to_string(),
        SelectionState::SourcePicked { cell } => {
            format!("Source: {} | +/- pieces | Enter to confirm | Backspace to cancel",
                pogofish_engine::notation::cell_to_notation(*cell))
        }
        SelectionState::PiecesPicked { cell, num_pieces } => {
            format!("Moving {} piece(s) from {} | Select destination (1-9) | Backspace to cancel",
                num_pieces, pogofish_engine::notation::cell_to_notation(*cell))
        }
    };
    let status = Paragraph::new(status_text)
        .block(Block::default().borders(Borders::TOP));
    f.render_widget(status, chunks[2]);
}

fn render_board(
    f: &mut Frame,
    area: Rect,
    state: &GameState,
    perspective: Color,
    selection: &SelectionState,
) {
    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Ratio(1, 3); 3])
        .split(area);

    for visual_row in 0..3usize {
        let board_row = if perspective == Color::Red {
            2 - visual_row
        } else {
            visual_row
        };
        let cols = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Ratio(1, 3); 3])
            .split(rows[visual_row]);

        for col in 0..3usize {
            let cell_idx = (board_row * 3 + col) as u8;
            let stack = &state.cells()[cell_idx as usize];
            let notation = pogofish_engine::notation::cell_to_notation(cell_idx);

            let is_selected = match selection {
                SelectionState::SourcePicked { cell } | SelectionState::PiecesPicked { cell, .. } => {
                    *cell == cell_idx
                }
                _ => false,
            };

            let border_style = if is_selected {
                Style::default().fg(RColor::Yellow)
            } else {
                Style::default()
            };

            let block = Block::default()
                .borders(Borders::ALL)
                .border_style(border_style)
                .title(notation);

            let inner_text = if stack.is_empty() {
                Line::from(Span::styled("·", Style::default().fg(RColor::DarkGray)))
            } else {
                stack_line(stack)
            };

            let p = Paragraph::new(inner_text)
                .block(block)
                .alignment(Alignment::Center);
            f.render_widget(p, cols[col]);
        }
    }
}

/// Render a stack as a line of colored piece symbols.
fn stack_line(stack: &[Color]) -> Line<'static> {
    let spans: Vec<Span<'static>> = stack
        .iter()
        .map(|&c| match c {
            Color::White => Span::styled("●", Style::default().fg(RColor::White).add_modifier(Modifier::BOLD)),
            Color::Red => Span::styled("●", Style::default().fg(RColor::LightRed).add_modifier(Modifier::BOLD)),
        })
        .collect();
    Line::from(spans)
}
