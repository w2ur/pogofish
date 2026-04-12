use crossterm::{
    cursor::MoveTo,
    queue,
    style::{
        Attribute, Color, Print, ResetColor, SetAttribute, SetForegroundColor,
    },
    terminal::{Clear, ClearType},
};
use pogofish_engine::{is_terminal, Color as PColor, GameState, Outcome, RuleSet, BOARD_SIZE};
use std::io::{self, Write};

use crate::app::{valid_pickup_counts, AppState, Phase};

// Box-drawing characters
const BOX_TL: &str = "\u{250c}"; // ┌
const BOX_TR: &str = "\u{2510}"; // ┐
const BOX_BL: &str = "\u{2514}"; // └
const BOX_BR: &str = "\u{2518}"; // ┘
const BOX_H: &str = "\u{2500}";  // ─
const BOX_V: &str = "\u{2502}";  // │
const BOX_TJ: &str = "\u{252c}"; // ┬
const BOX_BJ: &str = "\u{2534}"; // ┴
const BOX_LJ: &str = "\u{251c}"; // ├
const BOX_RJ: &str = "\u{2524}"; // ┤
const BOX_X: &str = "\u{253c}";  // ┼

const PIECE_CHAR: &str = "\u{25cf}"; // ●
const GHOST_CHAR: &str = "\u{254c}"; // ╌
const EMPTY_CHAR: &str = "\u{00b7}"; // ·

const TITLE: &str = "P O G O F I S H";
const CELL_WIDTH: usize = 5;
const NUM_CELLS: usize = 9;
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
pub fn draw(
    stdout: &mut io::Stdout,
    state: &GameState,
    ui: &AppState,
    flash_bright: bool,
) -> anyhow::Result<()> {
    queue!(stdout, Clear(ClearType::All))?;

    let x_offset: u16 = 2;
    let mut y: u16 = 1;

    // Title
    draw_title(stdout, y, x_offset)?;
    y += 1;

    // Turn info
    draw_turn_info(stdout, y, x_offset, state, ui.turn_number)?;
    y += 1;

    // Separator
    let grid_width = (CELL_WIDTH + 1) * BOARD + 1;
    draw_separator(stdout, y, x_offset, grid_width)?;
    y += 1;

    // Board
    y = draw_board(stdout, y, x_offset, state, ui, flash_bright)?;
    y += 1; // blank line

    // Separator
    draw_separator(stdout, y, x_offset, grid_width)?;
    y += 1;

    // Prompt
    draw_prompt(stdout, y, x_offset, ui, state)?;
    y += 1;

    // Error
    if !ui.error_msg.is_empty() {
        at_colored_bold(stdout, y, x_offset, &ui.error_msg, Color::Red)?;
        y += 1;
    }

    // Score
    draw_score(stdout, y, x_offset, state)?;
    y += 1;

    // Key hints
    draw_keys(stdout, y, x_offset, ui)?;

    stdout.flush()?;
    Ok(())
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
    Piece(PColor, bool),  // (color, flash_reverse)
    Ghost,
    Picked,               // picked pieces shown at destination (yellow)
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

    // Adaptive cell height
    let max_stack = cells.iter().map(|c| c.len()).max().unwrap_or(0);
    let max_stack = if ui.phase == Phase::Move {
        if let Some(source) = ui.source {
            let np = ui.num_pieces as usize;
            (0..NUM_CELLS)
                .map(|ci| {
                    let mut eff = cells[ci].len();
                    if ci == source {
                        eff = eff.saturating_sub(np);
                    }
                    if ci == ui.cursor {
                        eff += np;
                    }
                    eff
                })
                .max()
                .unwrap_or(max_stack)
        } else {
            max_stack
        }
    } else {
        max_stack
    };
    let cell_height = max_stack.max(3);

    // Determine ghost/picked state
    let ghost_cell = if ui.phase == Phase::Move { ui.source } else { None };
    let ghost_count = if ui.phase == Phase::Move { ui.num_pieces as usize } else { 0 };
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
                let stack_size = entries.len();

                // Bottom-aligned rendering:
                // Row h=0 is the top visual row of the cell.
                // entries[stack_size-1] is the top piece, drawn at h = cell_height - stack_size.
                // entries[0] is the bottom piece, drawn at h = cell_height - 1.
                let piece_row: Option<usize> = {
                    let offset = cell_height.saturating_sub(stack_size);
                    if h >= offset && h < offset + stack_size {
                        // Which entry to show: h - offset = 0 means top piece, so index = stack_size-1 - (h-offset)
                        Some(stack_size - 1 - (h - offset))
                    } else {
                        None
                    }
                };

                let is_cursor = ci == ui.cursor;
                let is_source_cell = matches!(ui.phase, Phase::PickCount | Phase::Move)
                    && ui.source == Some(ci);
                let highlight_cursor =
                    is_cursor && ui.phase != Phase::GameOver;

                if let Some(idx) = piece_row {
                    let entry = &entries[idx];
                    let pad_left = CELL_WIDTH / 2;
                    let pad_right = CELL_WIDTH - pad_left - 1;

                    if highlight_cursor {
                        // Yellow background (reverse) for cursor cell
                        queue!(
                            stdout,
                            MoveTo(cx, y + h as u16),
                            SetForegroundColor(Color::Yellow),
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
                            true,
                        )?;
                        queue!(
                            stdout,
                            MoveTo(cx + pad_left as u16 + 1, y + h as u16),
                            SetForegroundColor(Color::Yellow),
                            SetAttribute(Attribute::Reverse),
                            Print(" ".repeat(pad_right)),
                            ResetColor,
                            SetAttribute(Attribute::Reset)
                        )?;
                    } else if is_source_cell {
                        // Green background for source cell
                        queue!(
                            stdout,
                            MoveTo(cx, y + h as u16),
                            SetForegroundColor(Color::Green),
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
                            false,
                        )?;
                        queue!(
                            stdout,
                            MoveTo(cx + pad_left as u16 + 1, y + h as u16),
                            SetForegroundColor(Color::Green),
                            SetAttribute(Attribute::Reverse),
                            Print(" ".repeat(pad_right)),
                            ResetColor,
                            SetAttribute(Attribute::Reset)
                        )?;
                    } else {
                        at(stdout, y + h as u16, cx, &" ".repeat(pad_left))?;
                        draw_piece_entry(
                            stdout,
                            cx + pad_left as u16,
                            y + h as u16,
                            entry,
                            false,
                        )?;
                        at(stdout, y + h as u16, cx + pad_left as u16 + 1, &" ".repeat(pad_right))?;
                    }
                } else {
                    // Empty row
                    if highlight_cursor {
                        queue!(
                            stdout,
                            MoveTo(cx, y + h as u16),
                            SetForegroundColor(Color::Yellow),
                            SetAttribute(Attribute::Reverse),
                            Print(" ".repeat(CELL_WIDTH)),
                            ResetColor,
                            SetAttribute(Attribute::Reset)
                        )?;
                    } else if is_source_cell {
                        queue!(
                            stdout,
                            MoveTo(cx, y + h as u16),
                            SetForegroundColor(Color::Green),
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
                        at(stdout, y + h as u16, cx + pad_left as u16 + 1, &" ".repeat(pad_right))?;
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
            let centered = format!("{:^width$}", ci, width = CELL_WIDTH);
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
    y: u16,
    x: u16,
    ui: &AppState,
    state: &GameState,
) -> io::Result<()> {
    let arrow = "\u{25b8} "; // ▸
    let enter_sym = "\u{23ce}"; // ⏎

    match ui.phase {
        Phase::Browse => {
            let (name, fg) = player_name_color(state.to_move());
            at_dim(stdout, y, x, arrow)?;
            at_colored_bold(stdout, y, x + 2, &format!("{name}'s turn"), fg)?;
            let suffix = " \u{2014} select a piece to move";
            at_dim(stdout, y, x + 2 + name.len() as u16 + 8, suffix)?;
        }
        Phase::PickCount => {
            at_dim(stdout, y, x, &format!("{arrow}How many pieces?  "))?;
            let mut cx = x + 19;
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
            let rules = RuleSet::LC2 { cap: 50 };
            if let Some(outcome) = is_terminal(state, &rules) {
                let star = "\u{2605}"; // ★
                match outcome {
                    Outcome::WinWhite => {
                        at_colored_bold(stdout, y, x, &format!("{star} White wins! {star}"), Color::White)?;
                    }
                    Outcome::WinRed => {
                        at_colored_bold(stdout, y, x, &format!("{star} Red wins! {star}"), Color::Red)?;
                    }
                    Outcome::DrawEarned => {
                        at_colored_bold(stdout, y, x, &format!("{star} Draw! {star}"), Color::Yellow)?;
                    }
                }
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

fn draw_keys(stdout: &mut impl Write, y: u16, x: u16, ui: &AppState) -> io::Result<()> {
    if ui.phase == Phase::GameOver {
        at_dim(stdout, y, x, "r restart  q quit")
    } else {
        at_dim(
            stdout,
            y,
            x,
            "\u{2191}\u{2193}\u{2190}\u{2192} move  \u{23ce} select  esc back  u undo  R redo  q quit",
        )
    }
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
