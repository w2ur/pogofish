use crate::types::Move;

/// Convert a 0–8 cell index (row-major, row 0 at top) to chess-style notation.
/// Columns: a,b,c. Rows: 1 (top) to 3 (bottom).
pub fn cell_to_notation(cell: u8) -> String {
    assert!(cell < 9, "cell index {} out of range", cell);
    let col = (cell % 3) as usize;
    let row = (cell / 3) + 1;
    let col_char = ['a', 'b', 'c'][col];
    format!("{}{}", col_char, row)
}

pub fn notation_to_cell(s: &str) -> Option<u8> {
    let bytes = s.as_bytes();
    if bytes.len() != 2 {
        return None;
    }
    let col = match bytes[0] {
        b'a' => 0,
        b'b' => 1,
        b'c' => 2,
        _ => return None,
    };
    let row = match bytes[1] {
        b'1' => 0,
        b'2' => 1,
        b'3' => 2,
        _ => return None,
    };
    Some(row * 3 + col)
}

pub fn move_to_notation(m: Move) -> String {
    format!(
        "{}-{}-{}",
        cell_to_notation(m.from_cell),
        m.num_pieces,
        cell_to_notation(m.to_cell)
    )
}
