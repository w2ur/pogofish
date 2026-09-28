//! Saving and loading a `VarStore` as a flat list of named tensors.
//!
//! Loading is strict: the file must hold exactly the variables the store
//! declares, with the same shapes. A lenient loader once let a DQN
//! checkpoint load as an AlphaZero net with its heads left random
//! (see `docs/experiments/v1-verdict.md`, defect 2).

use anyhow::{bail, Context};
use std::collections::BTreeSet;
use std::path::Path;
use tch::{nn, Tensor};

/// Save every variable of `vs` with `Tensor::save_multi` (cross-process
/// compatible, unlike `VarStore::save` in tch-rs 0.17).
pub fn save_var_store(vs: &nn::VarStore, path: &Path) -> anyhow::Result<()> {
    let vars = vs.variables();
    let named: Vec<(&str, &Tensor)> = vars.iter().map(|(k, v)| (k.as_str(), v)).collect();
    Tensor::save_multi(&named, path)
        .with_context(|| format!("saving weights to {}", path.display()))
}

/// Load a file written by [`save_var_store`] into `vs`.
///
/// Errors, without modifying `vs`, if a variable is missing from the file, if
/// the file holds a tensor the store does not declare, or if a shape differs.
pub fn load_var_store_strict(vs: &mut nn::VarStore, path: &Path) -> anyhow::Result<()> {
    let named = Tensor::load_multi(path)
        .with_context(|| format!("reading weights from {}", path.display()))?;
    let mut vars = vs.variables();

    let expected: BTreeSet<&str> = vars.keys().map(String::as_str).collect();
    let found: BTreeSet<&str> = named.iter().map(|(k, _)| k.as_str()).collect();
    let missing: Vec<&str> = expected.difference(&found).copied().collect();
    let unexpected: Vec<&str> = found.difference(&expected).copied().collect();
    if !missing.is_empty() || !unexpected.is_empty() {
        bail!(
            "{} does not match the network: missing {:?}, unexpected {:?}",
            path.display(),
            missing,
            unexpected
        );
    }

    for (name, tensor) in &named {
        let var = &vars[name];
        if var.size() != tensor.size() {
            bail!(
                "{}: tensor {name} has shape {:?}, the network expects {:?}",
                path.display(),
                tensor.size(),
                var.size()
            );
        }
    }

    for (name, tensor) in named {
        let var = vars.get_mut(&name).expect("checked above");
        tch::no_grad(|| var.copy_(&tensor));
    }
    Ok(())
}

/// Crash-safe commit of one training iteration.
///
/// A run's files keep fixed names (`weights.pt`, `state.json`, …). Each file
/// of the iteration is first written as `<name>.tmp` (see [`staged`]); then
/// [`commit`] writes `commit.json` by atomic rename — the commit point — and
/// moves every staged file into place, appends the metrics line, and removes
/// the journal. [`recover`], called before a run is loaded, finishes a commit
/// interrupted after its commit point (roll forward) and deletes staged files
/// of one interrupted before it (roll back). Either way the files on disk
/// belong to one iteration.
pub mod journal {
    use anyhow::Context;
    use serde::{Deserialize, Serialize};
    use std::path::{Path, PathBuf};

    const JOURNAL: &str = "commit.json";

    #[derive(Serialize, Deserialize)]
    struct Journal {
        iteration: u32,
        files: Vec<String>,
        metrics_file: String,
        metrics: serde_json::Value,
    }

    /// Where to write `name` before committing it.
    pub fn staged(dir: &Path, name: &str) -> PathBuf {
        dir.join(format!("{name}.tmp"))
    }

    /// Test hook: `POGOFISH_TEST_CRASH=before-commit:N`, `after-commit:N` or
    /// `mid-apply:N` (after the first file is installed) aborts the process at
    /// that point of iteration N.
    fn crash_point(point: &str, iteration: u32) {
        if std::env::var("POGOFISH_TEST_CRASH").ok().as_deref()
            == Some(&format!("{point}:{iteration}"))
        {
            std::process::abort();
        }
    }

    /// Commit the staged `files` (names relative to `dir`) and the metrics line.
    pub fn commit(
        dir: &Path,
        iteration: u32,
        files: &[String],
        metrics_file: &str,
        metrics: &serde_json::Value,
    ) -> anyhow::Result<()> {
        crash_point("before-commit", iteration);
        let j = Journal {
            iteration,
            files: files.to_vec(),
            metrics_file: metrics_file.into(),
            metrics: metrics.clone(),
        };
        let tmp = dir.join(format!("{JOURNAL}.tmp"));
        std::fs::write(&tmp, serde_json::to_string(&j)?).context("writing the commit journal")?;
        std::fs::rename(&tmp, dir.join(JOURNAL)).context("committing")?;
        crash_point("after-commit", iteration);
        apply(dir, &j)
    }

    fn apply(dir: &Path, j: &Journal) -> anyhow::Result<()> {
        for (k, name) in j.files.iter().enumerate() {
            let from = staged(dir, name);
            if from.exists() {
                std::fs::rename(&from, dir.join(name))
                    .with_context(|| format!("installing {name}"))?;
            }
            if k == 0 {
                crash_point("mid-apply", j.iteration);
            }
        }
        // Append the metrics line unless an earlier attempt already did.
        let path = dir.join(&j.metrics_file);
        let last = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| s.lines().last().map(str::to_string))
            .and_then(|l| serde_json::from_str::<serde_json::Value>(&l).ok())
            .and_then(|v| v["iteration"].as_u64());
        if last.map_or(true, |i| i < j.iteration as u64) {
            crate::metrics::append_metrics(&path, &j.metrics)?;
        }
        std::fs::remove_file(dir.join(JOURNAL)).context("clearing the commit journal")
    }

    /// Make `dir` consistent after a crash: roll a committed iteration
    /// forward, drop the staged files of an uncommitted one.
    pub fn recover(dir: &Path) -> anyhow::Result<()> {
        let path = dir.join(JOURNAL);
        if path.exists() {
            let j: Journal = serde_json::from_str(&std::fs::read_to_string(&path)?)
                .context("reading the commit journal")?;
            apply(dir, &j)?;
        }
        let _ = std::fs::remove_file(dir.join(format!("{JOURNAL}.tmp")));
        for sub in [dir.to_path_buf(), dir.join("checkpoints")] {
            let Ok(entries) = std::fs::read_dir(&sub) else {
                continue;
            };
            for e in entries.flatten() {
                if e.path().extension().is_some_and(|x| x == "tmp") {
                    std::fs::remove_file(e.path())?;
                }
            }
        }
        Ok(())
    }
}
