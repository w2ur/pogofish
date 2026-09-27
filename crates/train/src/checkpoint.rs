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
