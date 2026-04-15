use pogofish_engine::{
    apply_move as engine_apply, initial_state as engine_initial,
    is_terminal as engine_terminal, legal_moves as engine_legal,
    GameState, Move, RuleSet,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn initial_state() -> JsValue {
    serde_wasm_bindgen::to_value(&engine_initial()).unwrap()
}

#[wasm_bindgen]
pub fn legal_moves(state_js: JsValue) -> JsValue {
    let s: GameState = serde_wasm_bindgen::from_value(state_js).unwrap();
    serde_wasm_bindgen::to_value(&engine_legal(&s)).unwrap()
}

#[wasm_bindgen]
pub fn apply_move(state_js: JsValue, move_js: JsValue) -> Result<JsValue, JsValue> {
    let s: GameState = serde_wasm_bindgen::from_value(state_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let m: Move = serde_wasm_bindgen::from_value(move_js)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let next = engine_apply(&s, m).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(serde_wasm_bindgen::to_value(&next).unwrap())
}

#[wasm_bindgen]
pub fn is_terminal(state_js: JsValue, rules_js: JsValue) -> JsValue {
    let s: GameState = serde_wasm_bindgen::from_value(state_js).unwrap();
    let r: RuleSet = serde_wasm_bindgen::from_value(rules_js).unwrap();
    serde_wasm_bindgen::to_value(&engine_terminal(&s, &r)).unwrap()
}

/// Return the state key as a hex string (for repetition detection in JS).
#[wasm_bindgen]
pub fn state_key(state_js: JsValue) -> String {
    let s: GameState = serde_wasm_bindgen::from_value(state_js).unwrap();
    let key = s.key();
    key.0.iter().map(|b| format!("{b:02x}")).collect()
}

/// Convenience: check terminal with default LC2(50) rules.
#[wasm_bindgen]
pub fn is_terminal_default(state_js: JsValue) -> JsValue {
    let s: GameState = serde_wasm_bindgen::from_value(state_js).unwrap();
    let rules = RuleSet::LC2 { cap: 50 };
    serde_wasm_bindgen::to_value(&engine_terminal(&s, &rules)).unwrap()
}

/// Get the winner from a terminal state using default LC2(50) rules.
/// Returns "W", "R", "Draw", or null.
#[wasm_bindgen]
pub fn winner(state_js: JsValue) -> JsValue {
    let s: GameState = serde_wasm_bindgen::from_value(state_js).unwrap();
    let rules = RuleSet::LC2 { cap: 50 };
    match engine_terminal(&s, &rules) {
        Some(pogofish_engine::Outcome::WinWhite) => JsValue::from_str("W"),
        Some(pogofish_engine::Outcome::WinRed) => JsValue::from_str("R"),
        Some(pogofish_engine::Outcome::DrawEarned) => JsValue::from_str("Draw"),
        None => JsValue::NULL,
    }
}

/// Get the winner from a terminal state with explicit rules.
/// Returns "W", "R", "Draw", or null.
#[wasm_bindgen]
pub fn winner_with_rules(state_js: JsValue, rules_js: JsValue) -> JsValue {
    let s: GameState = serde_wasm_bindgen::from_value(state_js).unwrap();
    let r: RuleSet = serde_wasm_bindgen::from_value(rules_js).unwrap();
    match engine_terminal(&s, &r) {
        Some(pogofish_engine::Outcome::WinWhite) => JsValue::from_str("W"),
        Some(pogofish_engine::Outcome::WinRed) => JsValue::from_str("R"),
        Some(pogofish_engine::Outcome::DrawEarned) => JsValue::from_str("Draw"),
        None => JsValue::NULL,
    }
}
