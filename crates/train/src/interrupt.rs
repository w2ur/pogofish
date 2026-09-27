//! Graceful Ctrl+C for long jobs: the first SIGINT sets a flag that the job
//! polls between units of work, so it can save a resumable checkpoint.

use std::sync::atomic::{AtomicBool, Ordering};

static REQUESTED: AtomicBool = AtomicBool::new(false);

extern "C" fn on_sigint(_: libc::c_int) {
    REQUESTED.store(true, Ordering::SeqCst);
}

/// Route SIGINT to the flag instead of killing the process.
pub fn install() {
    unsafe {
        libc::signal(
            libc::SIGINT,
            on_sigint as extern "C" fn(libc::c_int) as libc::sighandler_t,
        );
    }
}

/// True once SIGINT has arrived (or [`request`] was called).
pub fn requested() -> bool {
    REQUESTED.load(Ordering::SeqCst)
}

/// Ask the job to stop at its next check, as SIGINT would.
pub fn request() {
    REQUESTED.store(true, Ordering::SeqCst);
}

/// Clear the flag (tests, or a job that handled the interrupt and resumes).
pub fn reset() {
    REQUESTED.store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sigint_sets_the_flag_without_killing_the_process() {
        install();
        reset();
        assert!(!requested());
        unsafe { libc::raise(libc::SIGINT) };
        assert!(requested());
        reset();
    }
}
