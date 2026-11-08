//! Graceful Ctrl+C for long jobs of this crate, without libtorch: the first
//! SIGINT sets a flag that the job polls between units of work, so it can
//! save a resumable state; a second SIGINT exits at once (status 130). The
//! same pattern as `pogofish-train`'s `interrupt` module.

use std::sync::atomic::{AtomicBool, Ordering};

static REQUESTED: AtomicBool = AtomicBool::new(false);

extern "C" fn on_sigint(_: libc::c_int) {
    if REQUESTED.swap(true, Ordering::SeqCst) {
        // Second Ctrl+C: stop now. _exit is async-signal-safe.
        unsafe { libc::_exit(130) };
    }
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

/// True once SIGINT has arrived.
pub fn requested() -> bool {
    REQUESTED.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sigint_sets_the_flag_without_killing_the_process() {
        install();
        unsafe { libc::raise(libc::SIGINT) };
        assert!(requested());
        REQUESTED.store(false, Ordering::SeqCst);
    }
}
