use pogofish_search::checkpoint::{CheckpointConfig, Checkpointer};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[test]
fn checkpointer_fires_on_interval() {
    let calls = Arc::new(AtomicBool::new(false));
    let calls_clone = calls.clone();
    let cp = Checkpointer::spawn(
        CheckpointConfig {
            interval: Duration::from_millis(50),
        },
        move || {
            calls_clone.store(true, Ordering::SeqCst);
        },
    );
    std::thread::sleep(Duration::from_millis(120));
    cp.stop();
    assert!(calls.load(Ordering::SeqCst));
}

#[test]
fn checkpointer_fires_on_manual_request() {
    let calls = Arc::new(AtomicBool::new(false));
    let calls_clone = calls.clone();
    let cp = Checkpointer::spawn(
        CheckpointConfig {
            interval: Duration::from_secs(60), // long interval — won't fire naturally
        },
        move || {
            calls_clone.store(true, Ordering::SeqCst);
        },
    );
    cp.request_checkpoint();
    std::thread::sleep(Duration::from_millis(50));
    cp.stop();
    assert!(calls.load(Ordering::SeqCst));
}

#[test]
fn checkpointer_fires_final_dump_on_stop() {
    let count = Arc::new(AtomicU32::new(0));
    let count_clone = count.clone();
    let cp = Checkpointer::spawn(
        CheckpointConfig {
            interval: Duration::from_secs(60),
        },
        move || {
            count_clone.fetch_add(1, Ordering::SeqCst);
        },
    );
    // No manual request, no interval fire — just stop immediately
    cp.stop();
    // The final dump on stop should have fired at least once
    assert!(count.load(Ordering::SeqCst) >= 1);
}
