//! Graceful Ctrl+C for the training jobs: `pogofish_search::interrupt`, the
//! workspace's one SIGINT handler. The first SIGINT sets a flag the job
//! polls between iterations, so it can save a resumable checkpoint; a second
//! one exits at once (status 130): the job commits its iterations atomically
//! (`checkpoint::journal`), so this loses at most the iteration in progress.

pub use pogofish_search::interrupt::{install, request, requested, reset};
