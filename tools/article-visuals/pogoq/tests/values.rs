//! Needs the solved table of docs/experiments/v3-solve.md (466 MB, gitignored):
//! `POGOFISH_TABLE=/absolute/path/to/models/v3-solve cargo test -p pogoq -- --ignored`.
//! The path must be absolute: cargo runs tests from the crate directory.

use std::process::Command;

/// The centre opening is White's a1-2-b2: two pieces from a1 onto the centre square b2
/// (engine cells 0 -> 4; docs/experiments/v3-solve.md, "White's 16 first moves": loss in 12
/// plies for White; c1-2-b2 is its mirror). Red, the mover afterwards, wins in 11 plies.
#[test]
#[ignore = "needs the solved table: set POGOFISH_TABLE"]
fn centre_opening_is_win_11() {
    let table = std::env::var("POGOFISH_TABLE")
        .expect("POGOFISH_TABLE must point to the directory holding table.bin");
    let out = Command::new(env!("CARGO_BIN_EXE_pogoq"))
        .args([&table, "values", "[[0,2,4]]"])
        .output()
        .expect("pogoq did not start");
    assert!(
        out.status.success(),
        "pogoq failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    let first = stdout.lines().next().unwrap_or_default();
    assert_eq!(first, "position value for mover: Win(11)");
}
