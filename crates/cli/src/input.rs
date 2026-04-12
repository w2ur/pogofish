use crossterm::event::{KeyCode, KeyEvent};

#[derive(Debug, Clone, Copy)]
pub enum Action {
    Quit,
    SelectCell(u8),
    Confirm,
    Cancel,
    ChangePieces(i8),
}

pub fn action_for(key: KeyEvent) -> Option<Action> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => Some(Action::Quit),
        KeyCode::Enter => Some(Action::Confirm),
        KeyCode::Backspace => Some(Action::Cancel),
        KeyCode::Char('+') | KeyCode::Char('=') => Some(Action::ChangePieces(1)),
        KeyCode::Char('-') => Some(Action::ChangePieces(-1)),
        // Number keys 1-9 map to cells 0-8
        KeyCode::Char(c @ ('1'..='9')) => {
            Some(Action::SelectCell(c.to_digit(10).unwrap() as u8 - 1))
        }
        _ => None,
    }
}

#[derive(Debug, Clone, Copy)]
pub enum SelectionState {
    Idle,
    SourcePicked { cell: u8 },
    PiecesPicked { cell: u8, num_pieces: u8 },
}
