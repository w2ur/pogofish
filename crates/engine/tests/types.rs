use pogofish_engine::Color;

#[test]
fn color_opponent_is_symmetric() {
    assert_eq!(Color::White.opponent(), Color::Red);
    assert_eq!(Color::Red.opponent(), Color::White);
}

#[test]
fn distances_match_pogo_rules() {
    use pogofish_engine::DISTANCES;
    assert_eq!(DISTANCES[1], &[1]);
    assert_eq!(DISTANCES[2], &[2]);
    assert_eq!(DISTANCES[3], &[1, 3]);
}
