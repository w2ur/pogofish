use crossterm::{
    event::{self, DisableMouseCapture, Event, KeyCode, KeyEvent, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use pogofish_engine::{Color, GameState, Move, BOARD_SIZE};
use std::io::{self, Write};
use std::path::PathBuf;
use std::time::Duration;

use crate::session::{Opponent, Session};
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
    /// A one-line message (hint, AI move, saved game path).
    pub info_msg: String,
    /// Index into the (1,2,3) tuple during PickCount phase.
    pub pick_selection: usize,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            phase: Phase::Browse,
            cursor: 0,
            source: None,
            num_pieces: 0,
            error_msg: String::new(),
            info_msg: String::new(),
            pick_selection: 0,
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
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

/// What the terminal loop should do after a key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Quit,
    /// A move was played: let the AI answer if it is its turn, then check
    /// for the end of the game.
    Moved,
    Restart,
}

/// Settings chosen on the command line.
#[derive(Debug, Clone)]
pub struct Settings {
    pub human: Color,
    /// None for two humans at the keyboard.
    pub ai_sims: Option<u32>,
    pub hint_sims: u32,
    /// Where finished games are saved; None to not save.
    pub save_dir: Option<PathBuf>,
}

pub struct App {
    pub settings: Settings,
    pub session: Session,
    pub ui: AppState,
    /// The net used for hints (and as the opponent's brain).
    pub helper: Opponent,
}

impl App {
    pub fn new(settings: Settings) -> anyhow::Result<Self> {
        let ai = settings.ai_sims.map(Opponent::bundled).transpose()?;
        Ok(Self {
            session: Session::new(settings.human, ai),
            ui: AppState::new(),
            helper: Opponent::bundled(settings.hint_sims)?,
            settings,
        })
    }

    pub fn restart(&mut self) -> anyhow::Result<()> {
        *self = App::new(self.settings.clone())?;
        Ok(())
    }

    /// Let the AI move if it is its turn, then enter GameOver if the game
    /// ended (saving the record). Returns true if the game just ended.
    pub fn after_move(&mut self) -> bool {
        if let Some(m) = self.session.ai_move() {
            self.ui.info_msg.clear();
            self.ui.cursor = m.to_cell as usize;
        }
        if self.session.outcome().is_some() {
            self.ui.phase = Phase::GameOver;
            if let Some(dir) = &self.settings.save_dir {
                match save_record(dir, &self.session) {
                    Ok(path) => self.ui.info_msg = format!("Game saved to {}", path.display()),
                    Err(e) => self.ui.error_msg = format!("Could not save the game: {e}"),
                }
            }
            return true;
        }
        false
    }

    /// Handle one key press. Pure state change: no drawing, no waiting.
    pub fn on_key(&mut self, key: KeyEvent) -> Flow {
        self.ui.error_msg.clear();
        let state = self.session.state.clone();

        if self.ui.phase == Phase::GameOver {
            return match key.code {
                KeyCode::Char('q') | KeyCode::Esc => Flow::Quit,
                KeyCode::Char('r') => Flow::Restart,
                _ => Flow::Continue,
            };
        }
        if key.code == KeyCode::Char('q') {
            return Flow::Quit;
        }

        // Arrows
        if self.ui.phase == Phase::PickCount {
            match key.code {
                KeyCode::Left => {
                    self.ui.pick_selection = self.ui.pick_selection.saturating_sub(1);
                    return Flow::Continue;
                }
                KeyCode::Right => {
                    self.ui.pick_selection = (self.ui.pick_selection + 1).min(2);
                    return Flow::Continue;
                }
                KeyCode::Up | KeyCode::Down => return Flow::Continue,
                _ => {}
            }
        } else {
            let d = match key.code {
                KeyCode::Up => Some((-1, 0)),
                KeyCode::Down => Some((1, 0)),
                KeyCode::Left => Some((0, -1)),
                KeyCode::Right => Some((0, 1)),
                _ => None,
            };
            if let Some((dr, dc)) = d {
                self.ui.cursor = cursor_move(self.ui.cursor, dr, dc);
                return Flow::Continue;
            }
        }

        match self.ui.phase {
            Phase::Browse => match key.code {
                KeyCode::Enter => {
                    let cursor = self.ui.cursor;
                    let cell = &state.cells()[cursor];
                    if cell.last() == Some(&state.to_move()) {
                        self.ui.source = Some(cursor);
                        self.ui.phase = Phase::PickCount;
                        self.ui.pick_selection = 0;
                    } else {
                        self.ui.error_msg = "Not your piece".to_string();
                    }
                }
                KeyCode::Char('h') => match self.session.compute_hint(&self.helper) {
                    Some((m, v)) => {
                        self.ui.cursor = m.from_cell as usize;
                        self.ui.info_msg = format!(
                            "Hint: {}  \u{2014}  the net rates your position {:+.2} (about {:.0}% to win)",
                            pogofish_engine::notation::move_to_notation(m),
                            v,
                            (v + 1.0) * 50.0
                        );
                    }
                    None => self.ui.error_msg = "No hint: the game is over".into(),
                },
                KeyCode::Char('u') => {
                    if self.session.undo() {
                        self.ui.info_msg = "Undone".into();
                    } else {
                        self.ui.error_msg = "Nothing to undo".to_string();
                    }
                }
                KeyCode::Char('R') | KeyCode::Char('r')
                    if key.modifiers.contains(KeyModifiers::SHIFT) =>
                {
                    if self.session.redo() {
                        self.ui.info_msg = "Redone".into();
                    } else {
                        self.ui.error_msg = "Nothing to redo".to_string();
                    }
                }
                _ => {}
            },
            Phase::PickCount => {
                let Some(source) = self.ui.source else {
                    self.ui.phase = Phase::Browse;
                    return Flow::Continue;
                };
                let chosen = match key.code {
                    KeyCode::Esc => {
                        self.ui.phase = Phase::Browse;
                        self.ui.source = None;
                        self.ui.pick_selection = 0;
                        return Flow::Continue;
                    }
                    KeyCode::Enter => Some(self.ui.pick_selection as u8 + 1),
                    KeyCode::Char(c @ '1'..='3') => c.to_digit(10).map(|d| d as u8),
                    _ => None,
                };
                if let Some(n) = chosen {
                    if valid_pickup_counts(&state, source).contains(&n) {
                        self.ui.num_pieces = n;
                        self.ui.phase = Phase::Move;
                        self.ui.cursor = source;
                        self.ui.pick_selection = 0;
                    } else {
                        let piece_word = if n == 1 { "piece" } else { "pieces" };
                        self.ui.error_msg = format!("Cannot pick {n} {piece_word} here");
                    }
                }
            }
            Phase::Move => {
                let Some(source) = self.ui.source else {
                    self.ui.phase = Phase::Browse;
                    return Flow::Continue;
                };
                match key.code {
                    KeyCode::Esc => {
                        self.ui.phase = Phase::Browse;
                        self.ui.source = None;
                        self.ui.num_pieces = 0;
                    }
                    KeyCode::Enter => {
                        let mv = Move {
                            from_cell: source as u8,
                            num_pieces: self.ui.num_pieces,
                            to_cell: self.ui.cursor as u8,
                        };
                        match self.session.play(mv) {
                            Ok(()) => {
                                self.ui.source = None;
                                self.ui.num_pieces = 0;
                                self.ui.phase = Phase::Browse;
                                self.ui.info_msg.clear();
                                return Flow::Moved;
                            }
                            Err(e) => self.ui.error_msg = e.to_string(),
                        }
                    }
                    _ => {}
                }
            }
            Phase::GameOver => {}
        }
        Flow::Continue
    }
}

/// Save the game record as JSON in `dir`; returns the file's path.
pub fn save_record(dir: &std::path::Path, session: &Session) -> anyhow::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let path = dir.join(format!("game-{stamp}.json"));
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&session.record())? + "\n",
    )?;
    Ok(path)
}

pub fn run(settings: Settings) -> anyhow::Result<()> {
    let mut app = App::new(settings)?;
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    execute!(stdout, crossterm::cursor::Hide)?;

    let result = game_loop(&mut stdout, &mut app);

    disable_raw_mode()?;
    execute!(stdout, LeaveAlternateScreen, DisableMouseCapture)?;
    execute!(stdout, crossterm::cursor::Show)?;
    result
}

fn game_loop(stdout: &mut io::Stdout, app: &mut App) -> anyhow::Result<()> {
    // The AI opens when the human plays Red.
    think_and_move(stdout, app)?;
    loop {
        ui::draw(stdout, app, false)?;
        let key = match event::read()? {
            Event::Key(k) => k,
            _ => continue,
        };
        match app.on_key(key) {
            Flow::Quit => return Ok(()),
            Flow::Restart => {
                app.restart()?;
                think_and_move(stdout, app)?;
            }
            Flow::Moved => think_and_move(stdout, app)?,
            Flow::Continue => {}
        }
    }
}

fn think_and_move(stdout: &mut io::Stdout, app: &mut App) -> anyhow::Result<()> {
    if app.session.is_ai_turn() {
        app.ui.info_msg = "AI is thinking\u{2026}".into();
        ui::draw(stdout, app, false)?;
    }
    if app.after_move() {
        victory_animation(stdout, app)?;
    }
    Ok(())
}

fn victory_animation(stdout: &mut impl Write, app: &App) -> anyhow::Result<()> {
    for i in 0..6 {
        ui::draw(stdout, app, i % 2 == 0)?;
        if event::poll(Duration::from_millis(200))? {
            let _ = event::read();
        }
    }
    ui::draw(stdout, app, false)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crossterm::event::KeyEventKind;
    use pogofish_engine::{is_terminal, legal_moves};

    fn key(code: KeyCode) -> KeyEvent {
        KeyEvent::new_with_kind(code, KeyModifiers::NONE, KeyEventKind::Press)
    }

    fn app(human: Color) -> App {
        App::new(Settings {
            human,
            ai_sims: Some(10),
            hint_sims: 10,
            save_dir: None,
        })
        .unwrap()
    }

    /// Drive the cursor to `cell` with arrow keys.
    fn go_to(a: &mut App, cell: usize) {
        for _ in 0..3 {
            a.on_key(key(KeyCode::Up));
            a.on_key(key(KeyCode::Left));
        }
        for _ in 0..cell / 3 {
            a.on_key(key(KeyCode::Down));
        }
        for _ in 0..cell % 3 {
            a.on_key(key(KeyCode::Right));
        }
        assert_eq!(a.ui.cursor, cell);
    }

    /// Play a move with keys only, as a person would.
    fn play_by_keys(a: &mut App, m: Move) -> Flow {
        go_to(a, m.from_cell as usize);
        assert_eq!(a.on_key(key(KeyCode::Enter)), Flow::Continue);
        assert_eq!(a.ui.phase, Phase::PickCount);
        let digit = char::from_digit(m.num_pieces as u32, 10).unwrap();
        a.on_key(key(KeyCode::Char(digit)));
        assert_eq!(a.ui.phase, Phase::Move);
        go_to(a, m.to_cell as usize);
        a.on_key(key(KeyCode::Enter))
    }

    /// Headless end-to-end: a whole game against the AI played through key
    /// events, drawn into a buffer at every step.
    #[test]
    fn a_whole_game_through_the_keyboard() {
        for human in [Color::White, Color::Red] {
            let mut a = app(human);
            a.after_move(); // the AI opens if the human is Red
            let mut screen = Vec::new();
            let mut plies = 0;
            while a.ui.phase != Phase::GameOver {
                plies += 1;
                assert!(plies < 500, "game did not end");
                assert_eq!(a.session.state.to_move(), human);
                let m = legal_moves(&a.session.state)[0];
                assert_eq!(play_by_keys(&mut a, m), Flow::Moved);
                a.after_move();
                screen.clear();
                ui::draw(&mut screen, &a, false).unwrap();
            }
            assert!(is_terminal(&a.session.state, &crate::session::RULES).is_some());
            let text = String::from_utf8_lossy(&screen);
            assert!(text.contains("wins"), "the game-over line is drawn");
            assert_eq!(a.on_key(key(KeyCode::Char('r'))), Flow::Restart);
        }
    }

    #[test]
    fn the_hint_key_moves_the_cursor_to_a_legal_move() {
        let mut a = app(Color::White);
        a.on_key(key(KeyCode::Char('h')));
        let (m, _) = a.session.hint.expect("hint");
        assert_eq!(a.ui.cursor, m.from_cell as usize);
        assert!(a.ui.info_msg.starts_with("Hint:"));
        let mut screen = Vec::new();
        ui::draw(&mut screen, &a, false).unwrap();
        assert!(String::from_utf8_lossy(&screen).contains("Hint:"));
    }

    #[test]
    fn selecting_an_opponent_stack_is_refused() {
        let mut a = app(Color::White);
        go_to(&mut a, 8);
        a.on_key(key(KeyCode::Enter));
        assert_eq!(a.ui.phase, Phase::Browse);
        assert_eq!(a.ui.error_msg, "Not your piece");
    }

    #[test]
    fn after_the_ai_moves_its_move_and_estimate_stay_on_screen() {
        let mut a = app(Color::White);
        let m = legal_moves(&a.session.state)[0];
        play_by_keys(&mut a, m);
        a.after_move();
        a.on_key(key(KeyCode::Char('h')));
        let mut screen = Vec::new();
        ui::draw(&mut screen, &a, false).unwrap();
        let text = String::from_utf8_lossy(&screen);
        assert!(text.contains("AI played"), "the AI's move survives a hint");
        assert!(text.contains("% to win"));
        assert!(text.contains("Hint:"));
        for name in ["a1", "b2", "c3"] {
            assert!(text.contains(name), "board labelled in notation: {name}");
        }
    }

    #[test]
    fn finished_games_are_saved() {
        let dir = std::env::temp_dir().join(format!("pogofish-cli-{}", std::process::id()));
        let mut a = App::new(Settings {
            human: Color::White,
            ai_sims: Some(10),
            hint_sims: 10,
            save_dir: Some(dir.clone()),
        })
        .unwrap();
        while a.ui.phase != Phase::GameOver {
            let m = legal_moves(&a.session.state)[0];
            play_by_keys(&mut a, m);
            a.after_move();
        }
        assert!(
            a.ui.info_msg.starts_with("Game saved to"),
            "{}",
            a.ui.info_msg
        );
        let files: Vec<_> = std::fs::read_dir(&dir).unwrap().collect();
        assert_eq!(files.len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// A minimal terminal: applies cursor moves (`ESC[row;colH`), skips other
    /// escape sequences, and returns the screen as lines.
    fn render(a: &App) -> Vec<String> {
        let mut buf = Vec::new();
        ui::draw(&mut buf, a, false).unwrap();
        let text = String::from_utf8(buf).unwrap();
        let mut grid = vec![vec![' '; 120]; 60];
        let (mut r, mut c) = (0usize, 0usize);
        let mut chars = text.chars().peekable();
        while let Some(ch) = chars.next() {
            if ch == '\x1b' {
                let mut seq = String::new();
                for n in chars.by_ref() {
                    if n.is_ascii_alphabetic() {
                        seq.push(n);
                        break;
                    }
                    seq.push(n);
                }
                if let Some(body) = seq.strip_prefix('[').and_then(|b| b.strip_suffix('H')) {
                    let mut it = body.split(';').map(|v| v.parse::<usize>().unwrap_or(1));
                    r = it.next().unwrap_or(1) - 1;
                    c = it.next().unwrap_or(1) - 1;
                }
            } else if r < 60 && c < 120 {
                grid[r][c] = ch;
                c += 1;
            }
        }
        grid.into_iter()
            .map(|l| l.into_iter().collect::<String>().trim_end().to_string())
            .collect()
    }

    fn board_bottom(lines: &[String]) -> usize {
        lines
            .iter()
            .position(|l| l.contains('\u{2514}'))
            .expect("bottom border")
    }

    /// The board keeps one height whatever the stacks (the owner found the
    /// changing height hard to play with), and a stack taller than a cell
    /// lists its hidden lower pieces as text, bottom to top.
    #[test]
    fn the_board_height_is_fixed_and_hidden_pieces_are_listed() {
        use pogofish_engine::{testing::position, Cell};
        let mut a = app(Color::White);
        let start = board_bottom(&render(&a));

        let (w, r) = (Color::White, Color::Red);
        let mut cells: [Cell; 9] = std::array::from_fn(|_| Vec::new());
        cells[4] = vec![w, w, r, w, r, r, w, r, w]; // 9 pieces: 5 shown, 4 hidden
        cells[0] = vec![r, w, r];
        a.session.state = position(cells, w, 0);
        let lines = render(&a);
        assert_eq!(board_bottom(&lines), start, "same height as the start");
        assert!(
            lines
                .iter()
                .any(|l| l.contains("\u{2502}   \u{00b7}   \u{2502} wwrw  \u{2502}")),
            "hidden pieces w w r w, bottom to top, in the bottom row of b2: {lines:#?}"
        );
    }
}
