use crossterm::{
    cursor::MoveTo,
    queue,
    style::{Attribute, Color, Print, ResetColor, SetAttribute, SetForegroundColor},
    terminal::{Clear, ClearType},
};
use pogofish_engine::{legal_moves, Color as PColor, GameState, Outcome, BOARD_SIZE};
use std::io::{self, Write};

use crate::app::{valid_pickup_counts, App, AppState, Phase};
use crate::session::{color_name, Session};

// Box-drawing characters
const BOX_TL: &str = "\u{250c}"; // ┌
const BOX_TR: &str = "\u{2510}"; // ┐
const BOX_BL: &str = "\u{2514}"; // └
const BOX_BR: &str = "\u{2518}"; // ┘
const BOX_H: &str = "\u{2500}"; // ─
const BOX_V: &str = "\u{2502}"; // │
const BOX_TJ: &str = "\u{252c}"; // ┬
const BOX_BJ: &str = "\u{2534}"; // ┴
const BOX_LJ: &str = "\u{251c}"; // ├
const BOX_RJ: &str = "\u{2524}"; // ┤
const BOX_X: &str = "\u{253c}"; // ┼

const PIECE_CHAR: &str = "\u{2b24}"; // ⬤
const GHOST_CHAR: &str = "\u{25cb}"; // ○
const EMPTY_CHAR: &str = "\u{00b7}"; // ·

const TITLE: &str = "P O G O F I S H";
const CELL_WIDTH: usize = 7;
/// Rows per cell. Stacks of up to this many pieces are drawn in full; a
/// taller one shows its top `CELL_ROWS - 1` pieces and lists the rest.
const CELL_ROWS: usize = 6;
const NUM_CELLS: usize = 9;
/// Columns between the board and the text panel on its right.
const PANEL_GAP: u16 = 3;
/// Width of the text panel; board and panel fit in 80 columns.
const PANEL_WIDTH: usize = 47;
const BOARD: usize = BOARD_SIZE as usize;

// Helper: write at position (y, x) with optional attribute/color
fn at(stdout: &mut impl Write, y: u16, x: u16, text: &str) -> io::Result<()> {
    queue!(stdout, MoveTo(x, y), Print(text))
}

fn at_dim(stdout: &mut impl Write, y: u16, x: u16, text: &str) -> io::Result<()> {
    queue!(
        stdout,
        MoveTo(x, y),
        SetAttribute(Attribute::Dim),
        Print(text),
        SetAttribute(Attribute::Reset)
    )
}

fn at_colored_bold(
    stdout: &mut impl Write,
    y: u16,
    x: u16,
    text: &str,
    fg: Color,
) -> io::Result<()> {
    queue!(
        stdout,
        MoveTo(x, y),
        SetForegroundColor(fg),
        SetAttribute(Attribute::Bold),
        Print(text),
        ResetColor,
        SetAttribute(Attribute::Reset)
    )
}

fn at_colored_bold_underline(
    stdout: &mut impl Write,
    y: u16,
    x: u16,
    text: &str,
    fg: Color,
) -> io::Result<()> {
    queue!(
        stdout,
        MoveTo(x, y),
        SetForegroundColor(fg),
        SetAttribute(Attribute::Bold),
        SetAttribute(Attribute::Underlined),
        Print(text),
        ResetColor,
        SetAttribute(Attribute::Reset)
    )
}

/// Full screen redraw — mirrors Python's `_full_draw`.
pub fn draw(stdout: &mut impl Write, app: &App, flash_bright: bool) -> anyhow::Result<()> {
    let session = &app.session;
    let state = &session.state;
    let ui = &app.ui;
    queue!(stdout, Clear(ClearType::All))?;

    let x_offset: u16 = 2;
    let mut y: u16 = 1;

    // Title
    draw_title(stdout, y, x_offset)?;
    y += 1;

    // Turn info
    draw_turn_info(stdout, y, x_offset, state, session.ply() as u32 + 1)?;
    y += 1;
    draw_players(stdout, y, x_offset, session)?;
    y += 1;

    // Separator
    let grid_width = (CELL_WIDTH + 1) * BOARD + 1;
    let panel_x = x_offset + grid_width as u16 + PANEL_GAP;
    draw_separator(
        stdout,
        y,
        x_offset,
        grid_width + PANEL_GAP as usize + PANEL_WIDTH,
    )?;
    y += 1;

    // The board on the left; everything that changes during play in a
    // panel on its right, so the text never pushes the board around.
    let board_top = y;
    draw_board(stdout, y, x_offset, state, ui, flash_bright)?;
    let mut p = Panel {
        x: panel_x,
        y: board_top + 1,
    };

    draw_prompt(stdout, &mut p, ui, session)?;
    p.skip();

    // The AI's last move and its estimate, kept until the human moves.
    if let (Some((m, v)), false) = (session.last_ai, ui.phase == Phase::GameOver) {
        p.text(
            stdout,
            &format!(
                "AI played {}",
                pogofish_engine::notation::move_to_notation(m)
            ),
            Style::Plain,
        )?;
        p.text(
            stdout,
            &format!(
                "It rated its position {:+.2} (about {:.0}% to win)",
                v,
                (v + 1.0) * 50.0
            ),
            Style::Dim,
        )?;
        p.skip();
    }

    // Info (hint, undo, saved game)
    if !ui.info_msg.is_empty() {
        p.text(stdout, &ui.info_msg, Style::Plain)?;
        p.skip();
    }

    // Repetition warning: the rule reads how often this position occurred.
    let seen = state.occurrences_before();
    if seen > 0 && ui.phase != Phase::GameOver {
        let times = if seen == 1 { "once" } else { "twice" };
        p.text(
            stdout,
            &format!("This position has occurred {times} before; a third occurrence loses for whoever makes it"),
            Style::Bold(Color::Yellow),
        )?;
        p.skip();
    }

    // Error
    if !ui.error_msg.is_empty() {
        p.text(stdout, &ui.error_msg, Style::Bold(Color::Red))?;
        p.skip();
    }

    // Score
    draw_score(stdout, p.y, p.x, state)?;
    p.y += 1;
    p.skip();

    // Key hints
    draw_keys(stdout, &mut p, ui)?;

    stdout.flush()?;
    Ok(())
}

#[derive(Clone, Copy)]
enum Style {
    Plain,
    Dim,
    Bold(Color),
}

/// The text panel to the right of the board: a column of lines, each
/// wrapped to `PANEL_WIDTH`.
struct Panel {
    x: u16,
    y: u16,
}

impl Panel {
    fn text(&mut self, stdout: &mut impl Write, text: &str, style: Style) -> io::Result<()> {
        for line in wrap(text, PANEL_WIDTH) {
            match style {
                Style::Plain => at(stdout, self.y, self.x, &line)?,
                Style::Dim => at_dim(stdout, self.y, self.x, &line)?,
                Style::Bold(fg) => at_colored_bold(stdout, self.y, self.x, &line, fg)?,
            }
            self.y += 1;
        }
        Ok(())
    }

    fn skip(&mut self) {
        self.y += 1;
    }
}

/// Split `text` into lines of at most `width` characters, at spaces where
/// possible (a longer word, such as a file path, is cut).
pub(crate) fn wrap(text: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    for word in text.split(' ') {
        let mut word: Vec<char> = word.chars().collect();
        let len = line.chars().count();
        if len > 0 && len + 1 + word.len() > width {
            lines.push(std::mem::take(&mut line));
        }
        if !line.is_empty() {
            line.push(' ');
        }
        while word.len() > width - line.chars().count() {
            let room = width - line.chars().count();
            line.extend(word.drain(..room));
            lines.push(std::mem::take(&mut line));
        }
        line.extend(word);
    }
    if !line.is_empty() || lines.is_empty() {
        lines.push(line);
    }
    lines
}

fn draw_players(stdout: &mut impl Write, y: u16, x: u16, session: &Session) -> io::Result<()> {
    let text = match &session.ai {
        Some(ai) => format!(
            "You play {}  \u{2014}  AI: {} simulations per move  \u{2014}  rules: {}",
            color_name(session.human),
            ai.sims,
            crate::session::RULES
        ),
        None => format!("Two players  \u{2014}  rules: {}", crate::session::RULES),
    };
    at_dim(stdout, y, x, &text)
}

fn draw_title(stdout: &mut impl Write, y: u16, x: u16) -> io::Result<()> {
    at_colored_bold(stdout, y, x, TITLE, Color::Cyan)
}

fn draw_turn_info(
    stdout: &mut impl Write,
    y: u16,
    x: u16,
    state: &GameState,
    turn_number: u32,
) -> io::Result<()> {
    let white_label = format!("{PIECE_CHAR} White");
    let red_label = format!("{PIECE_CHAR} Red");

    // White piece indicator
    if state.to_move() == PColor::White {
        at_colored_bold_underline(stdout, y, x, &white_label, Color::White)?;
    } else {
        at_colored_bold(stdout, y, x, &white_label, Color::White)?;
    }

    // " vs "
    at_dim(stdout, y, x + 8, " vs ")?;

    // Red piece indicator
    if state.to_move() == PColor::Red {
        at_colored_bold_underline(stdout, y, x + 12, &red_label, Color::Red)?;
    } else {
        at_colored_bold(stdout, y, x + 12, &red_label, Color::Red)?;
    }

    // Turn number
    let turn_str = format!("    Turn {turn_number}");
    at_dim(stdout, y, x + 18, &turn_str)?;

    Ok(())
}

fn draw_separator(stdout: &mut impl Write, y: u16, x: u16, width: usize) -> io::Result<()> {
    let line = BOX_H.repeat(width);
    at_dim(stdout, y, x, &line)
}

/// Represents one rendered piece entry: the char to display and its color/style.
#[derive(Clone)]
enum PieceEntry {
    Piece(PColor, bool), // (color, flash_reverse)
    Ghost,
    Picked, // picked pieces shown at destination (yellow)
}

/// Draw the 3x3 board. Returns next y after the board.
fn draw_board(
    stdout: &mut impl Write,
    start_y: u16,
    x: u16,
    state: &GameState,
    ui: &AppState,
    flash_bright: bool,
) -> anyhow::Result<u16> {
    let cells = state.cells();

    // Fixed cell height, so the board never changes size during a game. A
    // taller stack shows its top pieces and lists the hidden ones below.
    let cell_height = CELL_ROWS;

    // Determine ghost/picked state
    let ghost_cell = if ui.phase == Phase::Move {
        ui.source
    } else {
        None
    };
    let ghost_count = if ui.phase == Phase::Move {
        ui.num_pieces as usize
    } else {
        0
    };
    let picked_colors: Vec<PColor> = if let (Phase::Move, Some(src)) = (ui.phase, ghost_cell) {
        let stack = &cells[src];
        let n = ghost_count.min(stack.len());
        stack[stack.len() - n..].to_vec()
    } else {
        vec![]
    };

    // Build cell contents: bottom-to-top list of PieceEntry
    let cell_contents: Vec<Vec<PieceEntry>> = (0..NUM_CELLS)
        .map(|ci| {
            let stack = &cells[ci];
            let mut entries: Vec<PieceEntry> = Vec::new();

            if Some(ci) == ghost_cell && ghost_count > 0 {
                // Show remaining pieces + ghost placeholders
                let remaining = if ghost_count <= stack.len() {
                    &stack[..stack.len() - ghost_count]
                } else {
                    &stack[..]
                };
                for &c in remaining {
                    entries.push(PieceEntry::Piece(c, flash_bright));
                }
                for _ in 0..ghost_count {
                    entries.push(PieceEntry::Ghost);
                }
            } else {
                for &c in stack.iter() {
                    entries.push(PieceEntry::Piece(c, flash_bright && !stack.is_empty()));
                }
            }

            // In MOVE phase, show picked pieces at cursor destination
            if ui.phase == Phase::Move && ci == ui.cursor && !picked_colors.is_empty() {
                for &c in &picked_colors {
                    let _ = c; // we use Picked variant which renders yellow
                    entries.push(PieceEntry::Picked);
                }
            }

            entries
        })
        .collect();

    // Compute legal destinations during Move phase
    let legal_dests: Vec<bool> = if ui.phase == Phase::Move {
        if let Some(source) = ui.source {
            let np = ui.num_pieces;
            let mut dests = vec![false; NUM_CELLS];
            let all_legal = legal_moves(state);
            for m in &all_legal {
                if m.from_cell == source as u8 && m.num_pieces == np {
                    dests[m.to_cell as usize] = true;
                }
            }
            dests
        } else {
            vec![false; NUM_CELLS]
        }
    } else {
        vec![false; NUM_CELLS]
    };

    let mut y = start_y;

    // Top border
    let mut top = BOX_TL.to_string();
    for col in 0..BOARD {
        top.push_str(&BOX_H.repeat(CELL_WIDTH));
        if col < BOARD - 1 {
            top.push_str(BOX_TJ);
        }
    }
    top.push_str(BOX_TR);
    at_dim(stdout, y, x, &top)?;
    y += 1;

    for row in 0..BOARD {
        // Draw cell_height rows for this grid row
        for h in 0..cell_height {
            let mut cx = x;
            for col in 0..BOARD {
                let ci = row * BOARD + col;
                at_dim(stdout, y + h as u16, cx, BOX_V)?;
                cx += 1;

                let entries = &cell_contents[ci];
                // A stack taller than the cell shows its top `cell_height - 1`
                // entries; the bottom row lists the hidden ones as text.
                let overflow = entries.len() > cell_height;
                let shown_rows = if overflow {
                    cell_height - 1
                } else {
                    cell_height
                };
                let first_shown = entries.len().saturating_sub(shown_rows);
                let stack_size = entries.len() - first_shown;

                // Bottom-aligned rendering:
                // Row h=0 is the top visual row of the cell.
                // entries[stack_size-1] is the top piece, drawn at h = cell_height - stack_size.
                // entries[0] is the bottom piece, drawn at h = cell_height - 1.
                let piece_row: Option<usize> = {
                    let offset = shown_rows.saturating_sub(stack_size);
                    if h >= offset && h < offset + stack_size {
                        // Which entry to show: h - offset = 0 means top piece, so index = stack_size-1 - (h-offset)
                        Some(first_shown + stack_size - 1 - (h - offset))
                    } else {
                        None
                    }
                };

                let is_cursor = ci == ui.cursor;
                let is_source_cell =
                    matches!(ui.phase, Phase::PickCount | Phase::Move) && ui.source == Some(ci);
                let is_legal = legal_dests[ci];
                let in_move_phase = ui.phase == Phase::Move;
                let highlight_cursor = is_cursor && ui.phase != Phase::GameOver;

                // Determine cell background color
                let bg_color: Option<Color> = if highlight_cursor {
                    if in_move_phase && !is_source_cell {
                        // Cursor in move phase: green if legal, red if illegal
                        Some(if is_legal {
                            Color::Green
                        } else {
                            Color::DarkRed
                        })
                    } else {
                        Some(Color::Yellow) // default cursor color
                    }
                } else if is_source_cell {
                    Some(Color::Green)
                } else if in_move_phase && is_legal {
                    Some(Color::DarkGreen) // dim hint for reachable cells
                } else {
                    None
                };

                if let Some(idx) = piece_row {
                    let entry = &entries[idx];
                    let pad_left = CELL_WIDTH / 2;
                    let pad_right = CELL_WIDTH - pad_left - 1;

                    if let Some(bg) = bg_color {
                        queue!(
                            stdout,
                            MoveTo(cx, y + h as u16),
                            SetForegroundColor(bg),
                            SetAttribute(Attribute::Reverse),
                            Print(" ".repeat(pad_left)),
                            ResetColor,
                            SetAttribute(Attribute::Reset)
                        )?;
                        draw_piece_entry(
                            stdout,
                            cx + pad_left as u16,
                            y + h as u16,
                            entry,
                            highlight_cursor,
                        )?;
                        queue!(
                            stdout,
                            MoveTo(cx + pad_left as u16 + 1, y + h as u16),
                            SetForegroundColor(bg),
                            SetAttribute(Attribute::Reverse),
                            Print(" ".repeat(pad_right)),
                            ResetColor,
                            SetAttribute(Attribute::Reset)
                        )?;
                    } else {
                        at(stdout, y + h as u16, cx, &" ".repeat(pad_left))?;
                        draw_piece_entry(stdout, cx + pad_left as u16, y + h as u16, entry, false)?;
                        at(
                            stdout,
                            y + h as u16,
                            cx + pad_left as u16 + 1,
                            &" ".repeat(pad_right),
                        )?;
                    }
                } else if overflow && h == cell_height - 1 {
                    draw_hidden(stdout, cx, y + h as u16, &entries[..first_shown])?;
                } else {
                    // Empty row
                    if let Some(bg) = bg_color {
                        queue!(
                            stdout,
                            MoveTo(cx, y + h as u16),
                            SetForegroundColor(bg),
                            SetAttribute(Attribute::Reverse),
                            Print(" ".repeat(CELL_WIDTH)),
                            ResetColor,
                            SetAttribute(Attribute::Reset)
                        )?;
                    } else if h == cell_height - 1 && entries.is_empty() {
                        // Bottom of empty cell: show dot
                        let pad_left = CELL_WIDTH / 2;
                        let pad_right = CELL_WIDTH - pad_left - 1;
                        at(stdout, y + h as u16, cx, &" ".repeat(pad_left))?;
                        at_dim(stdout, y + h as u16, cx + pad_left as u16, EMPTY_CHAR)?;
                        at(
                            stdout,
                            y + h as u16,
                            cx + pad_left as u16 + 1,
                            &" ".repeat(pad_right),
                        )?;
                    } else {
                        at(stdout, y + h as u16, cx, &" ".repeat(CELL_WIDTH))?;
                    }
                }

                cx += CELL_WIDTH as u16;
            }
            // Right border
            at_dim(stdout, y + h as u16, cx, BOX_V)?;
        }

        y += cell_height as u16;

        // Row separator or bottom border
        if row < BOARD - 1 {
            let mut sep = BOX_LJ.to_string();
            for col in 0..BOARD {
                sep.push_str(&BOX_H.repeat(CELL_WIDTH));
                if col < BOARD - 1 {
                    sep.push_str(BOX_X);
                }
            }
            sep.push_str(BOX_RJ);
            at_dim(stdout, y, x, &sep)?;
        } else {
            let mut bot = BOX_BL.to_string();
            for col in 0..BOARD {
                bot.push_str(&BOX_H.repeat(CELL_WIDTH));
                if col < BOARD - 1 {
                    bot.push_str(BOX_BJ);
                }
            }
            bot.push_str(BOX_BR);
            at_dim(stdout, y, x, &bot)?;
        }
        y += 1;
    }

    // Cell index labels (one row per board row, each cell centered)
    for row in 0..BOARD {
        let mut label = String::new();
        for col in 0..BOARD {
            let ci = row * BOARD + col;
            let name = pogofish_engine::notation::cell_to_notation(ci as u8);
            let centered = format!("{:^width$}", name, width = CELL_WIDTH);
            label.push_str(&centered);
            if col < BOARD - 1 {
                label.push(' ');
            }
        }
        at_dim(stdout, y, x + 1, &label)?;
        y += 1;
    }

    Ok(y)
}

/// The pieces hidden below a tall stack, bottom to top, as small coloured
/// letters (`w` White, `r` Red) centred in the cell's bottom row.
/// How many hidden entries fit in one cell row, and the "+N" marker for the rest.
fn hidden_layout(len: usize) -> (usize, Option<String>) {
    if len <= CELL_WIDTH {
        return (len, None);
    }
    // At most 15 entries can be hidden, so the marker is at most "+12".
    let shown = CELL_WIDTH - 3;
    (shown, Some(format!("+{}", len - shown)))
}

fn draw_hidden(stdout: &mut impl Write, x: u16, y: u16, hidden: &[PieceEntry]) -> io::Result<()> {
    let (n, more) = hidden_layout(hidden.len());
    let width = n + more.as_ref().map_or(0, |m| m.len());
    let pad_left = (CELL_WIDTH - width) / 2;
    at(stdout, y, x, &" ".repeat(CELL_WIDTH))?;
    if let Some(m) = &more {
        at(stdout, y, x + (pad_left + n) as u16, m)?;
    }
    for (i, entry) in hidden.iter().take(n).enumerate() {
        let (ch, fg) = match entry {
            PieceEntry::Piece(PColor::White, _) => ("w", Color::White),
            PieceEntry::Piece(PColor::Red, _) => ("r", Color::Red),
            PieceEntry::Ghost | PieceEntry::Picked => ("?", Color::Yellow),
        };
        queue!(
            stdout,
            MoveTo(x + (pad_left + i) as u16, y),
            SetForegroundColor(fg),
            Print(ch),
            ResetColor
        )?;
    }
    Ok(())
}

/// Draw a single piece entry character with appropriate coloring.
fn draw_piece_entry(
    stdout: &mut impl Write,
    x: u16,
    y: u16,
    entry: &PieceEntry,
    reverse: bool,
) -> io::Result<()> {
    match entry {
        PieceEntry::Piece(color, flash) => {
            let fg = match color {
                PColor::White => Color::White,
                PColor::Red => Color::Red,
            };
            if *flash || reverse {
                queue!(
                    stdout,
                    MoveTo(x, y),
                    SetForegroundColor(fg),
                    SetAttribute(Attribute::Bold),
                    SetAttribute(Attribute::Reverse),
                    Print(PIECE_CHAR),
                    ResetColor,
                    SetAttribute(Attribute::Reset)
                )
            } else {
                queue!(
                    stdout,
                    MoveTo(x, y),
                    SetForegroundColor(fg),
                    SetAttribute(Attribute::Bold),
                    Print(PIECE_CHAR),
                    ResetColor,
                    SetAttribute(Attribute::Reset)
                )
            }
        }
        PieceEntry::Ghost => {
            queue!(
                stdout,
                MoveTo(x, y),
                SetAttribute(Attribute::Dim),
                Print(GHOST_CHAR),
                SetAttribute(Attribute::Reset)
            )
        }
        PieceEntry::Picked => {
            queue!(
                stdout,
                MoveTo(x, y),
                SetForegroundColor(Color::Yellow),
                SetAttribute(Attribute::Bold),
                Print(PIECE_CHAR),
                ResetColor,
                SetAttribute(Attribute::Reset)
            )
        }
    }
}

fn draw_prompt(
    stdout: &mut impl Write,
    p: &mut Panel,
    ui: &AppState,
    session: &Session,
) -> io::Result<()> {
    let (x, y) = (p.x, p.y);
    p.y += 1;
    let state = &session.state;
    let arrow = "\u{25b8} "; // ▸
    let enter_sym = "\u{23ce}"; // ⏎

    match ui.phase {
        Phase::Browse => {
            let (name, fg) = player_name_color(state.to_move());
            let who = if session.ai.is_some() && state.to_move() == session.human {
                format!("Your turn ({name})")
            } else if session.ai.is_some() {
                format!("AI's turn ({name})")
            } else {
                format!("{name}'s turn")
            };
            at_dim(stdout, y, x, arrow)?;
            at_colored_bold(stdout, y, x + 2, &who, fg)?;
            let suffix = " \u{2014} select a piece to move";
            at_dim(stdout, y, x + 2 + who.chars().count() as u16, suffix)?;
        }
        Phase::PickCount => {
            at_dim(stdout, y, x, &format!("{arrow}How many pieces?  "))?;
            let mut cx = x + 20;
            let source = ui.source.unwrap_or(0);
            let valid_counts = valid_pickup_counts(state, source);
            for (idx, n) in (1u8..=3).enumerate() {
                let label = format!("[{n}]");
                if valid_counts.contains(&n) && idx == ui.pick_selection {
                    queue!(
                        stdout,
                        MoveTo(cx, y),
                        SetAttribute(Attribute::Bold),
                        SetAttribute(Attribute::Reverse),
                        Print(&label),
                        SetAttribute(Attribute::Reset)
                    )?;
                } else if valid_counts.contains(&n) {
                    queue!(
                        stdout,
                        MoveTo(cx, y),
                        SetAttribute(Attribute::Bold),
                        Print(&label),
                        SetAttribute(Attribute::Reset)
                    )?;
                } else {
                    at_dim(stdout, y, cx, &label)?;
                }
                cx += 5;
            }
        }
        Phase::Move => {
            at_dim(
                stdout,
                y,
                x,
                &format!("{arrow}Move to destination, {enter_sym} to place"),
            )?;
        }
        Phase::GameOver => {
            if let Some(outcome) = session.outcome() {
                let star = "\u{2605}"; // ★
                let fg = match outcome {
                    Outcome::WinWhite => Color::White,
                    Outcome::WinRed => Color::Red,
                    Outcome::DrawEarned => Color::Yellow,
                };
                let text = format!("{star} {} {star}", session.result_text());
                p.y = y;
                p.text(stdout, &text, Style::Bold(fg))?;
            }
        }
    }
    Ok(())
}

fn draw_score(stdout: &mut impl Write, y: u16, x: u16, state: &GameState) -> io::Result<()> {
    let (w_count, r_count, empty) = count_control(state);

    let cx = x;
    at_colored_bold(stdout, y, cx, "White: ", Color::White)?;
    at_colored_bold(stdout, y, cx + 7, &w_count.to_string(), Color::White)?;
    let cx2 = cx + 7 + w_count.to_string().len() as u16 + 2;
    at_colored_bold(stdout, y, cx2, "Red: ", Color::Red)?;
    at_colored_bold(stdout, y, cx2 + 5, &r_count.to_string(), Color::Red)?;
    let cx3 = cx2 + 5 + r_count.to_string().len() as u16 + 2;
    at_dim(stdout, y, cx3, &format!("Empty: {empty}"))?;
    Ok(())
}

fn draw_keys(stdout: &mut impl Write, p: &mut Panel, ui: &AppState) -> io::Result<()> {
    let keys: &[&str] = if ui.phase == Phase::GameOver {
        &["r restart   q quit"]
    } else {
        &[
            "\u{2191}\u{2193}\u{2190}\u{2192} move   \u{23ce} select   1/2/3 pieces",
            "esc back   h hint   u undo   R redo   q quit",
        ]
    };
    for k in keys {
        p.text(stdout, k, Style::Dim)?;
    }
    Ok(())
}

/// Count cells controlled by each player and empty cells.
fn count_control(state: &GameState) -> (usize, usize, usize) {
    let (mut w, mut r, mut empty) = (0, 0, 0);
    for cell in state.cells().iter() {
        match cell.last() {
            Some(PColor::White) => w += 1,
            Some(PColor::Red) => r += 1,
            None => empty += 1,
        }
    }
    (w, r, empty)
}

fn player_name_color(color: PColor) -> (&'static str, Color) {
    match color {
        PColor::White => ("White", Color::White),
        PColor::Red => ("Red", Color::Red),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression: hidden pieces beyond the cell width vanished without a marker.
    #[test]
    fn every_hidden_piece_is_shown_or_counted() {
        for len in 0..=15 {
            let (shown, more) = hidden_layout(len);
            let counted = more
                .as_deref()
                .map_or(0, |m| m[1..].parse::<usize>().unwrap());
            assert_eq!(shown + counted, len);
            assert!(shown + more.map_or(0, |m| m.len()) <= CELL_WIDTH);
        }
    }
}
