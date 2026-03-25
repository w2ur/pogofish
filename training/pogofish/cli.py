"""
Curses-based CLI for Pogo.

Usage:
    python -m pogofish          # curses UI
    python -m pogofish --ascii  # plain text fallback

Controls (curses mode):
    Arrow keys: move cursor
    Enter: select / confirm
    1/2/3: pick piece count
    Esc: cancel
    u: undo
    R (shift): redo
    q: quit
"""

from __future__ import annotations

import curses
import sys
import time
from enum import Enum, auto
from typing import NamedTuple

from pogofish.engine import (
    BOARD_SIZE,
    GameState,
    Move,
    R,
    W,
    apply_move,
    initial_state,
    is_terminal,
    legal_moves,
    winner,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE

PIECE_CHAR = "\u25cf"  # ●
GHOST_CHAR = "\u254c"  # ╌
EMPTY_CHAR = "\u00b7"  # ·

# Box-drawing characters
BOX_TL = "\u250c"  # ┌
BOX_TR = "\u2510"  # ┐
BOX_BL = "\u2514"  # └
BOX_BR = "\u2518"  # ┘
BOX_H = "\u2500"   # ─
BOX_V = "\u2502"   # │
BOX_TJ = "\u252c"  # ┬
BOX_BJ = "\u2534"  # ┴
BOX_LJ = "\u251c"  # ├
BOX_RJ = "\u2524"  # ┤
BOX_X = "\u253c"   # ┼

CELL_WIDTH = 5  # inner width of each cell in characters

TITLE = "P O G O F I S H"

# Color pair IDs
CP_DEFAULT = 0
CP_WHITE_PIECE = 1
CP_RED_PIECE = 2
CP_CURSOR = 3
CP_PICKED = 4
CP_DIM = 5
CP_ERROR = 6
CP_TITLE = 7
CP_GREEN = 8


# ---------------------------------------------------------------------------
# Phase state machine
# ---------------------------------------------------------------------------

class Phase(Enum):
    BROWSE = auto()
    PICK_COUNT = auto()
    MOVE = auto()
    GAME_OVER = auto()
    REPLAY = auto()


class UIState(NamedTuple):
    """Snapshot of UI state (immutable for clarity, rebuilt each tick)."""
    phase: Phase
    cursor: int          # cell index 0-8
    source: int          # selected source cell (-1 if none)
    num_pieces: int      # picked count (0 if not yet picked)
    error_msg: str       # transient error message
    turn_number: int
    pick_selection: int  # index into valid_counts list during PICK_COUNT phase


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def cell_row_col(cell: int) -> tuple[int, int]:
    return divmod(cell, BOARD_SIZE)


def cursor_move(cursor: int, dr: int, dc: int) -> int:
    """Move cursor by (dr, dc), clamping to grid edges."""
    r, c = cell_row_col(cursor)
    r = max(0, min(BOARD_SIZE - 1, r + dr))
    c = max(0, min(BOARD_SIZE - 1, c + dc))
    return r * BOARD_SIZE + c


def count_control(state: GameState) -> tuple[int, int, int]:
    """Return (white_cells, red_cells, empty_cells)."""
    w_count = 0
    r_count = 0
    empty = 0
    for cell in state.board:
        if not cell:
            empty += 1
        elif cell[-1] == W:
            w_count += 1
        else:
            r_count += 1
    return w_count, r_count, empty


def valid_pickup_counts(state: GameState, cell_idx: int) -> list[int]:
    """Return which of [1,2,3] are valid pickup counts from cell_idx.

    The top piece must be the current player's color. If so, any count
    up to the stack size is valid regardless of the colors below.
    """
    player = state.current_player
    stack = state.board[cell_idx]
    if not stack or stack[-1] != player:
        return []
    return [n for n in (1, 2, 3) if len(stack) >= n]


# ---------------------------------------------------------------------------
# Curses rendering
# ---------------------------------------------------------------------------

def _init_colors() -> None:
    """Set up curses color pairs."""
    curses.start_color()
    curses.use_default_colors()
    # CP_DEFAULT = 0 is automatic
    curses.init_pair(CP_WHITE_PIECE, curses.COLOR_WHITE, -1)
    curses.init_pair(CP_RED_PIECE, curses.COLOR_RED, -1)
    curses.init_pair(CP_CURSOR, curses.COLOR_YELLOW, -1)
    curses.init_pair(CP_PICKED, curses.COLOR_YELLOW, -1)
    curses.init_pair(CP_DIM, curses.COLOR_WHITE, -1)
    curses.init_pair(CP_ERROR, curses.COLOR_RED, -1)
    curses.init_pair(CP_TITLE, curses.COLOR_CYAN, -1)
    curses.init_pair(CP_GREEN, curses.COLOR_GREEN, -1)


def _safe_addstr(
    scr: curses.window,
    y: int,
    x: int,
    text: str,
    attr: int = 0,
) -> None:
    """Write string to screen, silently ignoring out-of-bounds writes."""
    max_y, max_x = scr.getmaxyx()
    if y < 0 or y >= max_y or x < 0:
        return
    # Truncate to fit
    available = max_x - x
    if available <= 0:
        return
    if len(text) > available:
        text = text[:available]
    try:
        scr.addstr(y, x, text, attr)
    except curses.error:
        pass


def _draw_title(scr: curses.window, y: int, x: int) -> int:
    """Draw the title line. Returns next y."""
    _safe_addstr(scr, y, x, TITLE, curses.color_pair(CP_TITLE) | curses.A_BOLD)
    return y + 1


def _draw_turn_info(
    scr: curses.window,
    y: int,
    x: int,
    state: GameState,
    turn_number: int,
) -> int:
    """Draw turn info line. Returns next y."""
    # White indicator
    w_attr = curses.color_pair(CP_WHITE_PIECE) | curses.A_BOLD
    r_attr = curses.color_pair(CP_RED_PIECE) | curses.A_BOLD
    dim = curses.color_pair(CP_DIM)

    cx = x
    if state.current_player == W:
        _safe_addstr(scr, y, cx, PIECE_CHAR + " White", w_attr | curses.A_UNDERLINE)
    else:
        _safe_addstr(scr, y, cx, PIECE_CHAR + " White", w_attr)
    cx += 8
    _safe_addstr(scr, y, cx, " vs ", dim)
    cx += 4
    if state.current_player == R:
        _safe_addstr(scr, y, cx, PIECE_CHAR + " Red", r_attr | curses.A_UNDERLINE)
    else:
        _safe_addstr(scr, y, cx, PIECE_CHAR + " Red", r_attr)
    cx += 6
    _safe_addstr(scr, y, cx, f"    Turn {turn_number}", dim)
    return y + 1


def _draw_separator(scr: curses.window, y: int, x: int, width: int) -> int:
    """Draw a dim horizontal separator. Returns next y."""
    _safe_addstr(scr, y, x, BOX_H * width, curses.color_pair(CP_DIM))
    return y + 1


def _draw_board(
    scr: curses.window,
    y: int,
    x: int,
    state: GameState,
    ui: UIState,
    flash_bright: bool = False,
) -> int:
    """
    Draw the 3x3 board with adaptive cell height.
    Returns next y after the board (including index row).
    """
    board = state.board
    dim = curses.color_pair(CP_DIM)

    # Compute adaptive cell height: max(tallest_stack, 3)
    max_stack = max((len(cell) for cell in board), default=0)

    # In MOVE phase, the destination preview adds pieces on top
    if ui.phase == Phase.MOVE and ui.source >= 0 and ui.num_pieces > 0:
        for ci in range(TOTAL_CELLS):
            effective_len = len(board[ci])
            if ci == ui.source:
                effective_len -= ui.num_pieces
            if ci == ui.cursor:
                effective_len += ui.num_pieces
            if effective_len > max_stack:
                max_stack = effective_len

    cell_height = max(max_stack, 3)

    # Determine ghost cells and picked pieces
    ghost_cell = -1
    ghost_count = 0
    picked_pieces: tuple[str, ...] = ()
    if ui.phase == Phase.MOVE and ui.source >= 0 and ui.num_pieces > 0:
        ghost_cell = ui.source
        ghost_count = ui.num_pieces
        picked_pieces = board[ui.source][-ui.num_pieces:]

    # Build cell contents: list of (piece_char, color_pair, extra_attr) per cell
    # Each cell is a list from bottom to top
    cell_contents: list[list[tuple[str, int]]] = []
    for ci in range(TOTAL_CELLS):
        stack = list(board[ci])
        entries: list[tuple[str, int]] = []

        if ci == ghost_cell:
            # Remove the picked pieces from visual stack, replace with ghosts
            remaining = stack[:-ghost_count] if ghost_count else stack
            for p in remaining:
                attr = (curses.color_pair(CP_WHITE_PIECE) | curses.A_BOLD) if p == W else (curses.color_pair(CP_RED_PIECE) | curses.A_BOLD)
                if flash_bright:
                    attr |= curses.A_REVERSE
                entries.append((PIECE_CHAR, attr))
            for _ in range(ghost_count):
                entries.append((GHOST_CHAR, dim))
        else:
            for p in stack:
                attr = (curses.color_pair(CP_WHITE_PIECE) | curses.A_BOLD) if p == W else (curses.color_pair(CP_RED_PIECE) | curses.A_BOLD)
                if flash_bright and stack:
                    attr |= curses.A_REVERSE
                entries.append((PIECE_CHAR, attr))

        # If this is the cursor in MOVE phase, add picked pieces on top
        if ui.phase == Phase.MOVE and ci == ui.cursor and picked_pieces:
            for p in picked_pieces:
                entries.append((PIECE_CHAR, curses.color_pair(CP_PICKED) | curses.A_BOLD))

        cell_contents.append(entries)

    # Draw the grid
    # Top border
    top_line = BOX_TL + (BOX_H * CELL_WIDTH + BOX_TJ) * (BOARD_SIZE - 1) + BOX_H * CELL_WIDTH + BOX_TR
    _safe_addstr(scr, y, x, top_line, dim)
    y += 1

    for row in range(BOARD_SIZE):
        # Draw cell_height rows for this grid row
        for h in range(cell_height):
            cx = x
            for col in range(BOARD_SIZE):
                ci = row * BOARD_SIZE + col
                _safe_addstr(scr, y + h, cx, BOX_V, dim)
                cx += 1

                entries = cell_contents[ci]
                stack_size = len(entries)
                # Bottom-aligned: top of stack at top of cell area.
                # Reverse index so entries[-1] (top piece) is drawn at lowest
                # visual row (highest y), and entries[0] (bottom) at the top.
                piece_row = h - (cell_height - stack_size)
                if 0 <= piece_row < stack_size:
                    piece_row = stack_size - 1 - piece_row

                # Determine if this cell is highlighted (cursor)
                is_cursor_cell = (ci == ui.cursor)
                is_source_cell = (ui.phase in (Phase.PICK_COUNT, Phase.MOVE) and ci == ui.source)

                if 0 <= piece_row < stack_size:
                    char, attr = entries[piece_row]
                    # Center the piece character in the cell
                    pad_left = CELL_WIDTH // 2
                    pad_right = CELL_WIDTH - pad_left - 1
                    if is_cursor_cell and ui.phase != Phase.GAME_OVER:
                        bg_attr = curses.color_pair(CP_CURSOR) | curses.A_REVERSE
                        _safe_addstr(scr, y + h, cx, " " * pad_left, bg_attr)
                        _safe_addstr(scr, y + h, cx + pad_left, char, attr | curses.A_REVERSE if is_cursor_cell else attr)
                        _safe_addstr(scr, y + h, cx + pad_left + 1, " " * pad_right, bg_attr)
                    elif is_source_cell:
                        bg_attr = curses.color_pair(CP_GREEN)
                        _safe_addstr(scr, y + h, cx, " " * pad_left, bg_attr)
                        _safe_addstr(scr, y + h, cx + pad_left, char, attr)
                        _safe_addstr(scr, y + h, cx + pad_left + 1, " " * pad_right, bg_attr)
                    else:
                        _safe_addstr(scr, y + h, cx, " " * pad_left, 0)
                        _safe_addstr(scr, y + h, cx + pad_left, char, attr)
                        _safe_addstr(scr, y + h, cx + pad_left + 1, " " * pad_right, 0)
                else:
                    # Empty row in this cell
                    if is_cursor_cell and ui.phase != Phase.GAME_OVER:
                        bg_attr = curses.color_pair(CP_CURSOR) | curses.A_REVERSE
                        _safe_addstr(scr, y + h, cx, " " * CELL_WIDTH, bg_attr)
                    elif is_source_cell:
                        bg_attr = curses.color_pair(CP_GREEN)
                        _safe_addstr(scr, y + h, cx, " " * CELL_WIDTH, bg_attr)
                    elif h == cell_height - 1 and stack_size == 0:
                        # Bottom of empty cell: show dot
                        pad_left = CELL_WIDTH // 2
                        pad_right = CELL_WIDTH - pad_left - 1
                        _safe_addstr(scr, y + h, cx, " " * pad_left, 0)
                        _safe_addstr(scr, y + h, cx + pad_left, EMPTY_CHAR, dim)
                        _safe_addstr(scr, y + h, cx + pad_left + 1, " " * pad_right, 0)
                    else:
                        _safe_addstr(scr, y + h, cx, " " * CELL_WIDTH, 0)

                cx += CELL_WIDTH

            # Right border
            _safe_addstr(scr, y + h, cx, BOX_V, dim)

        y += cell_height

        # Row separator or bottom border
        if row < BOARD_SIZE - 1:
            sep = BOX_LJ + (BOX_H * CELL_WIDTH + BOX_X) * (BOARD_SIZE - 1) + BOX_H * CELL_WIDTH + BOX_RJ
            _safe_addstr(scr, y, x, sep, dim)
        else:
            bot = BOX_BL + (BOX_H * CELL_WIDTH + BOX_BJ) * (BOARD_SIZE - 1) + BOX_H * CELL_WIDTH + BOX_BR
            _safe_addstr(scr, y, x, bot, dim)
        y += 1

    # Cell index labels below the grid
    idx_line = " "
    for col in range(BOARD_SIZE):
        # For each column, show the 3 row indices vertically? No — show all 9 as column headers
        pass

    # Show indices for each row below the grid
    for row in range(BOARD_SIZE):
        cx = x + 1
        label_parts: list[str] = []
        for col in range(BOARD_SIZE):
            ci = row * BOARD_SIZE + col
            # Center index in CELL_WIDTH + 1 (for separator)
            label_parts.append(str(ci).center(CELL_WIDTH))
            if col < BOARD_SIZE - 1:
                label_parts.append(" ")
        _safe_addstr(scr, y, x + 1, "".join(label_parts), dim)
        y += 1

    return y


def _draw_prompt(
    scr: curses.window,
    y: int,
    x: int,
    ui: UIState,
    state: GameState,
) -> int:
    """Draw the action prompt. Returns next y."""
    dim = curses.color_pair(CP_DIM)
    bold = curses.A_BOLD

    if ui.phase == Phase.BROWSE:
        player_name = "White" if state.current_player == W else "Red"
        p_attr = (curses.color_pair(CP_WHITE_PIECE) | bold) if state.current_player == W else (curses.color_pair(CP_RED_PIECE) | bold)
        _safe_addstr(scr, y, x, "\u25b8 ", dim)
        _safe_addstr(scr, y, x + 2, f"{player_name}'s turn", p_attr)
        _safe_addstr(scr, y, x + 2 + len(f"{player_name}'s turn"), " \u2014 select a piece to move", dim)

    elif ui.phase == Phase.PICK_COUNT:
        _safe_addstr(scr, y, x, "\u25b8 How many pieces?  ", dim)
        cx = x + 19
        valid_counts = valid_pickup_counts(state, ui.source)
        for idx, n in enumerate((1, 2, 3)):
            if n in valid_counts and idx == ui.pick_selection:
                _safe_addstr(scr, y, cx, f"[{n}]", bold | curses.A_REVERSE)
            elif n in valid_counts:
                _safe_addstr(scr, y, cx, f"[{n}]", bold)
            else:
                _safe_addstr(scr, y, cx, f"[{n}]", dim)
            cx += 5

    elif ui.phase == Phase.MOVE:
        _safe_addstr(scr, y, x, "\u25b8 Move to destination, \u23ce to place", dim)

    elif ui.phase == Phase.GAME_OVER:
        w = winner(state)
        if w is not None:
            name = "White" if w == W else "Red"
            attr = (curses.color_pair(CP_WHITE_PIECE) | bold) if w == W else (curses.color_pair(CP_RED_PIECE) | bold)
            _safe_addstr(scr, y, x, "\u2605 ", attr)
            _safe_addstr(scr, y, x + 2, f"{name} wins!", attr)
            _safe_addstr(scr, y, x + 2 + len(f"{name} wins!") + 1, "\u2605", attr)

    return y + 1


def _draw_score(
    scr: curses.window,
    y: int,
    x: int,
    state: GameState,
) -> int:
    """Draw score line. Returns next y."""
    w_count, r_count, empty = count_control(state)
    dim = curses.color_pair(CP_DIM)
    w_attr = curses.color_pair(CP_WHITE_PIECE) | curses.A_BOLD
    r_attr = curses.color_pair(CP_RED_PIECE) | curses.A_BOLD

    cx = x
    _safe_addstr(scr, y, cx, "White: ", w_attr)
    cx += 7
    _safe_addstr(scr, y, cx, str(w_count), w_attr)
    cx += len(str(w_count)) + 2
    _safe_addstr(scr, y, cx, "Red: ", r_attr)
    cx += 5
    _safe_addstr(scr, y, cx, str(r_count), r_attr)
    cx += len(str(r_count)) + 2
    _safe_addstr(scr, y, cx, f"Empty: {empty}", dim)
    return y + 1


def _draw_keys(
    scr: curses.window,
    y: int,
    x: int,
    ui: UIState,
) -> int:
    """Draw key hints. Returns next y."""
    dim = curses.color_pair(CP_DIM)
    if ui.phase == Phase.GAME_OVER:
        _safe_addstr(scr, y, x, "r restart  q quit", dim)
    else:
        _safe_addstr(scr, y, x, "\u2191\u2193\u2190\u2192 move  \u23ce select  esc back  u undo  R redo  q quit", dim)
    return y + 1


def _draw_error(
    scr: curses.window,
    y: int,
    x: int,
    msg: str,
) -> int:
    """Draw error message if any. Returns next y."""
    if msg:
        _safe_addstr(scr, y, x, msg, curses.color_pair(CP_ERROR) | curses.A_BOLD)
        return y + 1
    return y


def _full_draw(
    scr: curses.window,
    state: GameState,
    ui: UIState,
    flash_bright: bool = False,
) -> None:
    """Full screen redraw."""
    scr.erase()
    max_y, max_x = scr.getmaxyx()

    x_offset = 2
    y = 1

    y = _draw_title(scr, y, x_offset)
    y = _draw_turn_info(scr, y, x_offset, state, ui.turn_number)
    grid_width = (CELL_WIDTH + 1) * BOARD_SIZE + 1
    y = _draw_separator(scr, y, x_offset, grid_width)
    y = _draw_board(scr, y, x_offset, state, ui, flash_bright)
    y += 1  # blank line
    y = _draw_separator(scr, y, x_offset, grid_width)
    y = _draw_prompt(scr, y, x_offset, ui, state)
    y = _draw_error(scr, y, x_offset, ui.error_msg)
    y = _draw_score(scr, y, x_offset, state)
    y = _draw_keys(scr, y, x_offset, ui)

    scr.refresh()


# ---------------------------------------------------------------------------
# Victory animation
# ---------------------------------------------------------------------------

def _victory_animation(scr: curses.window, state: GameState, ui: UIState) -> None:
    """Flash the board 3 times to celebrate the win."""
    for i in range(6):
        bright = (i % 2 == 0)
        _full_draw(scr, state, ui, flash_bright=bright)
        scr.timeout(200)
        try:
            scr.getch()  # drain input during animation
        except curses.error:
            pass
    scr.timeout(-1)  # back to blocking
    _full_draw(scr, state, ui, flash_bright=False)


# ---------------------------------------------------------------------------
# Main curses loop
# ---------------------------------------------------------------------------

def _curses_main(scr: curses.window) -> None:
    """Main game loop inside curses.wrapper."""
    _init_colors()
    curses.curs_set(0)  # hide cursor
    scr.keypad(True)
    scr.nodelay(False)

    state = initial_state()
    history: list[GameState] = []
    redo_stack: list[GameState] = []
    turn_number = 1

    phase = Phase.BROWSE
    cursor = 0
    source = -1
    num_pieces = 0
    error_msg = ""
    pick_selection = 0  # index into the (1,2,3) tuple during PICK_COUNT

    def make_ui() -> UIState:
        return UIState(
            phase=phase,
            cursor=cursor,
            source=source,
            num_pieces=num_pieces,
            error_msg=error_msg,
            turn_number=turn_number,
            pick_selection=pick_selection,
        )

    while True:
        ui = make_ui()
        _full_draw(scr, state, ui)

        key = scr.getch()

        # Handle resize
        if key == curses.KEY_RESIZE:
            scr.clear()
            continue

        error_msg = ""

        # --- GAME OVER phase ---
        if phase == Phase.GAME_OVER:
            if key == ord("q"):
                return
            if key == ord("r"):
                state = initial_state()
                history = []
                redo_stack = []
                turn_number = 1
                phase = Phase.BROWSE
                cursor = 0
                source = -1
                num_pieces = 0
            continue

        # --- Global quit ---
        if key == ord("q"):
            return

        # --- PICK_COUNT phase handles its own arrows ---
        if phase == Phase.PICK_COUNT:
            if key == curses.KEY_LEFT:
                pick_selection = max(0, pick_selection - 1)
                continue
            if key == curses.KEY_RIGHT:
                pick_selection = min(2, pick_selection + 1)
                continue
            # Up/down ignored in PICK_COUNT — fall through to phase handler below
            if key in (curses.KEY_UP, curses.KEY_DOWN):
                continue

        # --- Arrow keys (BROWSE and MOVE phases) ---
        elif key == curses.KEY_UP:
            cursor = cursor_move(cursor, -1, 0)
            continue
        elif key == curses.KEY_DOWN:
            cursor = cursor_move(cursor, 1, 0)
            continue
        elif key == curses.KEY_LEFT:
            cursor = cursor_move(cursor, 0, -1)
            continue
        elif key == curses.KEY_RIGHT:
            cursor = cursor_move(cursor, 0, 1)
            continue

        # --- BROWSE phase ---
        if phase == Phase.BROWSE:
            if key in (curses.KEY_ENTER, ord("\n"), ord("\r")):
                cell = state.board[cursor]
                if cell and cell[-1] == state.current_player:
                    counts = valid_pickup_counts(state, cursor)
                    if counts:
                        source = cursor
                        phase = Phase.PICK_COUNT
                        pick_selection = 0
                    else:
                        error_msg = "No valid pickups from this cell"
                else:
                    error_msg = "Not your piece"

            elif key == ord("u"):
                if history:
                    redo_stack.append(state)
                    state = history.pop()
                    turn_number = max(1, turn_number - 1)
                else:
                    error_msg = "Nothing to undo"

            elif key == ord("R"):
                if redo_stack:
                    history.append(state)
                    state = redo_stack.pop()
                    turn_number += 1
                else:
                    error_msg = "Nothing to redo"

            continue

        # --- PICK_COUNT phase ---
        if phase == Phase.PICK_COUNT:
            if key == 27:  # Esc
                phase = Phase.BROWSE
                source = -1
                pick_selection = 0
                continue

            options = (1, 2, 3)

            # Enter confirms the currently highlighted option
            if key in (curses.KEY_ENTER, ord("\n"), ord("\r")):
                n = options[pick_selection]
                counts = valid_pickup_counts(state, source)
                if n in counts:
                    num_pieces = n
                    phase = Phase.MOVE
                    cursor = source
                    pick_selection = 0
                else:
                    error_msg = f"Cannot pick {n} piece{'s' if n > 1 else ''} here"

            # Number keys still work as direct shortcuts
            elif key in (ord("1"), ord("2"), ord("3")):
                n = key - ord("0")
                counts = valid_pickup_counts(state, source)
                if n in counts:
                    num_pieces = n
                    phase = Phase.MOVE
                    cursor = source
                    pick_selection = 0
                else:
                    error_msg = f"Cannot pick {n} piece{'s' if n > 1 else ''} here"
            continue

        # --- MOVE phase ---
        if phase == Phase.MOVE:
            if key == 27:  # Esc
                phase = Phase.BROWSE
                source = -1
                num_pieces = 0
                continue

            if key in (curses.KEY_ENTER, ord("\n"), ord("\r")):
                move = Move(from_cell=source, num_pieces=num_pieces, to_cell=cursor)
                valid = legal_moves(state)
                if move in valid:
                    history.append(state)
                    redo_stack.clear()
                    state = apply_move(state, move)
                    turn_number += 1
                    source = -1
                    num_pieces = 0

                    if is_terminal(state):
                        phase = Phase.GAME_OVER
                        ui = make_ui()
                        _victory_animation(scr, state, ui)
                    else:
                        phase = Phase.BROWSE
                else:
                    error_msg = "Invalid move \u2014 check distance rules"
            continue


# ---------------------------------------------------------------------------
# ASCII fallback
# ---------------------------------------------------------------------------

def _render_cell_ascii(cell: tuple[str, ...]) -> str:
    if not cell:
        return "  .  "
    return " " + "".join(cell).ljust(4)


def _render_board_ascii(state: GameState) -> str:
    lines: list[str] = []
    lines.append("")
    lines.append(f"  Turn: {state.current_player} ({'White' if state.current_player == W else 'Red'})")
    lines.append("")
    lines.append("      col 0   col 1   col 2")
    lines.append("    +-------+-------+-------+")

    for row in range(BOARD_SIZE):
        cells = []
        for col in range(BOARD_SIZE):
            idx = row * BOARD_SIZE + col
            cells.append(_render_cell_ascii(state.board[idx]))
        line = f"  {row} |{cells[0]}  |{cells[1]}  |{cells[2]}  |"
        lines.append(line)
        indices = []
        for col in range(BOARD_SIZE):
            idx = row * BOARD_SIZE + col
            indices.append(f"  [{idx}]  ")
        lines.append(f"    |{indices[0]}|{indices[1]}|{indices[2]}|")
        lines.append("    +-------+-------+-------+")

    lines.append("")
    return "\n".join(lines)


def _parse_move_ascii(raw: str, valid_moves: list[Move]) -> Move | None:
    parts = raw.strip().split()
    if len(parts) != 3:
        return None
    try:
        from_cell, num_p, to_cell = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        return None
    move = Move(from_cell=from_cell, num_pieces=num_p, to_cell=to_cell)
    if move in valid_moves:
        return move
    return None


def _ascii_main() -> None:
    """Plain-text fallback mode."""
    state = initial_state()

    print("\n=== P O G O F I S H ===")
    print("Move format: FROM NUM_PIECES TO  (e.g., '0 1 3')")
    print("Commands: 'moves' = list legal moves, 'q' = quit\n")

    while not is_terminal(state):
        print(_render_board_ascii(state))
        moves = legal_moves(state)

        while True:
            try:
                raw = input(f"  {state.current_player}> ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nGoodbye!")
                return

            if raw.lower() == "q":
                print("Goodbye!")
                return

            if raw.lower() == "moves":
                print(f"  Legal moves ({len(moves)}):")
                for m in moves:
                    print(f"    {m.from_cell} {m.num_pieces} {m.to_cell}")
                continue

            move = _parse_move_ascii(raw, moves)
            if move is None:
                print("  Invalid move. Type 'moves' to see legal moves.")
                continue

            state = apply_move(state, move)
            break

    print(_render_board_ascii(state))
    w = winner(state)
    print(f"  Game over! {w} ({'White' if w == W else 'Red'}) wins!\n")


# ---------------------------------------------------------------------------
# Replay mode
# ---------------------------------------------------------------------------


def _load_sample_games(path: str) -> list[dict]:
    """Load sample games from JSON file."""
    import json
    from pathlib import Path

    p = Path(path)
    if not p.exists():
        print(f"Error: {path} not found")
        sys.exit(1)

    with open(p) as f:
        return json.load(f)


def _replay_build_states(game: dict) -> list[GameState]:
    """Build the sequence of board states from a recorded game."""
    from pogofish.encoding import key_to_state, key_to_move

    states = []
    if game["moves"]:
        # First state from the first move's state field.
        states.append(key_to_state(game["moves"][0]["state"]))
        for move_record in game["moves"]:
            state = key_to_state(move_record["state"])
            move = key_to_move(move_record["move"])
            next_state = apply_move(state, move)
            states.append(next_state)
    else:
        states.append(initial_state())

    return states


def _replay_curses_main(scr: curses.window, games: list[dict]) -> None:
    """Replay mode: step through recorded games."""
    _init_colors()
    curses.curs_set(0)
    scr.keypad(True)
    scr.nodelay(False)

    game_idx = 0
    move_idx = 0

    while True:
        game = games[game_idx]
        states = _replay_build_states(game)
        state = states[min(move_idx, len(states) - 1)]

        # Build a UIState for rendering (no interaction, just display).
        ui = UIState(
            phase=Phase.REPLAY,
            cursor=-1,
            source=-1,
            num_pieces=0,
            error_msg="",
            turn_number=move_idx + 1,
            pick_selection=0,
        )

        scr.erase()
        max_y, max_x = scr.getmaxyx()
        x_offset = 2
        y = 1

        dim = curses.color_pair(CP_DIM)
        bold = curses.A_BOLD

        # Title
        _safe_addstr(scr, y, x_offset, "P O G O F I S H  —  Replay", curses.color_pair(CP_TITLE) | bold)
        y += 1

        # Game info
        ep = game.get("episode", "?")
        result = game.get("result", "?")
        total_moves = game.get("num_moves", len(game.get("moves", [])))
        _safe_addstr(scr, y, x_offset, f"Game {game_idx + 1}/{len(games)}   Episode {ep}   Result: {result}", dim)
        y += 1

        # Turn info
        grid_width = (CELL_WIDTH + 1) * BOARD_SIZE + 1
        y = _draw_separator(scr, y, x_offset, grid_width)

        # Player indicator
        if not is_terminal(state):
            p_name = "White" if state.current_player == W else "Red"
            p_attr = (curses.color_pair(CP_WHITE_PIECE) | bold) if state.current_player == W else (curses.color_pair(CP_RED_PIECE) | bold)
            _safe_addstr(scr, y, x_offset, f"{p_name}'s turn", p_attr)
            _safe_addstr(scr, y, x_offset + len(f"{p_name}'s turn") + 2, f"Move {move_idx}/{total_moves}", dim)
        else:
            w = winner(state)
            if w:
                name = "White" if w == W else "Red"
                attr = (curses.color_pair(CP_WHITE_PIECE) | bold) if w == W else (curses.color_pair(CP_RED_PIECE) | bold)
                _safe_addstr(scr, y, x_offset, f"{name} wins!", attr)
            else:
                _safe_addstr(scr, y, x_offset, "Draw", dim)
            _safe_addstr(scr, y, x_offset + 15, f"Move {move_idx}/{total_moves}", dim)
        y += 1

        y = _draw_board(scr, y, x_offset, state, ui)
        y += 1
        y = _draw_separator(scr, y, x_offset, grid_width)

        # Show what move was played (if not at the last position).
        if move_idx < len(game.get("moves", [])):
            move_record = game["moves"][move_idx]
            move_str = move_record["move"]
            player = move_record["player"]
            p_attr = (curses.color_pair(CP_WHITE_PIECE) | bold) if player == W else (curses.color_pair(CP_RED_PIECE) | bold)
            _safe_addstr(scr, y, x_offset, "Next: ", dim)
            _safe_addstr(scr, y, x_offset + 6, f"{player} plays {move_str}", p_attr)
            y += 1
        else:
            _safe_addstr(scr, y, x_offset, "End of game", dim)
            y += 1

        # Controls
        y += 1
        _safe_addstr(scr, y, x_offset, "\u2192 next move   \u2190 prev move   n next game   p prev game   q quit", dim)

        scr.refresh()

        # Input
        key = scr.getch()

        if key == curses.KEY_RESIZE:
            scr.clear()
            continue

        if key == ord("q"):
            return

        if key == curses.KEY_RIGHT or key == ord(" "):
            if move_idx < len(game.get("moves", [])):
                move_idx += 1

        elif key == curses.KEY_LEFT:
            if move_idx > 0:
                move_idx -= 1

        elif key == ord("n"):
            if game_idx < len(games) - 1:
                game_idx += 1
                move_idx = 0

        elif key == ord("p"):
            if game_idx > 0:
                game_idx -= 1
                move_idx = 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """Launch the Pogo CLI. Uses curses by default, --ascii for fallback."""
    import argparse

    parser = argparse.ArgumentParser(description="Pogofish CLI")
    parser.add_argument("--ascii", action="store_true", help="Plain text fallback mode")
    parser.add_argument("--replay", type=str, metavar="PATH", help="Replay sample games from JSON file")
    args, _ = parser.parse_known_args()

    if args.replay:
        games = _load_sample_games(args.replay)
        print(f"Loaded {len(games)} games from {args.replay}")
        try:
            curses.wrapper(lambda scr: _replay_curses_main(scr, games))
        except curses.error:
            print("Curses initialization failed.")
        return

    if args.ascii:
        _ascii_main()
        return

    try:
        curses.wrapper(_curses_main)
    except curses.error:
        print("Curses initialization failed. Falling back to ASCII mode.")
        _ascii_main()


if __name__ == "__main__":
    main()
