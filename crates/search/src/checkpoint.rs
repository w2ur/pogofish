use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy)]
pub struct CheckpointConfig {
    pub interval: Duration,
}

pub struct Checkpointer {
    stop: Arc<AtomicBool>,
    requested: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl Checkpointer {
    pub fn spawn<F>(cfg: CheckpointConfig, mut dump: F) -> Self
    where
        F: FnMut() + Send + 'static,
    {
        let stop = Arc::new(AtomicBool::new(false));
        let requested = Arc::new(AtomicBool::new(false));
        let stop_c = stop.clone();
        let requested_c = requested.clone();

        let handle = thread::spawn(move || {
            let mut last_dump = Instant::now();
            loop {
                if stop_c.load(Ordering::SeqCst) {
                    break;
                }
                thread::sleep(Duration::from_millis(10));

                let should_dump = requested_c.swap(false, Ordering::SeqCst)
                    || last_dump.elapsed() >= cfg.interval;

                if should_dump {
                    dump();
                    last_dump = Instant::now();
                }
            }
            // Final dump on stop
            dump();
        });

        Self {
            stop,
            requested,
            handle: Some(handle),
        }
    }

    pub fn request_checkpoint(&self) {
        self.requested.store(true, Ordering::SeqCst);
    }

    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}
