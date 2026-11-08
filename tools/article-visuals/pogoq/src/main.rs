// Queries the solved Pogo table: per-move values after a prefix, or a perfect line.
use pogofish_search::retro::{decode, load_table, Game, Status, Value};
fn child_val(g: &Game, t: &[u16], b: &pogofish_search::retro::Board) -> Value { decode(t[g.rank(b) as usize]) }
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let dir = std::path::Path::new(&a[1]); let mode = a[2].as_str();
    let prefix: Vec<(u8, u8, u8)> = serde_json::from_str(&a[3]).unwrap();
    let max: usize = a.get(4).map(|s| s.parse().unwrap()).unwrap_or(60);
    let g = Game::published();
    let (t, _, done) = load_table(&dir.join("table.bin"), g.size()).unwrap(); assert!(done);
    let mut b = g.start();
    for &(f, k, to) in &prefix { assert!(g.moves(&b).contains(&(f, k, to)), "illegal {f} {k} {to}"); b = b.moved(f as usize, k, to as usize); }
    println!("position value for mover: {:?}", child_val(&g, &t, &b));
    if mode == "values" {
        for (f, k, to) in g.moves(&b) { let c = b.moved(f as usize, k, to as usize); println!("{f} {k} {to} -> opponent {:?}", child_val(&g, &t, &c)); }
        return;
    }
    if mode == "trace" {
        let mut p = g.start(); let all = prefix.clone();
        for i in 0..=all.len() { let ms = g.moves(&p); let lose_moves = ms.iter().filter(|m| matches!(child_val(&g, &t, &p.moved(m.0 as usize, m.1, m.2 as usize)), Value::Win(_))).count();
            println!("TRACE {} {} {:?} moves={} to_opp_win={}", i, if p.red_to_move {"R"} else {"W"}, child_val(&g, &t, &p), ms.len(), lose_moves);
            if i < all.len() { let m = all[i]; p = p.moved(m.0 as usize, m.1, m.2 as usize); } }
        return;
    }
    if mode == "narrow" {
        let mut front = vec![(b, prefix.clone())];
        for _ in 0..max { let mut next = vec![]; for (p, l) in front { let ms = g.moves(&p); let keep: Vec<_> = ms.iter().filter(|m| matches!(child_val(&g, &t, &p.moved(m.0 as usize, m.1, m.2 as usize)), Value::Draw)).cloned().collect();
            if keep.len() == 1 { println!("NARROW {} keep {:?} of {}", serde_json::to_string(&l).unwrap(), keep[0], ms.len()); }
            for m in keep { let mut l2 = l.clone(); l2.push(m); next.push((p.moved(m.0 as usize, m.1, m.2 as usize), l2)); } } front = next; }
        return;
    }
    let mut line = prefix.clone();
    for _ in 0..max {
        if b.status() != Status::Live { break; }
        let v = child_val(&g, &t, &b);
        let mut best: Option<((u8, u8, u8), i32)> = None;
        for (f, k, to) in g.moves(&b) {
            let c = b.moved(f as usize, k, to as usize);
            let score = match (v, child_val(&g, &t, &c)) {
                (Value::Win(_), Value::Loss(d)) => 100000 - d as i32,
                (Value::Loss(_), Value::Win(d)) => d as i32,
                (Value::Draw, Value::Draw) => 1,
                (_, Value::Over) => -1,
                _ => continue,
            };
            if !matches!(best, Some((_, s)) if score <= s) { best = Some(((f, k, to), score)); }
        }
        let (m, _) = best.expect("no move"); line.push(m); b = b.moved(m.0 as usize, m.1, m.2 as usize);
    }
    println!("LINE {}", serde_json::to_string(&line).unwrap());
    println!("final status {:?}", b.status());
}
